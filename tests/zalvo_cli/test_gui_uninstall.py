"""Tests for zalvo_cli.gui_uninstall — GUI-only uninstall + install discovery.

Covers the cross-platform artifact discovery, the agent/GUI detection the
desktop UI gates options on, and that ``uninstall_gui`` removes only GUI
artifacts (built renderer/release/node_modules, packaged bundle, Electron
userData) while leaving the Python agent + config/sessions/.env intact.
"""

import sys
from pathlib import Path

import pytest

import zalvo_cli.gui_uninstall as gu


def _make_agent(zalvo_home: Path) -> Path:
    """Create a fake agent install: source package + venv."""
    agent_root = zalvo_home / "zalvo-agent"
    (agent_root / "zalvo_cli").mkdir(parents=True)
    (agent_root / "zalvo_cli" / "__init__.py").write_text("")
    (agent_root / "venv" / "bin").mkdir(parents=True)
    return agent_root


def _make_gui_build(zalvo_home: Path) -> None:
    """Create the source-built GUI artifacts a `zalvo desktop` run produces."""
    desktop = zalvo_home / "zalvo-agent" / "apps" / "desktop"
    (desktop / "dist").mkdir(parents=True)
    (desktop / "dist" / "index.html").write_text("<html>")
    (desktop / "release" / "linux-unpacked").mkdir(parents=True)
    (desktop / "node_modules").mkdir(parents=True)
    (zalvo_home / "zalvo-agent" / "node_modules").mkdir(parents=True)
    (zalvo_home / "desktop-build-stamp.json").write_text("{}")


def test_gui_install_summary_shape(tmp_path, monkeypatch):
    zalvo_home = tmp_path / ".zalvo"
    _make_agent(zalvo_home)
    _make_gui_build(zalvo_home)
    monkeypatch.setattr(gu, "packaged_gui_app_paths", list)
    monkeypatch.setattr(gu, "desktop_userdata_dir", lambda: tmp_path / "none")

    summary = gu.gui_install_summary(zalvo_home)
    # JSON-serializable primitives the desktop UI gates on.
    assert summary["agent_installed"] is True
    assert summary["gui_installed"] is True
    assert isinstance(summary["source_built_artifacts"], list)
    assert all(isinstance(p, str) for p in summary["source_built_artifacts"])
    assert summary["zalvo_home"] == str(zalvo_home)
    assert summary["platform"] == sys.platform


@pytest.mark.platforms("linux")
def test_uninstall_removes_launcher_entry_and_refreshes_cache(tmp_path, monkeypatch):
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path / "xdg"))

    from zalvo_cli import linux_desktop_entry as lde

    entry = lde.desktop_entry_path()
    entry.parent.mkdir(parents=True, exist_ok=True)
    entry.write_text("x", encoding="utf-8")
    # The pre-rename entry lives on as a hidden alias of the app-id entry (#124492);
    # a GUI uninstall must take it with the real one.
    legacy_alias = entry.with_name(lde.LEGACY_DESKTOP_ENTRY_NAME)
    legacy_alias.write_text("x", encoding="utf-8")

    refreshed: list[Path] = []
    monkeypatch.setattr(
        lde, "refresh_desktop_databases", lambda d: refreshed.append(d) or ["kbuildsycoca6"]
    )

    zalvo_home = tmp_path / ".zalvo"
    _make_agent(zalvo_home)
    icon = lde.icon_path(zalvo_home / "zalvo-agent")
    icon.parent.mkdir(parents=True, exist_ok=True)
    icon.write_bytes(b"\x89PNG")
    monkeypatch.setattr(gu, "desktop_userdata_dir", lambda: tmp_path / "none")

    removed = gu.uninstall_gui(zalvo_home)

    assert entry in removed and not entry.exists()
    assert legacy_alias in removed and not legacy_alias.exists()
    assert refreshed == [entry.parent]
    # The icon lives in the checkout. A GUI uninstall must not delete it.
    assert lde.icon_path(zalvo_home / "zalvo-agent").exists()
    # The agent itself survives a GUI uninstall.
    assert (zalvo_home / "zalvo-agent" / "zalvo_cli").is_dir()


@pytest.mark.platforms("posix")  # POSIX symlink semantics
def test_remove_path_handles_symlink(tmp_path):
    target = tmp_path / "real"
    target.mkdir()
    link = tmp_path / "link"
    link.symlink_to(target)
    assert gu._remove_path(link) is True
    assert not link.exists()
    # The symlink is gone but its target is untouched.
    assert target.exists()


def test_uninstall_args_namespace_mode_mapping():
    """_UninstallArgs maps mode → the gui/full flags run_uninstall reads."""
    from zalvo_cli import uninstall

    gui = uninstall._UninstallArgs(mode="gui")
    assert gui.gui is True and gui.full is False and gui.yes is True

    lite = uninstall._UninstallArgs(mode="lite")
    assert lite.gui is False and lite.full is False and lite.yes is True

    full = uninstall._UninstallArgs(mode="full")
    assert full.gui is False and full.full is True and full.yes is True

