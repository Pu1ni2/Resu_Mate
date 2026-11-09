"""CI's own settings: what its jobs may do, and the checks it runs."""
import re
import tomllib
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend"


def _ci():
    return yaml.safe_load((ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8"))


def _runs(job):
    return [step.get("run", "") for step in _ci()["jobs"][job]["steps"]]


def test_ci_only_reads_the_code_and_a_newer_push_cancels_the_older_run():
    ci = _ci()
    # A token that can't push or change settings, whatever a step runs.
    assert ci["permissions"] == {"contents": "read"}
    asked = {name: job["permissions"] for name, job in ci["jobs"].items() if "permissions" in job}
    assert all(level in ("read", "none") for permissions in asked.values() for level in permissions.values()), asked
    assert ci["concurrency"] == {"group": "${{ github.workflow }}-${{ github.ref }}", "cancel-in-progress": True}


def test_ci_checks_the_backends_python_with_ruff_before_the_tests():
    runs = _runs("backend")
    assert runs.index("ruff check .") < runs.index("pytest -q")
    # Syntax errors, comparisons that are always wrong, undefined names.
    rules = tomllib.loads((BACKEND / "ruff.toml").read_text(encoding="utf-8"))["lint"]["select"]
    assert {"E9", "F63", "F7", "F82"} <= set(rules)
    wanted = (BACKEND / "requirements-dev.in").read_text(encoding="utf-8")
    assert re.search(r"^ruff\b", wanted, re.M)
