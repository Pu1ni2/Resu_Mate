"""The video interviewer plays every part of a reply.

gpt-realtime-2 can give one reply in parts: a lead-in, then the question.
LiveKit agents before 1.5.12 played only the first part, so video interviews
skipped questions. The worker's packages are pinned, to one version, in both
requirements files.
"""
import re
from importlib.metadata import version
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
WORKER_PACKAGES = ("livekit-agents", "livekit-plugins-openai", "livekit-plugins-simli")
FIRST_THAT_PLAYS_EVERY_PART = (1, 5, 12)


def _parts(text):
    return tuple(int(p) for p in text.split(".")[:3])


def _pins(requirements):
    lines = (BACKEND / requirements).read_text(encoding="utf-8").splitlines()
    found = {}
    for line in lines:
        match = re.fullmatch(r"\s*([A-Za-z0-9_.-]+)\s*==\s*([0-9.]+)\s*", line)
        if match and match.group(1).lower() in WORKER_PACKAGES:
            found[match.group(1).lower()] = match.group(2)
    return found


def test_the_installed_worker_library_plays_every_part_of_a_reply():
    assert _parts(version("livekit-agents")) >= FIRST_THAT_PLAYS_EVERY_PART


def test_both_requirements_pin_the_worker_to_one_version_that_does():
    worker, server = _pins("requirements-agent.txt"), _pins("requirements.txt")
    assert set(worker) == set(server) == set(WORKER_PACKAGES)
    assert len(set(worker.values()) | set(server.values())) == 1
    assert _parts(worker["livekit-agents"]) >= FIRST_THAT_PLAYS_EVERY_PART
