"""Install by symlink so the display's tested adapter and redactor remain shared."""
from pathlib import Path
import sys


def _resolve_repo_root(module_file=__file__, cwd=None):
    """Find a complete source checkout or validated project archive."""
    module = Path(module_file).resolve()
    working = Path(cwd or Path.cwd()).resolve()
    candidates = [module.parents[2], working, *working.parents]
    for candidate in candidates:
        complete_archive = (
            (candidate / "package.json").is_file()
            and (candidate / "scripts/verify-project.sh").is_file()
        )
        if (
            ((candidate / ".git").exists() or complete_archive)
            and (candidate / "integrations/display-observer/plugin.yaml").is_file()
            and (candidate / "scripts/display_state/observer.py").is_file()
        ):
            return candidate
    raise ImportError(
        "display-observer requires a complete hermes-personal-display source tree"
    )


_REPO = _resolve_repo_root()
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
