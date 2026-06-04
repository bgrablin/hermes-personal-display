"""scrub/redaction/safety policy.

Compatibility shim created to make the display-server application boundary explicit.
Move code here incrementally; keep hermes_display_server.py as HTTP routing only.
"""
from __future__ import annotations
