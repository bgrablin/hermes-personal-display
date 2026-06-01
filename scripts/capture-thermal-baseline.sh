#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
TS="$(date +%Y%m%d-%H%M%S)"
OUT="${1:-$ROOT/docs/thermal-review/$TS}"
mkdir -p "$OUT"

run() {
  local name="$1"
  shift
  {
    printf '# %s\n' "$name"
    printf '# captured_at=%s\n' "$(date -Is)"
    printf '# command='
    printf '%q ' "$@"
    printf '\n\n'
    "$@"
  } >"$OUT/$name.txt" 2>&1 || true
}

run_shell() {
  local name="$1"
  local script="$2"
  {
    printf '# %s\n' "$name"
    printf '# captured_at=%s\n' "$(date -Is)"
    printf '# shell-script\n\n'
    bash -lc "$script"
  } >"$OUT/$name.txt" 2>&1 || true
}

printf '%s\n' "$OUT" > "$OUT/path.txt"

run hermes-display-verify "$ROOT/scripts/hermes-display" verify
run hermes-display-status "$ROOT/scripts/hermes-display" status
run hermes-display-url "$ROOT/scripts/hermes-display" url

run_shell system-driver '
  uname -a
  lsb_release -a 2>/dev/null || cat /etc/os-release
  whoami
  groups
  for c in intel_gpu_top intel_gpu_frequency powertop thermald powerprofilesctl xrandr glxinfo vainfo chromium-browser google-chrome-stable weston cage; do
    printf "%-24s" "$c"; command -v "$c" || true
  done
  lspci -nnk | sed -n "/VGA\|Display/,/Kernel modules/p"
  lsmod | egrep "i915|xe|drm" || true
'

run_shell xorg-mesa-acceleration '
  DISPLAY=:0 glxinfo -B 2>&1 || true
  echo "--- Xorg acceleration log lines"
  grep -Ei "modesetting|glamor|dri|accel|intel|iris|mesa|AIGLX" /var/log/Xorg.0.log ~/.local/share/xorg/Xorg.0.log 2>/dev/null || true
  echo "--- VAAPI"
  vainfo 2>&1 || true
'

run_shell display-state '
  DISPLAY=:0 xrandr --query || true
  echo "--- verbose"
  DISPLAY=:0 xrandr --verbose || true
  echo "--- monitors"
  DISPLAY=:0 xrandr --listmonitors || true
  echo "--- sysfs connectors"
  for d in /sys/class/drm/card*-DP-* /sys/class/drm/card*-HDMI-A-* /sys/class/drm/card*-eDP-*; do
    [ -e "$d" ] || continue
    echo "## $d"
    for f in status enabled modes dpms; do
      [ -e "$d/$f" ] && { printf "%s=" "$f"; cat "$d/$f"; }
    done
  done
'

run_shell thermald '
  systemctl is-active thermald 2>/dev/null || true
  systemctl status thermald --no-pager -l 2>/dev/null || true
  journalctl -u thermald --no-pager -n 120 2>/dev/null || true
'

run_shell temperatures '
  sensors 2>/dev/null || true
  echo "--- thermal zones"
  for z in /sys/class/thermal/thermal_zone*; do
    [ -r "$z/temp" ] || continue
    printf "%s type=" "$z"; cat "$z/type"
    printf "%s temp_mC=" "$z"; cat "$z/temp"
  done
'

run_shell gpu-frequency-rc6 '
  intel_gpu_frequency 2>&1 || true
  echo "--- sysfs gt"
  find -L /sys/class/drm/card*/gt -maxdepth 2 -type f \( -name "rps_*" -o -name "punit_*" -o -name "rc6_*" -o -name "id" \) -printf "%p=" -exec cat {} \; 2>/dev/null || true
'

run_shell intel-gpu-top-normal-user '
  timeout 3s intel_gpu_top -J -s 1000 2>&1 || true
'

if sudo -n true 2>/dev/null; then
  sudo -n timeout 20s intel_gpu_top -J -s 1000 >"$OUT/intel-gpu-top-sudo.json" 2>"$OUT/intel-gpu-top-sudo.stderr" || true
  sudo -n sh -c 'powertop --time=10 --csv="$1/powertop.csv" >"$1/powertop.stderr" 2>&1' sh "$OUT" || true
else
  printf 'sudo -n unavailable; skipped intel_gpu_top sudo and powertop report\n' > "$OUT/sudo-skipped.txt"
fi

run_shell browser-process-metrics '
  echo "--- matching processes"
  ps -eo pid,ppid,user,comm,pcpu,pmem,rss,vsz,etimes,args | egrep "Xorg|startx|xinit|chrome|chromium|hermes_display_server|personal-display" | egrep -v "egrep" || true
  echo "--- top chrome/Xorg/display processes"
  ps -eo pid,ppid,user,comm,pcpu,pmem,rss,vsz,etimes,args --sort=-pcpu | awk "NR==1 || /chrome|chromium|hermes_display_server|Xorg/ {print}" | head -80
  echo "--- chrome aggregate"
  ps -C chrome -o pid=,pcpu=,pmem=,rss=,comm=,args= | awk "/hermes-personal-display-profile|type=/ {cpu+=\$2; mem+=\$3; rss+=\$4; n++} END {printf \"chrome_processes=%d total_cpu_pct=%.1f total_mem_pct=%.1f total_rss_kib=%d\\n\", n,cpu,mem,rss}"
'

cat > "$OUT/SUMMARY.md" <<SUMMARY
# Thermal baseline capture

Captured: $(date -Is)
Host: $(hostname)
Project: $ROOT

Curated files in this directory are local thermal evidence. The docs/thermal-review/ directory is git-ignored; do not commit raw logs.

Key files:
- hermes-display-verify.txt
- display-state.txt
- xorg-mesa-acceleration.txt
- temperatures.txt
- browser-process-metrics.txt
- intel-gpu-top-sudo.json, if sudo sampling was available
- powertop.csv, if sudo sampling was available
SUMMARY

printf 'Thermal baseline captured under %s\n' "$OUT"
