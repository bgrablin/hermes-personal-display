from __future__ import annotations

import sys
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from hermes_display_server import Handler  # noqa: E402


def _server():
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd


def test_augury_feed_allows_loopback_host() -> None:
    httpd = _server()
    try:
        url = f"http://127.0.0.1:{httpd.server_address[1]}/api/augury-feed"
        with urllib.request.urlopen(url, timeout=5) as resp:
            assert resp.status == 200
            assert b"schema_version" in resp.read()
    finally:
        httpd.shutdown()
        httpd.server_close()


def test_augury_feed_rejects_non_loopback_host_header() -> None:
    httpd = _server()
    try:
        url = f"http://127.0.0.1:{httpd.server_address[1]}/api/augury-feed"
        req = urllib.request.Request(url, headers={"Host": "192.168.1.50"})
        try:
            urllib.request.urlopen(req, timeout=5)
            raise AssertionError("expected 403")
        except urllib.error.HTTPError as exc:
            assert exc.code == 403
            assert b"loopback_only" in exc.read()
    finally:
        httpd.shutdown()
        httpd.server_close()
