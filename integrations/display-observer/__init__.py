"""Install by symlink so the display's tested adapter and redactor remain shared."""
from pathlib import Path
import sys

_REPO = Path(__file__).resolve().parents[2]
if str(_REPO / 'scripts') not in sys.path:
    sys.path.insert(0, str(_REPO / 'scripts'))
from display_state.observer import Observer

_observer = None


def register(ctx):
    global _observer
    _observer = Observer()
    for hook in ('on_session_start', 'on_session_end', 'pre_tool_call', 'post_tool_call',
                 'pre_api_request', 'api_request_error', 'subagent_start', 'subagent_stop'):
        ctx.register_hook(hook, _observer.callback(hook))
    _observer.start()
