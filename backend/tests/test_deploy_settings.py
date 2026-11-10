"""How Render and Fly.io run ResuMate: render.yaml and backend/fly.toml."""
import re
import tomllib
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]


def _render_text():
    return (ROOT / "render.yaml").read_text(encoding="utf-8")


def _service(name):
    return next(s for s in yaml.safe_load(_render_text())["services"] if s["name"] == name)


def _worker_block():
    """The worker's service, commented out until it's deployed."""
    lines = _render_text().splitlines()
    block = []
    for line in lines[lines.index("  # - type: worker"):]:
        if not line.startswith("  # "):
            break
        block.append(line[4:])
    return yaml.safe_load("\n".join(block))[0]


def test_render_deploys_only_commits_ci_has_passed():
    for service in (_service("resumate-backend"), _service("resumate-frontend"), _worker_block()):
        assert service["autoDeployTrigger"] == "checksPass", service["name"]


def test_the_static_site_names_no_plan():
    # Render's schema refuses one: a static site has no plans.
    assert "plan" not in _service("resumate-frontend")


def test_a_deploy_lets_the_api_and_the_worker_finish_their_work():
    api = _service("resumate-backend")
    grace = int(re.search(r"--timeout-graceful-shutdown (\d+)", api["startCommand"]).group(1))
    # Room after it for the app's own shutdown, before Render ends the process.
    assert grace + 10 <= api["maxShutdownDelaySeconds"]
    # The worker finishes the interviews under way: each platform's longest wait.
    assert _worker_block()["maxShutdownDelaySeconds"] == 300
    fly = tomllib.loads((ROOT / "backend" / "fly.toml").read_text(encoding="utf-8"))
    assert (fly["kill_signal"], fly["kill_timeout"]) == ("SIGTERM", "300s")
