"""A candidate's years of experience, when the résumé gives them.

Unknown stays unknown (None). A résumé the analysis couldn't read, or whose
years it couldn't tell, was given 0, which the pages and the AI's prompts
then stated as fact: "0 years".
"""
from typing import Optional


def known_years(value) -> Optional[float]:
    """The years as a number, or None when they aren't known."""
    if isinstance(value, bool):
        return None
    try:
        years = float(value)
    except (TypeError, ValueError):
        return None
    # NaN isn't equal to itself.
    return years if years == years and years >= 0 else None


def experience_text(value) -> str:
    """"5 years", "1 year", or "not known", for a prompt."""
    years = known_years(value)
    if years is None:
        return "not known"
    shown = int(years) if years == int(years) else round(years, 1)
    return f"{shown} year{'' if shown == 1 else 's'}"
