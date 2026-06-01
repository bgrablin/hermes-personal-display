#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DROPIN="/etc/systemd/system/hermes-personal-display-minix.service.d/20-chromium-flags.conf"
RUN_ID="${1:-$(date +%Y%m%d-%H%M%S)}"
OUT="$ROOT/docs/thermal-review/chromium-flag-ab-$RUN_ID"
SETTLE_SECONDS="${THERMAL_AB_SETTLE_SECONDS:-300}"
GPU_TOP_SECONDS="${THERMAL_AB_GPU_TOP_SECONDS:-30}"
mkdir -p "$OUT"

BASE_FLAGS='--touch-events=enabled --enable-features=OverlayScrollbar --disable-background-networking --disable-sync --disable-renderer-backgrounding --disable-background-timer-throttling --force-device-scale-factor=1 --enable-gpu-rasterization --enable-zero-copy --enable-oop-rasterization --ignore-gpu-blocklist --no-default-browser-check --disable-default-apps --disable-component-update --disable-domain-reliability'

write_dropin() {
  local flags="$1"
  sudo install -d -m 0755 "$(dirname "$DROPIN")"
  printf '[Service]\n# Temporary Chromium thermal A/B profile. Restore baseline by rerunning this script cleanup or writing P0.\nEnvironment="PERSONAL_DISPLAY_CHROME_ARGS=%s"\n' "$flags" | sudo tee "$DROPIN" >/dev/null
  sudo systemctl daemon-reload
}

restore_baseline() {
  if [ -f "${OUT:-}/original-dropin.conf" ]; then
    sudo cp "$OUT/original-dropin.conf" "$DROPIN" || true
    sudo systemctl daemon-reload || true
    sudo systemctl restart hermes-personal-display-minix.service || true
  else
    write_dropin "$BASE_FLAGS" || true
    sudo systemctl restart hermes-personal-display-minix.service || true
  fi
}

trap 'echo "ABORT: restoring baseline" | tee -a "$OUT/run.log"; restore_baseline' INT TERM ERR

profile_name=()
profile_flags=()
add_profile() { profile_name+=("$1"); profile_flags+=("$2"); }

add_profile P0-current "$BASE_FLAGS"
add_profile P1-no-ignore-gpu-blocklist '--touch-events=enabled --enable-features=OverlayScrollbar --disable-background-networking --disable-sync --disable-renderer-backgrounding --disable-background-timer-throttling --force-device-scale-factor=1 --enable-gpu-rasterization --enable-zero-copy --enable-oop-rasterization --no-default-browser-check --disable-default-apps --disable-component-update --disable-domain-reliability'
add_profile P2-no-zero-copy '--touch-events=enabled --enable-features=OverlayScrollbar --disable-background-networking --disable-sync --disable-renderer-backgrounding --disable-background-timer-throttling --force-device-scale-factor=1 --enable-gpu-rasterization --enable-oop-rasterization --no-default-browser-check --disable-default-apps --disable-component-update --disable-domain-reliability'
add_profile P3-no-oop-raster '--touch-events=enabled --enable-features=OverlayScrollbar --disable-background-networking --disable-sync --disable-renderer-backgrounding --disable-background-timer-throttling --force-device-scale-factor=1 --enable-gpu-rasterization --enable-zero-copy --no-default-browser-check --disable-default-apps --disable-component-update --disable-domain-reliability'
add_profile P4-gpu-raster-only '--touch-events=enabled --enable-features=OverlayScrollbar --disable-background-networking --disable-sync --disable-renderer-backgrounding --disable-background-timer-throttling --force-device-scale-factor=1 --enable-gpu-rasterization --no-default-browser-check --disable-default-apps --disable-component-update --disable-domain-reliability'
add_profile P5-no-forced-gpu-raster-flags '--touch-events=enabled --enable-features=OverlayScrollbar --disable-background-networking --disable-sync --disable-renderer-backgrounding --disable-background-timer-throttling --force-device-scale-factor=1 --no-default-browser-check --disable-default-apps --disable-component-update --disable-domain-reliability'
add_profile P6-zero-copy-only '--touch-events=enabled --enable-features=OverlayScrollbar --disable-background-networking --disable-sync --disable-renderer-backgrounding --disable-background-timer-throttling --force-device-scale-factor=1 --enable-zero-copy --no-default-browser-check --disable-default-apps --disable-component-update --disable-domain-reliability'
add_profile P9-current-repeat "$BASE_FLAGS"

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

capture_profile() {
  local name="$1" flags="$2"
  local dir="$OUT/$name"
  mkdir -p "$dir"
  printf '\n=== %s %s ===\n' "$(date --iso-8601=seconds)" "$name" | tee -a "$OUT/run.log"
  printf '%s\n' "$flags" > "$dir/flags.txt"
  write_dropin "$flags"
  sudo systemctl restart hermes-personal-display-minix.service
  sleep "$SETTLE_SECONDS"

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

  GPU_PID="$(pgrep -f 'chrome --type=gpu-process' | head -1 || true)"
  echo "GPU_PID=$GPU_PID" > "$dir/gpu-pid.txt"
  if [ -n "$GPU_PID" ]; then
    ps -L -p "$GPU_PID" -o pid,tid,psr,etime,%cpu,%mem,comm,args --sort=-%cpu | head -15 > "$dir/gpu-thread-ps.txt" || true
  fi
  ps -eo pid,ppid,pcpu,pmem,comm,args --sort=-pcpu | awk 'NR==1 || /chrome|chromium|Xorg|openbox/ {print}' | head -30 > "$dir/processes.txt" || true
  sudo timeout "${GPU_TOP_SECONDS}s" intel_gpu_top -s 1000 > "$dir/intel-gpu-top.txt" 2>&1 || true
  journalctl -k --since "${SETTLE_SECONDS} seconds ago" --no-pager | grep -iE 'thermal|thrott|temperature|pstate|cpu' > "$dir/kernel-thermal.log" || true

  python3 - "$dir" "$name" <<'PY' | tee "$dir/summary.txt" | tee -a "$OUT/summary.tsv" >/dev/null
import pathlib, re, sys
p=pathlib.Path(sys.argv[1]); name=sys.argv[2]
sens=(p/'sensors-summary.txt').read_text(errors='ignore').strip()
ps=(p/'gpu-thread-ps.txt').read_text(errors='ignore') if (p/'gpu-thread-ps.txt').exists() else ''
gpu_cpu=''
for line in ps.splitlines()[1:2]:
    parts=line.split(None, 7)
    if len(parts)>=5: gpu_cpu=parts[4]
procs=(p/'processes.txt').read_text(errors='ignore') if (p/'processes.txt').exists() else ''
chrome_total=0.0
for line in procs.splitlines()[1:]:
    if 'chrome' in line or 'chromium' in line:
        cols=line.split(None,5)
        try: chrome_total += float(cols[2])
        except Exception: pass

gpu_top=(p/'intel-gpu-top.txt').read_text(errors='ignore') if (p/'intel-gpu-top.txt').exists() else ''
rows=[]
for line in gpu_top.splitlines():
    parts=line.split()
    if len(parts) >= 20 and re.match(r'^\d+(?:\.\d+)?$', parts[0]):
        try:
            rows.append({
                'freq_act': float(parts[1]),
                'rc6': float(parts[3]),
                'gpu_w': float(parts[4]),
                'pkg_w': float(parts[5]),
                'imc_rd': float(parts[6]),
                'imc_wr': float(parts[7]),
                'render3d': float(parts[8]),
            })
        except Exception:
            pass

def avg(key):
    return sum(r[key] for r in rows) / len(rows) if rows else float('nan')
def mx(key):
    return max((r[key] for r in rows), default=float('nan'))

gpu_summary=(
    f"render3d_avg={avg('render3d'):.1f} render3d_max={mx('render3d'):.1f} "
    f"rc6_avg={avg('rc6'):.1f} freq_act_avg={avg('freq_act'):.0f} "
    f"gpu_w_avg={avg('gpu_w'):.2f} pkg_w_avg={avg('pkg_w'):.2f} "
    f"imc_rd_avg={avg('imc_rd'):.0f} imc_wr_avg={avg('imc_wr'):.0f}"
)
print(f"{name}\tgpu_thread_cpu={gpu_cpu}\tchrome_total_cpu={chrome_total:.1f}\t{gpu_summary}\t{sens}")
PY
}

{
  echo -e "profile\tgpu_thread_cpu\tchrome_total_cpu\tgpu_top\tsensors"
} > "$OUT/summary.tsv"

printf 'run_id=%s\nsettle_seconds=%s\ngpu_top_seconds=%s\nout=%s\n' "$RUN_ID" "$SETTLE_SECONDS" "$GPU_TOP_SECONDS" "$OUT" > "$OUT/run-info.txt"
cp -a "$DROPIN" "$OUT/original-dropin.conf" 2>/dev/null || true

for i in "${!profile_name[@]}"; do
  capture_profile "${profile_name[$i]}" "${profile_flags[$i]}"
done

echo "RESTORE_BASELINE" | tee -a "$OUT/run.log"
restore_baseline
sleep 15
"$ROOT/scripts/hermes-display" verify > "$OUT/final-restore-verify.txt" 2>&1 || true

echo "DONE $OUT" | tee -a "$OUT/run.log"
