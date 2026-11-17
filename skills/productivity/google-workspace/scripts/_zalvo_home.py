"""Resolve ZALVO_HOME for standalone skill scripts.

Skill scripts may run outside the ZALVO process (e.g. system Python,
nix env, CI) where ``zalvo_constants`` is not importable.  This module
provides the same ``get_zalvo_home()`` and ``display_zalvo_home()``
contracts as ``zalvo_constants`` without requiring it on ``sys.path``.

When ``zalvo_constants`` IS available it is used directly so that any
future enhancements (profile resolution, Docker detection, etc.) are
picked up automatically.  The fallback path replicates the core logic
from ``zalvo_constants.py`` using only the stdlib.

All scripts under ``google-workspace/scripts/`` should import from here
instead of duplicating the ``ZALVO_HOME = Path(os.getenv(...))`` pattern.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from zalvo_constants import display_zalvo_home
    from zalvo_constants import get_zalvo_home
except (ModuleNotFoundError, ImportError):

    def get_zalvo_home() -> Path:
        """Return the ZALVO home directory (default: ~/.zalvo).

        Mirrors ``zalvo_constants.get_zalvo_home()``."""
        val = os.environ.get("ZALVO_HOME", "").strip()
        return Path(val) if val else Path.home() / ".zalvo"

    def display_zalvo_home() -> str:
        """Return a user-friendly ``~/``-shortened display string.

        Mirrors ``zalvo_constants.display_zalvo_home()``."""
        home = get_zalvo_home()
        try:
            return "~/" + home.relative_to(Path.home()).as_posix()
        except ValueError:
            return str(home)
