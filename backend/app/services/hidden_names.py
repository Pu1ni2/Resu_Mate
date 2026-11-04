"""Whether a manager's request keeps candidates' names from the AI.

"Hide names" is kept on the account (HiringManager.hide_names), and a request
may ask for it too: either hides them. It was the request's word alone, so a
request that didn't say, such as Jarvis, the online lookup or a batch of
email drafts, sent every name and address.
"""
import re
from typing import Dict

from app.services.resume_rag import resume_rag

_URL = re.compile(r"(?:https?://|www\.)\S+|\b(?:linkedin|github)\.com/\S+", re.I)
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
# Digits with the separators a phone number has. Only nine digits or more
# are taken for one, so "2019 - 2023" stays.
_PHONE = re.compile(r"\+?\(?\d[\d\s().-]{6,}\d")


def hides_names(user, asked: bool = False) -> bool:
    return bool(asked) or bool(getattr(user, "hide_names", False))


def stand_ins(manager_id: int) -> Dict[int, str]:
    """Each of the manager's candidates as the pages name them while names are
    hidden: "Candidate N", by their place in the list (by id)."""
    ids = sorted(c["id"] for c in resume_rag.get_all_candidates(manager_id=manager_id) if c.get("id") is not None)
    return {cid: f"Candidate {i + 1}" for i, cid in enumerate(ids)}


def scrub(text: str, name: str, stand_in: str = "The Candidate") -> str:
    """Text about a candidate with their name, addresses, phone numbers and
    links taken out, for the AI while names are hidden. The file's chat sent
    the whole résumé text, and only asked the AI not to use the name."""
    out = _URL.sub("[link]", text or "")
    out = _EMAIL.sub("[email]", out)
    out = _PHONE.sub(lambda m: "[phone]" if sum(ch.isdigit() for ch in m.group(0)) >= 9 else m.group(0), out)
    # The whole name once, then any part of it on its own.
    if (name or "").strip():
        out = re.sub(r"\s+".join(re.escape(p) for p in name.split()), stand_in, out, flags=re.I)
    for part in (name or "").split():
        if len(part) > 2:
            out = re.sub(rf"\b{re.escape(part)}\b", stand_in, out, flags=re.I)
    return out


# What can be looked up online is a person's name; with names hidden it isn't.
NO_LOOKUP = "Names are hidden, so they aren't looked up online."
