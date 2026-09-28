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
from app.services.resume_rag import resume_rag
from app.tools.openai_tool import openai_tool


MAX_CRITERIA = 8
MAX_QUERIES = 3
# How much of a profile the judge reads. Enough for a resume summary and work
# history, small enough that a batch of people fits one call.
MAX_TEXT = 3000

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


# Languages GitHub's user search understands as language:<name>.
_LANGUAGES = (
    "python", "javascript", "typescript", "java", "go", "rust", "ruby", "php",
    "kotlin", "swift", "scala", "c++", "c#", "elixir",
)
_MUST_WORDS = ("must", "strong", "required", "expert", "deep")


def _fallback_plan(description: str) -> Dict:
    """A usable plan with no LLM: the description's own phrases become criteria.

    Cruder than the model's plan, but it keeps the sourcer working in dev and in
    tests, and when the model's reply can't be read. The first phrase is the
    role. A phrase that says "strong", "must", "required" and the like is a
    must-have; the rest are nice-to-haves.
    """
    text = " ".join((description or "").split())
    lower = text.lower()
    m = re.search(r"\b(?:based in|in|near)\s+([A-Z][A-Za-z .'-]*?)(?=[,.;]|$|\s+(?:with|who|and)\b)", text)
    location = m.group(1).strip() if m else ""
    phrases = [
        p.strip(" .")
        for p in re.split(r",|;|\band\b|\bwith\b|\bwho\b", text, flags=re.I)
        if p.strip(" .")
    ]
    title = phrases[0] if phrases else text[:60]
    if location:
        title = re.sub(rf"\s*\b(?:based in|in|near)\s+{re.escape(location)}\b", "", title).strip() or title

    criteria = [{"id": "c1", "label": title[:40] or "Role fit", "kind": "must"}]
    for p in phrases[1:]:
        if p.lower().startswith(("in ", "based in", "near ")):
            continue
        kind = "must" if any(w in p.lower() for w in _MUST_WORDS) else "nice"
        criteria.append({"id": f"c{len(criteria) + 1}", "label": p[:40], "kind": kind})
    if location:
        criteria.append({"id": f"c{len(criteria) + 1}", "label": f"Based in {location}"[:40], "kind": "nice"})
    criteria = criteria[:MAX_CRITERIA]

    languages = [lang for lang in _LANGUAGES if _has_term(lower, lang)]
    gh_location = f' location:"{location}"' if " " in location else (f" location:{location}" if location else "")
    github_queries = [f"language:{lang}{gh_location}" for lang in languages[:MAX_QUERIES]]
    if not github_queries and location:
        github_queries = [gh_location.strip()]

    return {
        "req": {"title": title[:80], "location": location[:80], "summary": text[:200]},
        "criteria": criteria,
        "filter": {
            "title_terms": [title.lower()[:40]] if title else [],
            "keyword_terms": languages[:3],
            "location_terms": [location.lower()] if location else [],
        },
        "github_queries": github_queries,
        "web_queries": [f"site:linkedin.com/in {title} {location}".strip()] if title else [],
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


def _person(source: str, external_id, name: str, *, url: str = "", avatar_url: str = "",
            email: str = "", location: str = "", headline: str = "", text: str = "") -> Dict:
    """One person to read, whatever the source. `text` is what the judge reads."""
    external_id = str(external_id)
    return {
        "pid": f"{source}:{external_id}",
        "source": source,
        "external_id": external_id,
        "name": (name or "Unknown").strip()[:200],
        "url": url or "",
        "avatar_url": avatar_url or "",
        "email": email or "",
        "location": (location or "")[:200],
        "headline": (headline or "")[:300],
        "text": (text or "")[:MAX_TEXT],
    }


def people_from_uploads(manager_id) -> List[Dict]:
    """The manager's own uploaded resumes, as people to read.

    Goes through get_all_candidates(manager_id), so one manager's run can never
    read another manager's candidates. Uploads that were not resumes are skipped.
    """
    people = []
    for c in resume_rag.get_all_candidates(manager_id):
        if c.get("is_resume") is False:
            continue
        skills = ", ".join(str(s) for s in (c.get("skills") or [])[:30])
        work = "; ".join(
            f"{w.get('title', '')} at {w.get('company', '')}"
            for w in (c.get("work_experience") or [])[:8]
            if isinstance(w, dict)
        )
        text = "\n".join(part for part in (
            c.get("summary") or "",
            f"Skills: {skills}" if skills else "",
            f"Experience: {work}" if work else "",
            c.get("text") or c.get("raw_text") or "",
        ) if part)
        headline = " · ".join(x for x in (c.get("predicted_role"), c.get("experience_level")) if x)
        people.append(_person(
            "upload", c.get("id"), c.get("name"),
            email=c.get("email"), location=c.get("location"), headline=headline, text=text,
        ))
    return people


class SourcerAgent:
    name = "SourcerAgent"

    async def plan(self, description: str) -> Tuple[Dict, Dict]:
        """Turn the manager's description into criteria and searches.

        Returns (plan, usage). Without an LLM, or when its reply has no usable
        criteria, the plan is built from the description's own phrases.
        """
        usage = {"input_tokens": 0, "output_tokens": 0}
        if not openai_tool.llm:
            return _fallback_plan(description), usage
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
        if not plan["criteria"]:
            plan = _fallback_plan(description)
        return plan, usage


sourcer_agent = SourcerAgent()
