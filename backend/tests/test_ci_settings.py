"""CI's own settings: what its jobs may do, and the checks it runs."""
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]


def _ci():
    return yaml.safe_load((ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8"))


def test_ci_only_reads_the_code_and_a_newer_push_cancels_the_older_run():
    ci = _ci()
    # A token that can't push or change settings, whatever a step runs.
    assert ci["permissions"] == {"contents": "read"}
    asked = {name: job["permissions"] for name, job in ci["jobs"].items() if "permissions" in job}
    assert all(level in ("read", "none") for permissions in asked.values() for level in permissions.values()), asked
    assert ci["concurrency"] == {"group": "${{ github.workflow }}-${{ github.ref }}", "cancel-in-progress": True}
