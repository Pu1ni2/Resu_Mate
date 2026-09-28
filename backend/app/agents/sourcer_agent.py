"""
Sourcer Agent: finds people for a role and writes a judgement on every one.

A hiring manager describes who they want in plain words. The agent turns that
into a handful of criteria, gathers people (the manager's own uploads, GitHub,
public profiles from web search) and reads each one against every criterion,
instead of filtering on title and keywords first and reading only what survives.

It streams events as it works, so it does not use BaseAgent's run loop:
BaseAgent.run() reports nothing until it has finished.
"""
import json
import re
from typing import Dict, List, Tuple

from app.core.config import settings
from app.tools.openai_tool import openai_tool


MAX_CRITERIA = 8
MAX_QUERIES = 3

_PLAN_SYSTEM = (
    "You turn a hiring manager's description of who they want into a search plan. "
    "Return ONLY valid JSON."
)

_PLAN_PROMPT = """A hiring manager described who they want to hire:

\"\"\"{description}\"\"\"

Return ONLY this JSON:
{{
  "req": {{"title": "short role title", "location": "city or region, or empty", "summary": "one line"}},
  "criteria": [{{"label": "2-4 words", "kind": "must or nice"}}],
  "filter": {{"title_terms": [], "keyword_terms": [], "location_terms": []}},
  "github_queries": [],
  "web_queries": []
}}

Rules:
- 5 to 8 criteria, each something you can judge from a public profile or a resume:
  a skill, the kind of work, evidence of shipping, seniority, location. At least one is "must".
- Never a criterion about age, gender, ethnicity, nationality, religion, disability,
  family, or any other protected trait. Not "young", not "native speaker", not "culture fit".
- filter is what a recruiter would type into a title + keyword search, taken literally
  from the description: title_terms are job-title words, keyword_terms are at most 3 hard
  skills, location_terms are places. Lowercase.
- github_queries use GitHub user-search syntax, e.g. "language:python location:boston". At most 3.
- web_queries find public profile pages, e.g. "site:linkedin.com/in backend engineer boston python". At most 3."""


def _parse_json(raw: str) -> Dict:
    # Same tolerance as ats_service.parse_jd: the model sometimes fences its JSON.
    raw = re.sub(r"```(?:json)?", "", raw or "").strip().rstrip("`").strip()
    data = json.loads(raw)
    return data if isinstance(data, dict) else {}


def _strings(value, limit: int, max_len: int = 120) -> List[str]:
    if not isinstance(value, list):
        return []
    out = []
    for v in value:
        s = str(v).strip()[:max_len]
        if s and s not in out:
            out.append(s)
    return out[:limit]


def _normalise_plan(raw: Dict) -> Dict:
    req = raw.get("req") if isinstance(raw.get("req"), dict) else {}
    criteria = []
    for c in raw.get("criteria") or []:
        if not isinstance(c, dict):
            continue
        label = str(c.get("label", "")).strip()[:40]
        if not label:
            continue
        kind = "must" if str(c.get("kind", "")).lower() == "must" else "nice"
        criteria.append({"id": f"c{len(criteria) + 1}", "label": label, "kind": kind})
        if len(criteria) == MAX_CRITERIA:
            break
    # A plan with no must-have would shortlist on nice-to-haves alone.
    if criteria and not any(c["kind"] == "must" for c in criteria):
        criteria[0]["kind"] = "must"
    filt = raw.get("filter") if isinstance(raw.get("filter"), dict) else {}
    return {
        "req": {
            "title": str(req.get("title", "")).strip()[:80],
            "location": str(req.get("location", "")).strip()[:80],
            "summary": str(req.get("summary", "")).strip()[:200],
        },
        "criteria": criteria,
        "filter": {
            "title_terms": [t.lower() for t in _strings(filt.get("title_terms"), 6, 40)],
            "keyword_terms": [t.lower() for t in _strings(filt.get("keyword_terms"), 3, 40)],
            "location_terms": [t.lower() for t in _strings(filt.get("location_terms"), 4, 40)],
        },
        "github_queries": _strings(raw.get("github_queries"), MAX_QUERIES),
        "web_queries": _strings(raw.get("web_queries"), MAX_QUERIES),
    }


def _has_term(haystack: str, term: str) -> bool:
    # Whole-word match that still works for terms like "c++" or "node.js",
    # where \b would fail on the punctuation.
    return re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", haystack) is not None


def filter_match(person: Dict, filt: Dict) -> bool:
    """Would a title + keyword search have returned this person?

    This is the baseline that reading everyone is compared against, so it is
    deliberately as literal as a boolean search: a title term in the headline,
    AND every keyword term somewhere in the profile, AND a location term in the
    location when the search named one. No LLM is involved, so the comparison is
    arithmetic rather than a second opinion.
    """
    titles = filt.get("title_terms") or []
    keywords = filt.get("keyword_terms") or []
    places = filt.get("location_terms") or []
    if not (titles or keywords or places):
        return False
    headline = (person.get("headline") or "").lower()
    profile = f"{headline} {(person.get('text') or '').lower()}"
    location = (person.get("location") or "").lower()
    if titles and not any(_has_term(headline, t) for t in titles):
        return False
    if not all(_has_term(profile, k) for k in keywords):
        return False
    if places and not any(p in location for p in places):
        return False
    return True


class SourcerAgent:
    name = "SourcerAgent"

    async def plan(self, description: str) -> Tuple[Dict, Dict]:
        """Turn the manager's description into criteria and searches.

        Returns (plan, usage).
        """
        raw, usage = await openai_tool.structured_call_with_usage(
            _PLAN_PROMPT.format(description=description[:2000]),
            _PLAN_SYSTEM,
            model=settings.sourcer_llm_model,
        )
        try:
            plan = _normalise_plan(_parse_json(raw))
        except (ValueError, TypeError) as e:
            print(f"[WARN] sourcer plan unreadable: {e}")
            plan = _normalise_plan({})
        return plan, usage


sourcer_agent = SourcerAgent()
