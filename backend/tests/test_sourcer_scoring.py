"""The sourcer's arithmetic: how a judgement becomes a score, and what counts as
"a keyword filter would have found them".

Both are deliberately free of any model. The judge only says how strongly a
profile shows each criterion; the number and the filter comparison are rules,
so the same answers always give the same result and a manager can check it.
"""
from app.agents.sourcer_agent import (
    MUST_MISS_CAP, SHORTLIST_AT, _fallback_plan, _normalise_plan, filter_match, score_person,
)

CRITERIA = [
    {"id": "c1", "kind": "must"},
    {"id": "c2", "kind": "must"},
    {"id": "c3", "kind": "nice"},
]


def _answers(*levels):
    return [{"id": f"c{i + 1}", "level": lvl} for i, lvl in enumerate(levels)]


def test_levels_are_weighted_must_twice_nice():
    # (2·1.0 + 2·0.6 + 1·0.3) / 5 = 0.70
    assert score_person(CRITERIA, _answers("strong", "partial", "weak")) == (70, "shortlist")
    assert score_person(CRITERIA, _answers("strong", "strong", "strong")) == (100, "shortlist")


def test_a_missed_must_have_caps_the_score_below_the_line():
    points, verdict = score_person(CRITERIA, _answers("strong", "none", "strong"))
    assert points == MUST_MISS_CAP < SHORTLIST_AT
    assert verdict == "passed"


def test_unknown_earns_nothing_but_is_not_a_miss():
    # A thin profile is not evidence against someone: no cap applies.
    assert score_person(CRITERIA, _answers("strong", "unknown", "strong")) == (60, "shortlist")


def test_missing_or_unrecognised_answers_count_as_unknown():
    assert score_person(CRITERIA, []) == (0, "passed")
    assert score_person(CRITERIA, _answers("superb", "strong", "strong")) == (60, "shortlist")


def test_the_same_answers_always_give_the_same_score():
    answers = _answers("partial", "strong", "weak")
    assert len({score_person(CRITERIA, answers) for _ in range(20)}) == 1


FILTER = {"title_terms": ["backend engineer"], "keyword_terms": ["python", "c++"], "location_terms": ["boston"]}


def _p(headline, text, location):
    return {"headline": headline, "text": text, "location": location}


def test_the_filter_needs_a_title_every_keyword_and_a_place():
    assert filter_match(_p("Senior Backend Engineer", "python and c++", "Boston, MA"), FILTER)
    assert not filter_match(_p("Founding engineer", "python and c++", "Boston"), FILTER)   # title
    assert not filter_match(_p("Backend Engineer", "python only", "Boston"), FILTER)       # a keyword
    assert not filter_match(_p("Backend Engineer", "python, c++", "Seattle"), FILTER)      # place


def test_filter_terms_match_whole_words_including_punctuated_ones():
    assert filter_match(_p("backend engineer", "c++; python.", "boston"), FILTER)
    assert not filter_match(_p("backend engineer", "pythonic c++", "boston"), FILTER)


def test_an_empty_filter_matches_nobody():
    assert not filter_match(_p("anything", "anything", "anywhere"), {})


def test_a_plan_is_normalised_and_always_has_a_must_have():
    plan = _normalise_plan({
        "criteria": [{"label": "Python", "kind": "nice"}, {"label": ""}, "junk", {"label": "Shipped", "kind": "NICE"}],
        "filter": {"title_terms": ["Backend Engineer"], "keyword_terms": ["A", "B", "C", "D"]},
        "github_queries": ["q1", "q2", "q3", "q4"],
        "web_queries": "not a list",
    })
    assert [(c["id"], c["label"], c["kind"]) for c in plan["criteria"]] == [("c1", "Python", "must"), ("c2", "Shipped", "nice")]
    assert plan["filter"]["title_terms"] == ["backend engineer"]
    assert plan["filter"]["keyword_terms"] == ["a", "b", "c"]
    assert plan["github_queries"] == ["q1", "q2", "q3"] and plan["web_queries"] == []


def test_the_fallback_plan_reads_the_description_itself():
    plan = _fallback_plan("Backend engineer in Boston, strong Python, has shipped a real product")
    assert plan["req"]["title"] == "Backend engineer" and plan["req"]["location"] == "Boston"
    kinds = {c["label"]: c["kind"] for c in plan["criteria"]}
    assert kinds["Backend engineer"] == "must" and kinds["strong Python"] == "must"
    assert kinds["has shipped a real product"] == "nice" and kinds["Based in Boston"] == "nice"
    assert plan["github_queries"] == ["language:python location:Boston"]
    assert plan["filter"] == {"title_terms": ["backend engineer"], "keyword_terms": ["python"], "location_terms": ["boston"]}


def test_the_fallback_plan_quotes_a_multi_word_city_for_github():
    plan = _fallback_plan("Data scientist based in San Francisco with deep Python")
    assert plan["github_queries"] == ['language:python location:"San Francisco"']
