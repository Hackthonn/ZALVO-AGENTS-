"""Tests for get_zalvo_home() profile-mode fallback warning.

Regression test for https://github.com/NousResearch/hermes-agent/issues/18594.

When ZALVO_HOME is unset but an active_profile file indicates a non-default
profile is active, get_zalvo_home() should:
  1. STILL return ~/.zalvo (raising would brick 30+ module-level callers)
  2. Emit a loud one-shot warning to stderr so operators can diagnose
     cross-profile data contamination after the fact.

The warning goes to stderr directly (not through logging) because this
function is called at module-import time from 30+ sites, often before the
logging subsystem has been configured.
"""

from pathlib import Path

import pytest


@pytest.fixture
def fresh_constants(monkeypatch, tmp_path):
    """Import zalvo_constants fresh and reset the one-shot warn flag."""
    import importlib
    import zalvo_constants
    importlib.reload(zalvo_constants)
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    monkeypatch.delenv("ZALVO_HOME", raising=False)
    return zalvo_constants


class TestGetZalvoHomeProfileWarning:
    @pytest.mark.platforms("linux")
    def test_classic_mode_no_active_profile_no_warning(
        self, fresh_constants, tmp_path, capsys
    ):
        """Classic mode: no active_profile file → silent, returns ~/.zalvo."""
        result = fresh_constants.get_zalvo_home()
        assert result == tmp_path / ".zalvo"
        assert "ZALVO_HOME fallback" not in capsys.readouterr().err


    @pytest.mark.platforms("linux")
    def test_named_profile_unset_home_warns_once(
        self, fresh_constants, tmp_path, capsys
    ):
        """active_profile=coder + ZALVO_HOME unset → warn loudly, still return fallback."""
        zalvo_dir = tmp_path / ".zalvo"
        zalvo_dir.mkdir()
        (zalvo_dir / "active_profile").write_text("coder\n")

        result = fresh_constants.get_zalvo_home()

        # 1. Still returns the fallback — no import-time crash
        assert result == tmp_path / ".zalvo"
        # 2. Stderr got the warning exactly once
        err = capsys.readouterr().err
        assert err.count("ZALVO_HOME fallback") == 1
        assert "'coder'" in err

        # 3. One-shot: second and third calls don't re-warn
        fresh_constants.get_zalvo_home()
        fresh_constants.get_zalvo_home()
        err2 = capsys.readouterr().err
        assert "ZALVO_HOME fallback" not in err2

    def test_zalvo_home_set_suppresses_warning(
        self, fresh_constants, tmp_path, capsys, monkeypatch
    ):
        """Even if active_profile is 'coder', setting ZALVO_HOME suppresses warning."""
        profile_dir = tmp_path / ".zalvo" / "profiles" / "coder"
        profile_dir.mkdir(parents=True)
        (tmp_path / ".zalvo" / "active_profile").write_text("coder\n")
        monkeypatch.setenv("ZALVO_HOME", str(profile_dir))

        result = fresh_constants.get_zalvo_home()

        assert result == profile_dir
        assert "ZALVO_HOME fallback" not in capsys.readouterr().err

    @pytest.mark.platforms("linux")
    def test_unreadable_active_profile_no_crash(
        self, fresh_constants, tmp_path, capsys
    ):
        """active_profile that can't be decoded → fall through silently."""
        zalvo_dir = tmp_path / ".zalvo"
        zalvo_dir.mkdir()
        # Write bytes that aren't valid utf-8
        (zalvo_dir / "active_profile").write_bytes(b"\xff\xfe\x00\x00")

        result = fresh_constants.get_zalvo_home()

        assert result == tmp_path / ".zalvo"
        # Shouldn't crash; shouldn't warn either (can't tell what profile was intended)
        assert "ZALVO_HOME fallback" not in capsys.readouterr().err


class TestBootReadersBeforeProfileOverride:
    """Readers that run before the CLI applies the sticky ``active_profile`` must not warn.

    ``zalvo_bootstrap`` points ``TMPDIR`` at the scratch dir of the *process* home during
    import, and ``main._apply_profile_override`` re-homes the process a few lines later. A
    caller that already resolved its home must not send the policy back through
    ``get_zalvo_home()``: for a sticky-profile user with ``ZALVO_HOME`` unset in a plain
    shell that lookup falls back to the default profile and warns, on every ``zalvo``
    command, while nothing lands in the wrong place. Same fix the parser's ``_cfg_path()``
    carries for the ``--no-config`` help string.
    """

    def test_scratch_export_uses_the_process_home_silently(
        self, fresh_constants, tmp_path, capsys
    ):
        """Boot scratch setup: silent, and pointed at the home the bootstrap resolved."""
        zalvo_dir = tmp_path / ".zalvo"
        (zalvo_dir / "profiles" / "coder").mkdir(parents=True)
        (zalvo_dir / "active_profile").write_text("coder\n")
        capsys.readouterr()  # drop anything the setup above printed

        env = {"PATH": "/usr/bin:/bin"}
        assert fresh_constants.apply_scratch_tmp_env(env) is True

        assert env["TMPDIR"] == str(zalvo_dir / "cache" / "scratch")
        assert "ZALVO_HOME fallback" not in capsys.readouterr().err

    def test_explicit_home_scratch_dir_never_reads_the_effective_home(
        self, fresh_constants, tmp_path, capsys
    ):
        """A caller that passes a home (`zalvo doctor` for another profile) stays silent."""
        zalvo_dir = tmp_path / ".zalvo"
        profile_dir = zalvo_dir / "profiles" / "coder"
        profile_dir.mkdir(parents=True)
        (zalvo_dir / "active_profile").write_text("coder\n")
        capsys.readouterr()  # drop anything the setup above printed

        scratch = fresh_constants.get_scratch_dir(profile_dir)

        assert scratch == profile_dir / "cache" / "scratch"
        assert scratch.is_dir()
        assert "ZALVO_HOME fallback" not in capsys.readouterr().err

