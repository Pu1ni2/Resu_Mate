"""How Render and Fly.io run ResuMate: render.yaml and backend/fly.toml."""
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
