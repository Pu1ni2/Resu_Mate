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


def test_fly_toml_writes_down_no_server_address():
    # It held the API's address, so a moved API kept being sent transcripts
    # at the old one. It's a setting given at deploy now.
    fly = tomllib.loads((ROOT / "backend" / "fly.toml").read_text(encoding="utf-8"))
    assert "BACKEND_URL" not in fly.get("env", {})


def _deploy_section(title):
    deploy = (ROOT / "backend" / "DEPLOY.md").read_text(encoding="utf-8")
    start = deploy.index(f"\n## {title}\n")
    return deploy[start:deploy.index("\n## ", start + 1)]


def test_the_checklist_names_what_production_cant_start_without():
    checklist = _deploy_section("Going live: the checklist")
    for setting in ("FRONTEND_URL", "SENDGRID_API_KEY", "FROM_EMAIL", "DATABASE_URL", "SECRET_KEY",
                    "DEBUG=false", "VITE_API_URL", "BACKEND_URL", "AGENT_SHARED_SECRET"):
        assert f"`{setting}" in checklist, setting
    # What a service made by hand needs, as render.yaml has it.
    assert "After CI Checks Pass" in checklist
    assert "--timeout-graceful-shutdown 10" in checklist
    assert "--timeout-graceful-shutdown 10" in _service("resumate-backend")["startCommand"]


def test_deploy_md_names_every_ci_job_and_says_email_is_required():
    ci = yaml.safe_load((ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8"))
    listed = _deploy_section("CI")
    assert [job for job in ci["jobs"] if f"**{job}**" not in listed] == []
    # It said production ran without email: it doesn't start without it.
    assert "Production doesn't start without email" in _deploy_section("Email")


def test_a_deploy_lets_the_background_jobs_under_way_end_too():
    # The app's own shutdown gives them JOBS_SHUTDOWN_GRACE_SECONDS, after
    # uvicorn's wait for the requests: both, and a moment for the jobs put
    # back to be written, before Render ends the process.
    from app.core.config import Settings
    api = _service("resumate-backend")
    requests = int(re.search(r"--timeout-graceful-shutdown (\d+)", api["startCommand"]).group(1))
    jobs = Settings.model_fields["jobs_shutdown_grace_seconds"].default
    assert requests + jobs + 5 <= api["maxShutdownDelaySeconds"]
    assert "JOBS_SHUTDOWN_GRACE_SECONDS" in _render_text()


def test_deploy_md_says_how_the_background_jobs_run_with_every_setting():
    from app.core.config import Settings
    notes = _deploy_section("Background jobs")
    assert "One instance" in notes and "Keep the API at one instance" in _deploy_section("Going live: the checklist")
    shown = {"jobs_runner": "true", "jobs_work_concurrency": "2", "jobs_email_concurrency": "2",
             "jobs_shutdown_grace_seconds": "15", "jobs_keep_days": "14", "retention_days": "0"}
    # Every setting of theirs, with its default as it is.
    assert sorted(shown) == sorted(name for name in Settings.model_fields if name.startswith("jobs_")) + ["retention_days"]
    for name, default in shown.items():
        assert str(Settings.model_fields[name].default).lower().removesuffix(".0") == default
        assert f"`{name.upper()}={default}`" in notes, name
