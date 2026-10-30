"""The candidate chat's welcome: it says nothing of what it runs on, and sends a
manager to the section the dashboard calls Candidates, not an "Upload" tab it
no longer has."""
from app.services.resume_rag import resume_rag


def welcome(count, anonymize=False):
    return resume_rag.get_intro_message(count, anonymize)["response"]


def test_the_welcome_says_nothing_of_what_it_runs_on():
    for count in (0, 1, 3):
        assert "powered by" not in welcome(count).lower()


def test_with_nobody_selected_it_points_to_candidates():
    text = welcome(0)
    assert "Go to **Candidates**" in text
    assert "Upload** tab" not in text


def test_with_names_hidden_it_names_nobody():
    text = welcome(2, anonymize=True)
    assert "candidate 1" in text
    assert "ravi" not in text
