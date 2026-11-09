"""CI's own settings: what its jobs may do, and the checks it runs."""
import re
import subprocess
import sys
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


def test_ci_audits_every_locked_package_and_explains_each_exception():
    audit = next(run for run in _runs("backend") if run.startswith("pip-audit"))
    assert "-r requirements-dev.txt" in audit and "--require-hashes" in audit
    workflow = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    for vulnerability in re.findall(r"--ignore-vuln (\S+)", audit):
        # Its reason is written beside it.
        assert re.search(rf"^\s*#.*{re.escape(vulnerability)}", workflow, re.M), vulnerability
    wanted = (BACKEND / "requirements-dev.in").read_text(encoding="utf-8")
    assert re.search(r"^pip-audit\b", wanted, re.M)


def test_the_server_sets_up_no_tracing_which_the_ignored_flaw_needs():
    # CVE-2026-114603, ignored above, costs CPU only where tracing is set up.
    # In a process of its own, so no other test's imports count.
    started = subprocess.run(
        [sys.executable, "-c", "import main; from opentelemetry import trace; "
         "print(type(trace.get_tracer_provider()).__name__)"],
        cwd=BACKEND, capture_output=True, text=True, timeout=120,
    )
    assert started.returncode == 0, started.stderr[-2000:]
    assert started.stdout.strip().splitlines()[-1] == "ProxyTracerProvider"
    setting_up = [path.name for path in [BACKEND / "main.py", *sorted((BACKEND / "app").rglob("*.py"))]
                  if re.search(r"^\s*(from|import)\s+opentelemetry\b", path.read_text(encoding="utf-8"), re.M)]
    assert setting_up == []
