#!/usr/bin/env python3
"""Local deterministic personality engine for the Hermes MINIX display.

This is the safe Phase-2 scaffold from the ChatGPT Pro review: it chooses from
approved expressions only, never executes model output, never sends context to an
external model, and writes both a high-level persona_packet and a renderer-ready
optic_state_packet.  A future LLM route may sit in front of this, but only if it
emits the same constrained shape and passes the same safety checks.
"""
from __future__ import annotations

import argparse, json, os, re, tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DISPLAY_DIR = Path(os.environ.get('HERMES_DISPLAY_DIR', Path.home()/'.hermes/display'))
SECRET_RE = re.compile(r'(?i)(api[_-]?key|token|secret|password|passwd|private[_ -]?key|BEGIN [A-Z ]*PRIVATE KEY|sk-[A-Za-z0-9])')
SAFE_SENSITIVITIES = {'public_status', 'home_private', 'sensitive_hidden', 'work_restricted', 'credential_blocked'}

ACTIVE_SKINS = {
    'retro-robot-core': {
        'palette': {'name': 'graphite-teal', 'background': '#070A12', 'primary': '#65F3FF', 'secondary': '#2AD6A3', 'accent': '#B899FF', 'danger': '#FF4D7A', 'brightness': 0.72}
    },
    'retro-terminal-focus': {
        'palette': {'name': 'phosphor-green', 'background': '#030706', 'primary': '#63FFB8', 'secondary': '#26D6FF', 'accent': '#FFB84D', 'danger': '#FF4D7A', 'brightness': 0.76}
    },
    'retro-night-watch': {
        'palette': {'name': 'sleepy-navy', 'background': '#030815', 'primary': '#4DB7FF', 'secondary': '#6F7CFF', 'accent': '#E59E54', 'danger': '#C94D70', 'brightness': 0.42}
    },
    'retro-amber-watch': {
        'palette': {'name': 'amber-skeptic', 'background': '#08080D', 'primary': '#F7D36B', 'secondary': '#FF9E4A', 'accent': '#FF4D7A', 'danger': '#FF335F', 'brightness': 0.80}
    },
}

MODE_MAP = {
    'healthy': ('idle_watchful', 'retro-robot-core', 'idle_watch', 'Quiet watch. Local systems calm.'),
    'busy': ('thinking_focused', 'retro-terminal-focus', 'tool_shell', 'Working locally.'),
    'degraded': ('degraded_skeptical', 'retro-amber-watch', 'degraded_offline', 'A local signal needs review.'),
    'attention_needed': ('attention_needed', 'retro-amber-watch', 'waiting_user', 'Waiting on Brian.'),
    'blocked': ('blocked_annoyed', 'retro-amber-watch', 'blocked', 'Blocked, but contained.'),
    'offline': ('offline_fallback', 'retro-night-watch', 'degraded_offline', 'Display feed degraded.'),
}

OPTIC_BY_MODE = {
    'idle_watch': {'gaze': {'target': 'center', 'pace': 0.18, 'jitter': 0.04}, 'eyes': {'lid_open': 0.84, 'pupil_scale': 1.0, 'catchlight_opacity': 0.78}, 'mouth': {'shape': 'neutral', 'brightness': 0.75}, 'head': {'tilt_deg': 0, 'y_px': 0}, 'helmet': {'rim_tilt_deg': 0, 'wing_tension': 0.18}, 'glow': {'face': 0.46, 'halo': 0.32, 'pulse_rate': 0.06}},
    'reading': {'gaze': {'target': 'down_scan', 'pace': 0.34, 'jitter': 0.03}, 'eyes': {'lid_open': 0.78, 'pupil_scale': 0.96, 'catchlight_opacity': 0.82}, 'mouth': {'shape': 'neutral_short', 'brightness': 0.74}, 'head': {'tilt_deg': -1, 'y_px': 1}, 'helmet': {'rim_tilt_deg': -0.5, 'wing_tension': 0.28}, 'glow': {'face': 0.56, 'halo': 0.36, 'pulse_rate': 0.08}},
    'reasoning': {'gaze': {'target': 'internal_down', 'pace': 0.22, 'jitter': 0.04}, 'eyes': {'lid_open': 0.72, 'pupil_scale': 0.95, 'catchlight_opacity': 0.8}, 'mouth': {'shape': 'neutral_short', 'brightness': 0.8}, 'head': {'tilt_deg': -1.5, 'y_px': 2}, 'helmet': {'rim_tilt_deg': -1.0, 'wing_tension': 0.35}, 'glow': {'face': 0.7, 'halo': 0.42, 'pulse_rate': 0.08}},
    'tool_shell': {'gaze': {'target': 'down_right', 'pace': 0.42, 'jitter': 0.05}, 'eyes': {'lid_open': 0.76, 'pupil_scale': 0.9, 'catchlight_opacity': 0.82}, 'mouth': {'shape': 'flat_focus', 'brightness': 0.82}, 'head': {'tilt_deg': 1.5, 'y_px': 1}, 'helmet': {'rim_tilt_deg': 1.0, 'wing_tension': 0.48}, 'glow': {'face': 0.72, 'halo': 0.48, 'pulse_rate': 0.14}},
    'writing': {'gaze': {'target': 'right_output', 'pace': 0.30, 'jitter': 0.05}, 'eyes': {'lid_open': 0.80, 'pupil_scale': 0.98, 'catchlight_opacity': 0.84}, 'mouth': {'shape': 'smirk_right', 'brightness': 0.86}, 'head': {'tilt_deg': 1.0, 'y_px': 0}, 'helmet': {'rim_tilt_deg': 0.8, 'wing_tension': 0.38}, 'glow': {'face': 0.66, 'halo': 0.40, 'pulse_rate': 0.10}},
    'waiting_user': {'gaze': {'target': 'forward_focus', 'pace': 0.16, 'jitter': 0.02}, 'eyes': {'lid_open': 0.92, 'pupil_scale': 1.04, 'catchlight_opacity': 0.92}, 'mouth': {'shape': 'neutral', 'brightness': 0.82}, 'head': {'tilt_deg': 0, 'y_px': -1}, 'helmet': {'rim_tilt_deg': 0, 'wing_tension': 0.34}, 'glow': {'face': 0.62, 'halo': 0.44, 'pulse_rate': 0.07}},
    'blocked': {'gaze': {'target': 'side_eye_left', 'pace': 0.18, 'jitter': 0.02}, 'eyes': {'lid_open': 0.64, 'pupil_scale': 0.86, 'catchlight_opacity': 0.74}, 'mouth': {'shape': 'flat_tight', 'brightness': 0.82}, 'head': {'tilt_deg': 3.0, 'y_px': 1}, 'helmet': {'rim_tilt_deg': 2.4, 'wing_tension': 0.62}, 'glow': {'face': 0.62, 'halo': 0.30, 'pulse_rate': 0.04}},
    'complete': {'gaze': {'target': 'center', 'pace': 0.14, 'jitter': 0.02}, 'eyes': {'lid_open': 0.86, 'pupil_scale': 1.0, 'catchlight_opacity': 0.9}, 'mouth': {'shape': 'smile_small', 'brightness': 0.88}, 'head': {'tilt_deg': 0, 'y_px': -1}, 'helmet': {'rim_tilt_deg': 0, 'wing_tension': 0.22}, 'glow': {'face': 0.58, 'halo': 0.42, 'pulse_rate': 0.05}},
    'degraded_offline': {'gaze': {'target': 'down_left', 'pace': 0.10, 'jitter': 0.01}, 'eyes': {'lid_open': 0.58, 'pupil_scale': 0.78, 'catchlight_opacity': 0.42}, 'mouth': {'shape': 'drowsy_droop', 'brightness': 0.52}, 'head': {'tilt_deg': -2.4, 'y_px': 2}, 'helmet': {'rim_tilt_deg': -1.5, 'wing_tension': 0.12}, 'glow': {'face': 0.28, 'halo': 0.16, 'pulse_rate': 0.02}},
}

def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00','Z')

def read_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text())
    except Exception:
        return fallback

def atomic_write(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=path.name+'.', dir=str(path.parent))
    with os.fdopen(fd, 'w') as f:
        json.dump(obj, f, indent=2, sort_keys=True)
        f.write('\n')
    os.replace(tmp, path)

def safe_snippet(display_state: dict[str, Any]) -> dict[str, Any] | None:
    snippets = display_state.get('snippets') or []
    for snip in snippets:
        text = str(snip.get('text',''))[:120]
        sens = str(snip.get('display_sensitivity') or snip.get('sensitivity') or 'sensitive_hidden')
        if SECRET_RE.search(text) or sens == 'credential_blocked':
            return None
        if sens in {'public_status', 'home_private', 'public', 'display_safe', 'private_local'}:
            return {'id': str(snip.get('id','persona-snippet'))[:80], 'text': text, 'kind': str(snip.get('kind','system'))[:24], 'sensitivity': 'display_safe'}
    return None

def pick_mode(display_state: dict[str, Any]) -> tuple[str, str, str, str]:
    status = str(display_state.get('overall_status') or display_state.get('status') or 'healthy')
    activity = display_state.get('activity') or {}
    title = str(activity.get('display_safe_title') or '')
    if SECRET_RE.search(title):
        title = ''
    if status == 'healthy' and any(int(activity.get(k,0) or 0) > 0 for k in ('active_tools','active_workers','kanban_running')):
        status = 'busy'
    return MODE_MAP.get(status, MODE_MAP['healthy'])

def build_packet(display_state: dict[str, Any]) -> dict[str, Any]:
    mood, skin, puppet_mode, caption = pick_mode(display_state)
    if display_state.get('mode') == 'night':
        mood, skin, puppet_mode, caption = ('night_sleepy', 'retro-night-watch', 'degraded_offline', 'Quiet night watch.')
    palette = ACTIVE_SKINS[skin]['palette']
    generated = now_iso()
    persona = {
        'schema_version': '0.1.0', 'generated_at': generated, 'valid_for_seconds': 180,
        'mood': mood, 'skin': skin,
        'playfulness': 0.32 if puppet_mode in {'reasoning','tool_shell','blocked'} else 0.42,
        'energy': 0.66 if puppet_mode in {'tool_shell','waiting_user'} else 0.38,
        'focus': 0.86 if puppet_mode in {'reasoning','tool_shell','reading'} else 0.55,
        'curiosity': 0.62, 'impatience': 0.28 if puppet_mode == 'blocked' else 0.08,
        'eyes': {'expression': 'focused' if puppet_mode in {'reasoning','tool_shell','reading'} else 'half_lidded' if puppet_mode == 'degraded_offline' else 'relaxed', 'gaze': 'track_activity' if puppet_mode in {'tool_shell','reading'} else 'center', 'blink_rate': 'slow' if puppet_mode == 'degraded_offline' else 'normal', 'pupil': 'scanline' if puppet_mode == 'tool_shell' else 'soft', 'intensity': OPTIC_BY_MODE[puppet_mode]['glow']['face']},
        'posture': {'pose': 'diagnostic_still' if puppet_mode == 'degraded_offline' else 'hover_center', 'tilt': 'left_small' if puppet_mode == 'blocked' else 'none', 'motion': 'focused_pulse' if puppet_mode in {'reasoning','tool_shell'} else 'breathing', 'orbit': 'dim' if puppet_mode == 'degraded_offline' else 'focused', 'scale': 1.0},
        'palette': palette,
        'micro_actions': [{'name': 'blink_double' if puppet_mode == 'complete' else 'eye_track_right' if puppet_mode == 'tool_shell' else 'blink_single', 'weight': 0.42, 'cooldown_seconds': 18}],
        'caption': {'text': caption, 'tone': 'focused' if puppet_mode in {'reasoning','tool_shell'} else 'skeptical' if puppet_mode == 'blocked' else 'calm', 'priority': 'attention' if puppet_mode in {'blocked','waiting_user','degraded_offline'} else 'status', 'max_width_chars': 56},
        'snippet': safe_snippet(display_state),
        'duration': {'packet_seconds': 180, 'transition_ms': 420, 'min_hold_seconds': 20, 'max_hold_seconds': 240},
        'avoid_repeating': {'captions': [], 'micro_actions': [], 'skins': [], 'moods': [], 'window_seconds': 600},
        'safety': {'boundary': 'local_trusted_display', 'redaction_level': 'display_safe', 'contains_credentials': False, 'external_model_safe': False, 'notes': ['deterministic local engine', 'approved expression vocabulary only']},
        'display_sensitivity': 'public_status',
    }
    optic = {'schema_version': '0.2.0', 'generated_at': generated, 'mode': puppet_mode, **OPTIC_BY_MODE[puppet_mode]}
    optic['optic'] = {'aperture_open': optic.get('eyes', {}).get('lid_open', 1.0), 'pupil_scale': optic.get('eyes', {}).get('pupil_scale', 1.0), 'iris_glow': optic.get('glow', {}).get('face', 0.42)}
    return {'schema_version': '0.2.0', 'generated_at': generated, 'persona_packet': persona, 'optic_state_packet': optic, 'puppet_state_packet': optic}

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--state', type=Path, default=DISPLAY_DIR/'display_state.json')
    ap.add_argument('--out', type=Path, default=DISPLAY_DIR/'persona_packet.json')
    ap.add_argument('--optic-out', type=Path, default=DISPLAY_DIR/'optic_state_packet.json')
    ap.add_argument('--puppet-out', type=Path, default=DISPLAY_DIR/'puppet_state_packet.json', help='backwards-compatible alias')
    ap.add_argument('--history', type=Path, default=DISPLAY_DIR/'persona_history.jsonl')
    args = ap.parse_args()
    display_state = read_json(args.state, {'overall_status': 'healthy', 'activity': {}, 'snippets': []})
    packet = build_packet(display_state)
    atomic_write(args.out, packet['persona_packet'])
    atomic_write(args.optic_out, packet['optic_state_packet'])
    atomic_write(args.puppet_out, packet['optic_state_packet'])
    args.history.parent.mkdir(parents=True, exist_ok=True)
    with args.history.open('a') as f:
        f.write(json.dumps({'at': packet['generated_at'], 'mood': packet['persona_packet']['mood'], 'skin': packet['persona_packet']['skin'], 'caption': packet['persona_packet']['caption']['text'], 'optic_mode': packet['optic_state_packet']['mode']}, sort_keys=True) + '\n')
    print(json.dumps(packet, indent=2, sort_keys=True))
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
