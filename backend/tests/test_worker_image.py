"""The interview worker's image: what goes into it, and how it runs."""
import re
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]


def _dockerfile():
    return (BACKEND / "Dockerfile.agent").read_text(encoding="utf-8")


def test_the_build_reads_only_the_files_the_image_copies():
    # Fly.io builds on its own servers, so everything the build may read
    # is sent there: the .env with its keys, without this.
    rules = [line.strip() for line in (BACKEND / ".dockerignore").read_text(encoding="utf-8").splitlines()
             if line.strip() and not line.strip().startswith("#")]
    assert rules[0] == "*" and all(rule.startswith("!") for rule in rules[1:])
    allowed = {rule[1:] for rule in rules[1:]}
    copied = {source for line in re.findall(r"^COPY\s+(.+)$", _dockerfile(), re.M) for source in line.split()[:-1]}
    assert allowed == copied == {"requirements-agent.txt", "interview_agent.py"}


def test_the_worker_runs_as_its_own_user_not_root():
    lines = _dockerfile().splitlines()
    users = [(n, line.split()[1]) for n, line in enumerate(lines) if line.startswith("USER ")]
    assert users and users[-1][1] not in ("root", "0")
    # Set after every step that installs or copies, which still run as root.
    assert users[-1][0] > max(n for n, line in enumerate(lines) if line.startswith(("RUN ", "COPY ")))
