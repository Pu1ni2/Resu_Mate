"""The ranked list shows the address the batch actions will invite.

It read candidate["email"], which an upload rarely sets, so most candidates
showed "no email" while the batch found and invited the résumé's address.
"""
import asyncio

from app.services.ats_service import ats_service


def _score(candidate):
    return asyncio.get_event_loop().run_until_complete(ats_service.score_candidate(candidate, {}))


def test_the_ranked_list_shows_the_address_on_the_resume():
    assert _score({"id": 1, "name": "Cand", "text": "Cand\nCand.One@X.com | 555-0100"})["email"] == "cand.one@x.com"


def test_a_resume_without_an_address_shows_none():
    assert _score({"id": 2, "name": "Cand", "text": "Cand\nEngineer"})["email"] == ""
