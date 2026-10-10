"""Interview answer scores, and their average.

An answer that couldn't be scored has no score (None), not a made-up one:
scoring used to fall back to 5/10, and averages counted a missing score as 0.
"""
from typing import Iterable, Optional


def is_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def score_of(entry) -> Optional[float]:
    """One answer's score: from {"score": n} or a bare number, else None."""
    value = entry.get("score") if isinstance(entry, dict) else entry
    return value if is_number(value) else None


def average_score(scores: Iterable) -> Optional[float]:
    """The average of the scored answers, to one decimal, or None if none was."""
    numbers = [n for n in (score_of(s) for s in (scores or [])) if n is not None]
    return round(sum(numbers) / len(numbers), 1) if numbers else None


def describe_average(scores: Iterable) -> str:
    """For a prompt or a page: "7.5/10", or "not scored"."""
    average = average_score(scores)
    return f"{average:.1f}/10" if average is not None else "not scored"
