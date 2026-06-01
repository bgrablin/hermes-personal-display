#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_ID="${1:-$(date +%Y%m%d-%H%M%S)}"
OUT="$ROOT/docs/thermal-review/cpu-policy-ab-$RUN_ID"
SETTLE_SECONDS="${THERMAL_AB_SETTLE_SECONDS:-300}"
GPU_TOP_SECONDS="${THERMAL_AB_GPU_TOP_SECONDS:-30}"
mkdir -p "$OUT"

NO_TURBO_PATH="/sys/devices/system/cpu/intel_pstate/no_turbo"
MAX_PERF_PATH="/sys/devices/system/cpu/intel_pstate/max_perf_pct"
MIN_PERF_PATH="/sys/devices/system/cpu/intel_pstate/min_perf_pct"

read_sys() { local p="$1"; [ -e "$p" ] && cat "$p" || true; }
ORIG_NO_TURBO="$(read_sys "$NO_TURBO_PATH")"
ORIG_MAX_PERF="$(read_sys "$MAX_PERF_PATH")"
ORIG_MIN_PERF="$(read_sys "$MIN_PERF_PATH")"

write_sys() {
  local p="$1" v="$2"
  if [ -e "$p" ]; then
    printf '%s' "$v" | sudo tee "$p" >/dev/null
  fi
}

restore_policy() {
  [ -n "${ORIG_NO_TURBO:-}" ] && write_sys "$NO_TURBO_PATH" "$ORIG_NO_TURBO" || true
  [ -n "${ORIG_MAX_PERF:-}" ] && write_sys "$MAX_PERF_PATH" "$ORIG_MAX_PERF" || true
  [ -n "${ORIG_MIN_PERF:-}" ] && write_sys "$MIN_PERF_PATH" "$ORIG_MIN_PERF" || true
}

trap 'echo "ABORT: restoring CPU policy" | tee -a "$OUT/run.log"; restore_policy' INT TERM ERR

pkg_temp_from_sensors() {
  sensors 2>/dev/null | awk '/Package id 0:/ {print $4; exit}'
}

capture_throttle_counts() {
  local dest="$1"
  {
    date --iso-8601=seconds
    for f in /sys/devices/system/cpu/cpu*/thermal_throttle/*_throttle_count; do
      [ -e "$f" ] && printf '%s=%s\n' "$f" "$(cat "$f")"
    done
  } > "$dest" 2>/dev/null || true
}

capture_policy_state() {
  local dest="$1"
  {
    date --iso-8601=seconds
    for f in "$NO_TURBO_PATH" "$MAX_PERF_PATH" "$MIN_PERF_PATH" /sys/devices/system/cpu/cpufreq/policy*/scaling_governor /sys/devices/system/cpu/cpufreq/policy*/scaling_cur_freq /sys/devices/system/cpu/cpufreq/policy*/scaling_max_freq; do
      [ -e "$f" ] && printf '%s=%s\n' "$f" "$(cat "$f")"
    done
    awk -F: '/cpu MHz/ {gsub(/^[ \t]+/, "", $2); print "cpu_mhz=" $2}' /proc/cpuinfo
  } > "$dest" 2>/dev/null || true
}

summarize_sensors() {
  sensors > "$1/sensors.txt" || true
  awk '
    /Package id 0:/ {pkg=$4}
    /Core 0:/ {c0=$3}
    /Core 1:/ {c1=$3}
    /pch_skylake/ {p=1; next}
    p && /temp1:/ {pch=$2; p=0}
    /jc42-i2c/ {j=1; next}
    j && /temp1:/ {mem=$2; j=0}
    END {printf "pkg=%s core0=%s core1=%s pch=%s mem=%s\n", pkg,c0,c1,pch,mem}
  ' "$1/sensors.txt" > "$1/sensors-summary.txt" || true
}

profile_name=()
profile_no_turbo=()
profile_max_perf=()
add_profile() { profile_name+=("$1"); profile_no_turbo+=("$2"); profile_max_perf+=("$3"); }

add_profile C0-current "$ORIG_NO_TURBO" "$ORIG_MAX_PERF"
add_profile C1-no-turbo 1 "$ORIG_MAX_PERF"
add_profile C2-current-repeat "$ORIG_NO_TURBO" "$ORIG_MAX_PERF"
add_profile C3-max-perf-80 "$ORIG_NO_TURBO" 80
add_profile C9-current-final "$ORIG_NO_TURBO" "$ORIG_MAX_PERF"

capture_profile() {
  local name="$1" no_turbo="$2" max_perf="$3"
  local dir="$OUT/$name"
  mkdir -p "$dir"
  printf '\n=== %s %s no_turbo=%s max_perf_pct=%s ===\n' "$(date --iso-8601=seconds)" "$name" "$no_turbo" "$max_perf" | tee -a "$OUT/run.log"

  write_sys "$MAX_PERF_PATH" "$max_perf"
  write_sys "$NO_TURBO_PATH" "$no_turbo"
  capture_policy_state "$dir/policy-before-settle.txt"
  capture_throttle_counts "$dir/throttle-before.txt"
  sleep "$SETTLE_SECONDS"
  capture_policy_state "$dir/policy-after-settle.txt"

  {
    date --iso-8601=seconds
    "$ROOT/scripts/hermes-display" verify
    DISPLAY=:0 xrandr --listactivemonitors
    DISPLAY=:0 xrandr --query | grep -E '^(DP-1|DP-2|HDMI-1)' || true
    pgrep -af '[c]hrom.*character-runtime-v2' | head -1 || true
  } > "$dir/verify.txt" 2>&1

  if ! grep -q 'OK live Chromium URL' "$dir/verify.txt" || ! grep -q 'OK DP-2 layout' "$dir/verify.txt"; then
    echo "VERIFY_FAIL $name" | tee -a "$OUT/run.log"
    return 1
  fi

  "$ROOT/scripts/hermes-display" screenshot > "$dir/screenshot-path.txt" 2>&1 || true
  summarize_sensors "$dir"
  capture_throttle_counts "$dir/throttle-after.txt"

  GPU_PID="$(pgrep -f 'chrome --type=gpu-process' | head -1 || true)"
  echo "GPU_PID=$GPU_PID" > "$dir/gpu-pid.txt"
  if [ -n "$GPU_PID" ]; then
    ps -L -p "$GPU_PID" -o pid,tid,psr,etime,%cpu,%mem,comm,args --sort=-%cpu | head -15 > "$dir/gpu-thread-ps.txt" || true
  fi
  ps -eo pid,ppid,pcpu,pmem,comm,args --sort=-pcpu | awk 'NR==1 || /chrome|chromium|Xorg|openbox|hermes-display/ {print}' | head -40 > "$dir/processes.txt" || true
  sudo timeout "${GPU_TOP_SECONDS}s" intel_gpu_top -s 1000 > "$dir/intel-gpu-top.txt" 2>&1 || true
  journalctl -k --since "${SETTLE_SECONDS} seconds ago" --no-pager | grep -iE 'thermal|thrott|temperature|pstate|cpu' > "$dir/kernel-thermal.log" || true

  python3 - "$dir" "$name" <<'PY' | tee "$dir/summary.txt" | tee -a "$OUT/summary.tsv" >/dev/null
import pathlib, re, sys, math
p=pathlib.Path(sys.argv[1]); name=sys.argv[2]
sens=(p/'sensors-summary.txt').read_text(errors='ignore').strip()
policy=(p/'policy-after-settle.txt').read_text(errors='ignore').replace('\n',';')
ps=(p/'gpu-thread-ps.txt').read_text(errors='ignore') if (p/'gpu-thread-ps.txt').exists() else ''
gpu_cpu=''
for line in ps.splitlines()[1:2]:
    parts=line.split(None, 7)
    if len(parts)>=5: gpu_cpu=parts[4]
procs=(p/'processes.txt').read_text(errors='ignore') if (p/'processes.txt').exists() else ''
chrome_total=0.0
xorg_cpu=0.0
for line in procs.splitlines()[1:]:
    cols=line.split(None,5)
    if len(cols) < 5: continue
    try: cpu=float(cols[2])
    except Exception: continue
    if 'chrome' in line or 'chromium' in line:
        chrome_total += cpu
    if 'Xorg' in line:
        xorg_cpu += cpu

gpu_top=(p/'intel-gpu-top.txt').read_text(errors='ignore') if (p/'intel-gpu-top.txt').exists() else ''
rows=[]
for line in gpu_top.splitlines():
    parts=line.split()
    if len(parts) >= 20 and re.match(r'^\d+(?:\.\d+)?$', parts[0]):
        try:
            rows.append({'freq_act':float(parts[1]), 'rc6':float(parts[3]), 'gpu_w':float(parts[4]), 'pkg_w':float(parts[5]), 'render3d':float(parts[8])})
        except Exception:
            pass

def avg(key):
    return sum(r[key] for r in rows)/len(rows) if rows else float('nan')
def mx(key):
    return max((r[key] for r in rows), default=float('nan'))

gpu_summary=(f"render3d_avg={avg('render3d'):.1f} render3d_max={mx('render3d'):.1f} rc6_avg={avg('rc6'):.1f} "
             f"freq_act_avg={avg('freq_act'):.0f} gpu_w_avg={avg('gpu_w'):.2f} pkg_w_avg={avg('pkg_w'):.2f}")
print(f"{name}\tgpu_thread_cpu={gpu_cpu}\tchrome_total_cpu={chrome_total:.1f}\txorg_cpu={xorg_cpu:.1f}\t{gpu_summary}\t{sens}\tpolicy={policy}")
PY
}

{
  echo -e "profile\tgpu_thread_cpu\tchrome_total_cpu\txorg_cpu\tgpu_top\tsensors\tpolicy"
} > "$OUT/summary.tsv"

printf 'run_id=%s\nsettle_seconds=%s\ngpu_top_seconds=%s\nout=%s\norig_no_turbo=%s\norig_max_perf_pct=%s\norig_min_perf_pct=%s\n' \
  "$RUN_ID" "$SETTLE_SECONDS" "$GPU_TOP_SECONDS" "$OUT" "$ORIG_NO_TURBO" "$ORIG_MAX_PERF" "$ORIG_MIN_PERF" > "$OUT/run-info.txt"

for i in "${!profile_name[@]}"; do
  capture_profile "${profile_name[$i]}" "${profile_no_turbo[$i]}" "${profile_max_perf[$i]}"
done

echo "RESTORE_CPU_POLICY" | tee -a "$OUT/run.log"
restore_policy
sleep 10
capture_policy_state "$OUT/final-policy.txt"
"$ROOT/scripts/hermes-display" verify > "$OUT/final-verify.txt" 2>&1 || true
"$ROOT/scripts/hermes-display" screenshot > "$OUT/final-screenshot-path.txt" 2>&1 || true

echo "DONE $OUT" | tee -a "$OUT/run.log"
