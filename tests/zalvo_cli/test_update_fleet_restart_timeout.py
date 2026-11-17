"""Regression for #68523 — one systemctl timeout must not abort fleet restarts.

On hosts with many profile-backed ``zalvo-gateway*.service`` units,
``zalvo update`` used to wrap the entire per-scope unit loop in a single
``except subprocess.TimeoutExpired``. A timeout on unit N skipped units
N+1…, leaving later gateways on pre-update in-memory modules while the
checkout on disk was already new (mixed-generation crashes).
"""

from __future__ import annotations

import subprocess

import pytest

from zalvo_cli.update_cmd import _for_each_systemd_gateway_unit, _service_unit_supports_graceful_sigusr1_restart, _warn_incomplete_gateway_fleet_restart


def _list_units_stdout(names: list[str]) -> str:
    return "\n".join(f"{name}.service loaded active running" for name in names)


class TestFleetRestartTimeoutIsolation:
    def test_timeout_on_middle_unit_continues_remaining_units(self):
        units = [
            "zalvo-gateway-xiaomo1",
            "zalvo-gateway-xiaomo2",
            "zalvo-gateway-xiaomo3",
            "zalvo-gateway-xiaomo4",
            "zalvo-gateway-xiaomo5",
            "zalvo-gateway-xiaomo6",
            "zalvo-gateway-xiaomo7",
            "zalvo-gateway",
        ]
        restarted: list[str] = []
        failed: list[str] = []
        timeout_cmds: list = []

        def process_unit(svc_name: str) -> None:
            if svc_name == "zalvo-gateway-xiaomo5":
                raise subprocess.TimeoutExpired(
                    cmd=["systemctl", "--user", "--no-ask-password", "restart", svc_name],
                    timeout=15,
                )
            restarted.append(svc_name)

        def on_unit_timeout(svc_name: str, exc: subprocess.TimeoutExpired) -> None:
            failed.append(svc_name)
            timeout_cmds.append(exc.cmd)

        _for_each_systemd_gateway_unit(
            _list_units_stdout(units),
            process_unit=process_unit,
            on_unit_timeout=on_unit_timeout,
        )

        assert failed == ["zalvo-gateway-xiaomo5"]
        assert restarted == [
            "zalvo-gateway-xiaomo1",
            "zalvo-gateway-xiaomo2",
            "zalvo-gateway-xiaomo3",
            "zalvo-gateway-xiaomo4",
            "zalvo-gateway-xiaomo6",
            "zalvo-gateway-xiaomo7",
            "zalvo-gateway",
        ]
        assert set(restarted) | set(failed) == set(units)
        assert timeout_cmds == [
            ["systemctl", "--user", "--no-ask-password", "restart", "zalvo-gateway-xiaomo5"]
        ]

    def test_non_gateway_units_in_list_output_are_ignored(self):
        seen: list[str] = []

        _for_each_systemd_gateway_unit(
            "\n".join(
                [
                    "ssh.service loaded active running",
                    "zalvo-gateway-coder.service loaded active running",
                    "not-a-service loaded active running",
                    "",
                ]
            ),
            process_unit=seen.append,
            on_unit_timeout=lambda *_: pytest.fail("unexpected timeout"),
        )

        assert seen == ["zalvo-gateway-coder"]

    def test_zalvo_serve_units_are_included(self):
        # #83438 — zalvo update restarted zalvo-gateway* units but left
        # zalvo-serve* (the Desktop app's backend) on stale pre-update code.
        seen: list[str] = []

        _for_each_systemd_gateway_unit(
            "\n".join(
                [
                    "ssh.service loaded active running",
                    "zalvo-serve.service loaded active running",
                    "zalvo-serve-work.service loaded active running",
                    "zalvo-gateway.service loaded active running",
                    "",
                ]
            ),
            process_unit=seen.append,
            on_unit_timeout=lambda *_: pytest.fail("unexpected timeout"),
        )

        assert seen == ["zalvo-serve", "zalvo-serve-work", "zalvo-gateway"]

    def test_zalvo_dashboard_units_are_included(self):
        # #125297 — the same blind spot for the systemd-supervised dashboard: the
        # unit pass skipped zalvo-dashboard*, so a successful update left the
        # dashboard on pre-update code with outcome "deferred" and nothing
        # restarted it. Reconciliation already credits zalvo-dashboard{,-<profile>}
        # unit restarts; the pass must produce one.
        seen: list[str] = []

        _for_each_systemd_gateway_unit(
            "\n".join(
                [
                    "ssh.service loaded active running",
                    "zalvo-dashboard.service loaded active running",
                    "zalvo-dashboard-work.service loaded active running",
                    "zalvo-serve.service loaded active running",
                    "",
                ]
            ),
            process_unit=seen.append,
            on_unit_timeout=lambda *_: pytest.fail("unexpected timeout"),
        )

        assert seen == ["zalvo-dashboard", "zalvo-dashboard-work", "zalvo-serve"]

    def test_zalvo_dashboard_near_prefix_is_rejected(self):
        # Same strict shape on the dashboard side: a bare
        # ``startswith("zalvo-dashboard")`` gate would also accept the
        # unrelated ``zalvo-dashboardd.service``.
        seen: list[str] = []

        _for_each_systemd_gateway_unit(
            _list_units_stdout(["zalvo-dashboardd", "zalvo-dashboard-work"]),
            process_unit=seen.append,
            on_unit_timeout=lambda *_: pytest.fail("unexpected timeout"),
        )

        assert seen == ["zalvo-dashboard-work"]

    def test_zalvo_server_near_prefix_is_rejected(self):
        # Review on #83595: a bare ``startswith("zalvo-serve")`` gate also
        # accepts the unrelated ``zalvo-server.service``. Only the exact
        # base unit or the hyphenated profile family should pass.
        seen: list[str] = []

        _for_each_systemd_gateway_unit(
            _list_units_stdout(["zalvo-server"]),
            process_unit=seen.append,
            on_unit_timeout=lambda *_: pytest.fail("unexpected timeout"),
        )

        assert seen == []

    def test_zalvo_gateway_near_prefix_is_rejected(self):
        # Same strict shape on the gateway side: profile units are
        # ``zalvo-gateway-<profile>``, so a hypothetical
        # ``zalvo-gatewayd.service`` must not enter the restart path.
        seen: list[str] = []

        _for_each_systemd_gateway_unit(
            _list_units_stdout(["zalvo-gatewayd", "zalvo-gateway-coder"]),
            process_unit=seen.append,
            on_unit_timeout=lambda *_: pytest.fail("unexpected timeout"),
        )

        assert seen == ["zalvo-gateway-coder"]


class TestGracefulSigusr1Eligibility:
    def test_gateway_units_are_eligible(self):
        assert _service_unit_supports_graceful_sigusr1_restart("zalvo-gateway")
        assert _service_unit_supports_graceful_sigusr1_restart(
            "zalvo-gateway-work"
        )

    def test_serve_units_are_not_eligible(self):
        # zalvo-serve doesn't run gateway/run.py, so it never installs the
        # SIGUSR1 handler — sending it the signal would just terminate the
        # process (the default action) instead of draining gracefully.
        assert not _service_unit_supports_graceful_sigusr1_restart("zalvo-serve")
        assert not _service_unit_supports_graceful_sigusr1_restart(
            "zalvo-serve-work"
        )

    def test_process_errors_other_than_timeout_still_propagate(self):
        def process_unit(_svc_name: str) -> None:
            raise RuntimeError("not a timeout")

        with pytest.raises(RuntimeError, match="not a timeout"):
            _for_each_systemd_gateway_unit(
                _list_units_stdout(["zalvo-gateway"]),
                process_unit=process_unit,
                on_unit_timeout=lambda *_: pytest.fail("timeout handler must not run"),
            )


class TestIncompleteFleetRestartWarning:
    def test_warns_with_exact_unrestarted_units(self, capsys):
        _warn_incomplete_gateway_fleet_restart(
            ["zalvo-gateway-xiaomo5", "zalvo-gateway-xiaomo6", "zalvo-gateway-xiaomo5"]
        )
        out = capsys.readouterr().out
        assert "Update incomplete" in out
        assert out.count("zalvo-gateway-xiaomo5") == 1
        assert "zalvo-gateway-xiaomo6" in out
        assert "pre-update code" in out

