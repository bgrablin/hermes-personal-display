"""Focused display-server boundaries.

New code should land in these modules instead of expanding hermes_display_server.py.
The HTTP server remains as the compatibility route boundary while collectors,
contract, privacy, persistence, route rail, remote memory, entertainment, and
fixture logic are moved behind auditable module names.
"""
