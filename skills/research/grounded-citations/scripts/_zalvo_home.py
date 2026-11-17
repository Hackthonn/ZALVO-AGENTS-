"""Resolve ZALVO_HOME for standalone skill scripts.

Skill scripts may run outside the ZALVO process (system Python, nix env,
CI) where ``zalvo_constants`` is not importable.  This module provides the
same ``get_zalvo_home()`` contract without requiring it on ``sys.path``.

When ``zalvo_constants`` IS available it is used directly so profile
resolution and any future enhancements are picked up automatically.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from zalvo_constants import get_zalvo_home
except (ModuleNotFoundError, ImportError):

    def get_zalvo_home() -> Path:
        """Return the ZALVO home directory (default: ``~/.zalvo``)."""
        val = os.environ.get("ZALVO_HOME", "").strip()
        return Path(val) if val else Path.home() / ".zalvo"
