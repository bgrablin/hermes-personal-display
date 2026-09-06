from __future__ import annotations

import os
import stat
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WATCHDOG = ROOT / "scripts" / "display-telemetry-watchdog.sh"
DISPLAY_CLI = ROOT / "scripts" / "hermes-display"
SYSTEM_SERVICE = "hermes-personal-display-minix.service"


def _write_executable(path: Path, body: str) -> None:
    path.write_text(f"#!/usr/bin/env bash\nset -euo pipefail\n{body}\n", encoding="utf-8")
    path.chmod(0o755)


def _watchdog_env(tmp_path: Path, *, verify_status: int = 0) -> tuple[dict[str, str], Path]:
    fake_bin = tmp_path / "bin"
    fake_bin.mkdir()
    runtime = tmp_path / "runtime"
    runtime.mkdir(mode=0o700)
    home = tmp_path / "home"
    home.mkdir()
    tmpdir = tmp_path / "tmp"
    tmpdir.mkdir()
    command_log = tmp_path / "commands.log"
    display_log = tmp_path / "display.log"

    _write_executable(fake_bin / "xset", "exit 1")
    _write_executable(fake_bin / "curl", "exit 1")
    _write_executable(
        fake_bin / "sudo",
        'printf "sudo:%s\\n" "$*" >>"$COMMAND_LOG"\nexit "${SUDO_STATUS:-0}"',
    )
    display = tmp_path / "fake-hermes-display"
    _write_executable(
        display,
        'printf "display:%s\\n" "$*" >>"$DISPLAY_LOG"\nexit "$VERIFY_STATUS"',
    )

    env = os.environ.copy()
    env.update(
        {
            "PATH": f"{fake_bin}:/usr/bin:/bin",
            "HOME": str(home),
            "XDG_RUNTIME_DIR": str(runtime),
            "PERSONAL_DISPLAY_COMMAND": str(display),
            "HERMES_DISPLAY_SYSTEM_SERVICE": SYSTEM_SERVICE,
            "VERIFY_STATUS": str(verify_status),
            "COMMAND_LOG": str(command_log),
            "DISPLAY_LOG": str(display_log),
            "PERSONAL_DISPLAY_RENDER_RESTART_COOLDOWN": "300",
            "TMPDIR": str(tmpdir),
        }
    )
    return env, runtime


def _run_watchdog(env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(WATCHDOG)],
        cwd=ROOT,
        env=env,
        text=True,
        capture_output=True,
        timeout=10,
        check=False,
    )


def test_nonrestartable_render_failures_do_not_restart_kiosk(tmp_path: Path) -> None:
    env, runtime = _watchdog_env(tmp_path, verify_status=2)

    first = _run_watchdog(env)
    second = _run_watchdog(env)

    assert first.returncode == 0
    assert second.returncode == 0
    assert not Path(env["COMMAND_LOG"]).exists()
    assert not runtime.joinpath("hermes-display-render-failures").exists()


def test_nonrestartable_fault_is_logged_only_on_transition(tmp_path: Path) -> None:
    # A persistent non-restartable state (display inactive / output unavailable)
    # is expected for the watchdog: restart is suppressed and there is nothing
    # actionable per tick, so the fault must be surfaced once on the transition
    # into that state rather than repeated on every timer tick.
    env, _ = _watchdog_env(tmp_path, verify_status=2)

    first = _run_watchdog(env)
    second = _run_watchdog(env)

    assert first.returncode == 0
    assert second.returncode == 0
    assert first.stderr.count("non-restartable fault") == 1
    assert second.stderr.count("non-restartable fault") == 0


def test_nonrestartable_fault_is_logged_again_after_recovery(tmp_path: Path) -> None:
    # A fresh transition back into the non-restartable state (after a healthy
    # tick) must surface the fault again, so a real return of the defect stays
    # visible and the watchdog does not stay silent forever.
    env, _ = _watchdog_env(tmp_path, verify_status=2)

    down = _run_watchdog(env)
    assert down.stderr.count("non-restartable fault") == 1

    env["VERIFY_STATUS"] = "0"
    healthy = _run_watchdog(env)
    assert healthy.stderr.count("non-restartable fault") == 0

    env["VERIFY_STATUS"] = "2"
    down_again = _run_watchdog(env)
    assert down_again.stderr.count("non-restartable fault") == 1


def test_restartable_failure_state_is_private_and_clears_only_after_success(tmp_path: Path) -> None:
    env, runtime = _watchdog_env(tmp_path, verify_status=1)

    first = _run_watchdog(env)
    failure_file = runtime / "hermes-display-render-failures"
    assert first.returncode == 0
    assert failure_file.read_text(encoding="utf-8") == "1"
    assert stat.S_IMODE(failure_file.stat().st_mode) == 0o600

    second = _run_watchdog(env)
    assert second.returncode == 0
    assert Path(env["COMMAND_LOG"]).read_text(encoding="utf-8").splitlines() == [
        f"sudo:-n systemctl restart -- {SYSTEM_SERVICE}"
    ]
    assert not failure_file.exists()
    restart_stamp = runtime / "hermes-display-render-last-restart"
    assert restart_stamp.read_text(encoding="utf-8").isdigit()
    assert stat.S_IMODE(restart_stamp.stat().st_mode) == 0o600


def test_unsafe_state_symlink_is_rejected_without_clobbering_target(tmp_path: Path) -> None:
    env, runtime = _watchdog_env(tmp_path, verify_status=1)
    victim = tmp_path / "victim"
    victim.write_text("preserve", encoding="utf-8")
    runtime.joinpath("hermes-display-render-failures").symlink_to(victim)

    result = _run_watchdog(env)

    assert result.returncode != 0
    assert "unsafe watchdog state path" in result.stderr.lower()
    assert victim.read_text(encoding="utf-8") == "preserve"
    assert not Path(env["COMMAND_LOG"]).exists()


def test_privileged_service_override_is_rejected(tmp_path: Path) -> None:
    env, _ = _watchdog_env(tmp_path, verify_status=1)
    env["HERMES_DISPLAY_SYSTEM_SERVICE"] = "attacker-controlled.service"

    result = _run_watchdog(env)

    assert result.returncode == 2
    assert "refusing privileged restart" in result.stderr.lower()
    assert not Path(env["COMMAND_LOG"]).exists()


def test_watchdog_detects_active_rotation_not_supported_rotation_list(tmp_path: Path) -> None:
    env, _ = _watchdog_env(tmp_path, verify_status=0)
    fake_bin = Path(env["PATH"].split(":", 1)[0])
    _write_executable(fake_bin / "xset", "exit 0")
    _write_executable(
        fake_bin / "xrandr",
        """
if [[ "${1:-}" == "--query" ]]; then
  printf '%s\n' 'DP-2 connected primary 1920x1280+0+0 (normal left inverted right x axis y axis)'
  exit 0
fi
printf 'xrandr:%s\n' "$*" >>"$COMMAND_LOG"
""".strip(),
    )

    result = _run_watchdog(env)

    assert result.returncode == 0
    commands = Path(env["COMMAND_LOG"]).read_text(encoding="utf-8")
    assert "--output DP-2 --mode 1920x1280 --rotate inverted --primary --pos 0x0" in commands


def test_failed_xrandr_repair_does_not_skip_render_classification(tmp_path: Path) -> None:
    env, _ = _watchdog_env(tmp_path, verify_status=2)
    fake_bin = Path(env["PATH"].split(":", 1)[0])
    _write_executable(fake_bin / "xset", "exit 0")
    _write_executable(
        fake_bin / "xrandr",
        """
if [[ "${1:-}" == "--query" ]]; then
  printf '%s\n' 'DP-2 connected primary 1920x1280+0+0 (normal left inverted right x axis y axis)'
  exit 0
fi
exit 1
""".strip(),
    )

    result = _run_watchdog(env)

    assert result.returncode == 0
    assert Path(env["DISPLAY_LOG"]).read_text(encoding="utf-8").splitlines() == [
        "display:verify-render"
    ]
    assert "unable to repair display layout" in result.stderr.lower()


def test_display_cli_rejects_privileged_service_override(tmp_path: Path) -> None:
    env = os.environ.copy()
    env.update(
        {
            "HOME": str(tmp_path),
            "HERMES_DISPLAY_ENV_FILE": str(tmp_path / "missing.env"),
            "HERMES_DISPLAY_SYSTEM_SERVICE": "attacker-controlled.service",
        }
    )

    result = subprocess.run(
        [str(DISPLAY_CLI), "build-id"],
        cwd=ROOT,
        env=env,
        text=True,
        capture_output=True,
        timeout=10,
        check=False,
    )

    assert result.returncode == 2
    assert "refusing privileged service" in result.stderr.lower()
