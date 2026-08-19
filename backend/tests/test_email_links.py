"""Links inside outbound email must be reachable by the recipient.

Regression guard for a hardcoded `http://localhost:5173/candidate/login` in the
live interview-invitation send path. Every candidate invited through a batch
action received a link to their own machine, so the invitation was a dead end
for everyone except a developer running the frontend locally.

A unit test is the right shape here: the failure was invisible in every
environment where it mattered, because you only see it by reading an email that
arrived on someone else's computer.
"""
import re

from app.core.config import Settings


def _settings(**env):
    # Settings reads env at construction; pass overrides explicitly so these
    # tests do not depend on the developer's .env file.
    return Settings(secret_key="x" * 40, debug=True, **env)


def test_candidate_login_url_defaults_to_a_public_host():
    url = _settings().candidate_login_url
    assert url.startswith("https://"), url
    assert "localhost" not in url and "127.0.0.1" not in url, url
    assert url.endswith("/candidate/login"), url


def test_frontend_url_is_configurable():
    url = _settings(frontend_url="https://hire.example.com").candidate_login_url
    assert url == "https://hire.example.com/candidate/login"


def test_trailing_slash_does_not_double_up():
    # A trailing slash in the env var is the most likely way to get "//".
    url = _settings(frontend_url="https://hire.example.com/").candidate_login_url
    assert url == "https://hire.example.com/candidate/login"
    assert "//candidate" not in url


def test_no_localhost_url_is_baked_into_the_send_path():
    """The URL must come from config, not from a literal in the endpoint."""
    from pathlib import Path

    src = Path(__file__).resolve().parents[1] / "app" / "api" / "pipeline.py"
    text = src.read_text(encoding="utf-8")
    # Catches the original bug and any future hardcoded dev host in this module.
    assert not re.search(r"https?://(localhost|127\.0\.0\.1)", text), (
        "pipeline.py contains a hardcoded local URL; outbound email links must "
        "come from settings.frontend_url"
    )
