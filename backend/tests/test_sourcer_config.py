"""The sourcer's settings, as a copied .env.example writes them.

.env.example leaves the prices blank on purpose. A blank must mean "no price",
not stop the app from booting; a mistyped price must still fail loudly.
"""
import pytest
from pydantic import ValidationError

from app.core.config import Settings


def _settings():
    # Ignore the developer's own .env: only the variables set here count.
    return Settings(_env_file=None)


def test_blank_prices_mean_no_price(monkeypatch):
    monkeypatch.setenv("SOURCER_PRICE_IN_PER_1M", "")
    monkeypatch.setenv("SOURCER_PRICE_OUT_PER_1M", "  ")
    s = _settings()
    assert s.sourcer_price_in_per_1m is None
    assert s.sourcer_price_out_per_1m is None


def test_a_price_is_read_as_a_number(monkeypatch):
    monkeypatch.setenv("SOURCER_PRICE_IN_PER_1M", "0.15")
    monkeypatch.setenv("SOURCER_PRICE_OUT_PER_1M", "0.6")
    s = _settings()
    assert (s.sourcer_price_in_per_1m, s.sourcer_price_out_per_1m) == (0.15, 0.6)


def test_a_mistyped_price_still_fails_loudly(monkeypatch):
    monkeypatch.setenv("SOURCER_PRICE_IN_PER_1M", "fifteen cents")
    with pytest.raises(ValidationError):
        _settings()


def test_a_blank_model_falls_back_to_the_openai_model(monkeypatch):
    monkeypatch.setenv("SOURCER_MODEL", "")
    monkeypatch.setenv("OPENAI_MODEL", "gpt-4o")
    assert _settings().sourcer_llm_model == "gpt-4o"
    monkeypatch.setenv("SOURCER_MODEL", "gpt-4o-mini")
    assert _settings().sourcer_llm_model == "gpt-4o-mini"
