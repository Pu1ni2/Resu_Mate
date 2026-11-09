"""Every install at exact versions, checked against their hashes.

The requirement files named only lowest versions (fastapi>=0.109.0), so each
deploy installed whatever was newest that day: a deploy could break, or run
versions CI never tested, with no change in the code. Now each .in file names
what's wanted, and scripts/lock_requirements.py pins all of it, dependencies
included, with the hashes of its files on PyPI, into the .txt file of the same
name. Render, CI and the worker's image install those, and pip refuses a file
whose hash doesn't match.
"""
import re
from pathlib import Path

import pytest
from packaging.requirements import Requirement

BACKEND = Path(__file__).resolve().parents[1]
LOCKS = {
    "requirements.txt": "requirements.in",
    "requirements-agent.txt": "requirements-agent.in",
    "requirements-dev.txt": "requirements-dev.in",
}


def _name(text):
    return re.sub(r"[-_.]+", "-", text).lower()


def _entries(lock):
    """Each requirement a lock file installs, its continuation lines joined:
    "name==1.0 ; marker --hash=sha256:... --hash=...". """
    text = re.sub(r"\\\n", " ", (BACKEND / lock).read_text(encoding="utf-8"))
    return [line for line in (raw.split("#", 1)[0].strip() for raw in text.splitlines()) if line]


def _pins(lock):
    """{name: the versions a lock pins it to}; more than one only where a
    platform or Python needs another."""
    pins = {}
    for entry in _entries(lock):
        requirement = Requirement(entry.split(" --", 1)[0])
        pins.setdefault(_name(requirement.name), set()).update(p.version for p in requirement.specifier)
    return pins


def _wanted(in_file):
    """The requirements a .in file names, with those of the files it includes."""
    found = []
    for line in (BACKEND / in_file).read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if line.startswith("-r "):
            found += _wanted(line[3:].strip())
        elif line:
            found.append(Requirement(line))
    return found


@pytest.mark.parametrize("lock", LOCKS)
def test_every_package_is_pinned_exactly_with_its_hashes(lock):
    entries = _entries(lock)
    assert len(entries) >= 50
    for entry in entries:
        requirement, *options = entry.split(" --")
        requirement = Requirement(requirement)
        assert [(p.operator, "*" in p.version) for p in requirement.specifier] == [("==", False)], entry
        assert not (requirement.extras or requirement.url), entry
        assert options and all(re.fullmatch(r"hash=sha256:[0-9a-f]{64}", o.strip()) for o in options), entry


@pytest.mark.parametrize("lock, in_file", LOCKS.items())
def test_each_lock_is_made_from_its_in_file_for_every_system(lock, in_file):
    text = (BACKEND / lock).read_text(encoding="utf-8")
    command = re.search(r"^#\s+(uv pip compile .*)$", text, re.M).group(1).split()
    # Linux, macOS and Windows alike, from Render's Python on: the same file
    # installs on Render, in CI and on a developer's computer.
    runtime = (BACKEND / "runtime.txt").read_text(encoding="utf-8").strip().removeprefix("python-")
    python = ".".join(runtime.split(".")[:2])
    assert "--universal" in command and "--generate-hashes" in command
    assert command[command.index("--python-version") + 1] == python
    assert command[command.index("--output-file") + 1] == lock
    assert command[-1] == in_file


@pytest.mark.parametrize("lock, in_file", LOCKS.items())
def test_each_lock_pins_what_its_in_file_asks_for(lock, in_file):
    pins = _pins(lock)
    for wanted in _wanted(in_file):
        name = _name(wanted.name)
        assert name in pins, name
        for version in pins[name]:
            assert wanted.specifier.contains(version, prereleases=True), (name, version, str(wanted.specifier))


@pytest.mark.parametrize("production", ["requirements.txt", "requirements-agent.txt"])
def test_ci_tests_the_versions_production_runs(production):
    tested, runs = _pins("requirements-dev.txt"), _pins(production)
    assert set(runs) <= set(tested)
    assert {name: versions for name, versions in runs.items() if versions != tested[name]} == {}


def test_the_worker_image_runs_the_python_its_lock_is_made_for():
    # It ran 3.11 while its lock needed 3.12 (av 19), and no longer built.
    dockerfile = (BACKEND / "Dockerfile.agent").read_text(encoding="utf-8")
    image = re.search(r"^FROM python:(\d+\.\d+)", dockerfile, re.M).group(1)
    runtime = (BACKEND / "runtime.txt").read_text(encoding="utf-8").strip().removeprefix("python-")
    assert image == ".".join(runtime.split(".")[:2])
    lock = (BACKEND / "requirements-agent.txt").read_text(encoding="utf-8")
    assert re.search(rf"--python-version {re.escape(image)}\s", lock)
