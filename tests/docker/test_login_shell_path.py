"""Login shells in the image keep ZALVO' own dirs on PATH.

Debian's ``/etc/profile`` resets PATH for every login shell, so without
``/etc/profile.d/zalvo.sh`` a ``bash -l`` (``docker exec <c> bash -l``, ssh, the
terminal tool's background ``bash -lic``) lost ``/opt/zalvo/bin`` and bare
``zalvo`` exited 127 (#56634).
"""
from __future__ import annotations

import subprocess


def test_login_shell_resolves_zalvo_to_the_image_shim(built_image: str) -> None:
    r = subprocess.run(
        ["docker", "run", "--rm", "-u", "zalvo", "--entrypoint", "bash", built_image,
         "-lc", 'echo "zalvo=$(command -v zalvo)"; echo "path=$PATH"'],
        capture_output=True, text=True, timeout=60, check=False,
    )
    assert r.returncode == 0, r.stderr
    lines = dict(line.split("=", 1) for line in r.stdout.splitlines() if "=" in line)
    assert lines["zalvo"] == "/opt/zalvo/bin/zalvo"
    entries = lines["path"].split(":")
    assert entries.index("/opt/zalvo/bin") < entries.index("/opt/zalvo/.venv/bin")
    assert entries.count("/opt/zalvo/bin") == 1
