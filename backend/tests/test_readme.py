"""The README's instructions for running ResuMate and putting it online.

It had neither. They name files, scripts and settings that change, so these
check each still exists, and that the ports are the ones the site uses.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _section(title):
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    start = readme.index(f"\n## {title}\n")
    end = readme.find("\n## ", start + 1)
    return readme[start:end]


def test_running_it_names_files_and_commands_that_exist():
    run = _section("Run It on Your Computer")
    named = set(re.findall(r"requirements[\w-]*\.(?:txt|in)\b", run))
    assert "requirements-dev.txt" in named
    assert all((ROOT / "backend" / name).exists() for name in named), named
    assert "python scripts/lock_requirements.py" in run
    assert (ROOT / "backend" / "scripts" / "lock_requirements.py").exists()
    assert "cp .env.example .env" in run and (ROOT / "backend" / ".env.example").exists()
    scripts = json.loads((ROOT / "frontend" / "package.json").read_text(encoding="utf-8"))["scripts"]
    run_scripts = set(re.findall(r"npm run (\w+)", run))
    assert run_scripts and run_scripts <= set(scripts), run_scripts
    # The ports the site's dev server uses: its own, and the backend's.
    vite = (ROOT / "frontend" / "vite.config.js").read_text(encoding="utf-8")
    assert "port: 3006" in vite and "http://127.0.0.1:8006" in vite
    assert "http://localhost:3006" in run and "--port 8006" in run


def test_putting_it_online_names_the_settings_production_requires():
    online = _section("Put It Online")
    for setting in ("FRONTEND_URL", "VITE_API_URL", "OPENAI_API_KEY", "SENDGRID_API_KEY"):
        assert f"`{setting}`" in online, setting
    assert "backend/DEPLOY.md" in online and "render.yaml" in online


def test_notes_elsewhere_describe_what_the_code_does_now():
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    # Jarvis and the Advisor read OPENAI_MODEL too, since the models moved
    # into the settings.
    assert "Jarvis and the Advisor use `gpt-4o`" not in readme
    # Nothing is printed without SendGrid: the server says only that it
    # didn't send.
    assert "printed to the console" not in (ROOT / "backend" / ".env.example").read_text(encoding="utf-8")
    # tokenizers went with ChromaDB; Python 3.12 now holds for the locks.
    assert "tokenizers" not in (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    deploy = (ROOT / "backend" / "DEPLOY.md").read_text(encoding="utf-8")
    start = deploy.index("## Python version")
    assert "locked requirements" in deploy[start:deploy.index("\n## ", start + 1)]
