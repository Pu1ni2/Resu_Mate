"""
ATS (Applicant Tracking System) Engine
Scores candidates against a job description or role.
"""
import asyncio
import json
import re
from typing import Optional
from app.tools.openai_tool import openai_tool


class ATSService:

    # ── JD Parsing ────────────────────────────────────────────────────────────

    async def parse_jd(self, jd_text: str, role: str = "") -> dict:
        """Parse a job description into structured requirements via GPT-4o."""
        if not jd_text or not jd_text.strip():
            return {
                "required_skills": [],
                "nice_to_have_skills": [],
                "min_experience_years": 0,
                "education_requirement": "",
                "seniority_level": "",
                "role_keywords": [],
            }

        prompt = f"""Analyze this job description and return a JSON object with:
- required_skills: array of must-have technical skills (e.g. ["Python", "React", "AWS"])
- nice_to_have_skills: array of preferred but optional skills
- min_experience_years: minimum years of experience as a number (0 if not specified)
- education_requirement: degree requirement as string (e.g. "Bachelor's in CS" or "")
- seniority_level: one of "Entry", "Mid", "Senior", "Lead", "Manager" or ""
- role_keywords: array of key role terms (e.g. ["backend", "microservices", "API"])

Role: {role}
Job Description:
{jd_text[:3000]}

Return only valid JSON."""

        try:
            raw = await openai_tool.structured_call(
                prompt,
                system="You are an expert HR analyst. Extract structured requirements from job descriptions. Return only valid JSON."
            )
            # Strip markdown code fences if present
            raw = re.sub(r"```(?:json)?", "", raw).strip().rstrip("`").strip()
            result = json.loads(raw)
            # Normalise keys
            return {
                "required_skills": result.get("required_skills", []),
                "nice_to_have_skills": result.get("nice_to_have_skills", []),
                "min_experience_years": float(result.get("min_experience_years", 0) or 0),
                "education_requirement": result.get("education_requirement", ""),
                "seniority_level": result.get("seniority_level", ""),
                "role_keywords": result.get("role_keywords", []),
            }
        except Exception as e:
            print(f"⚠️ JD parse failed: {e}")
            return {
                "required_skills": [],
                "nice_to_have_skills": [],
                "min_experience_years": 0,
                "education_requirement": "",
                "seniority_level": "",
                "role_keywords": [],
            }

    # ── Algorithmic Scoring ───────────────────────────────────────────────────

    def _score_skills(self, candidate_skills: list, required: list, nice_to_have: list) -> tuple[float, list, list]:
        """Returns (score 0-100, matched_skills[], missing_skills[])"""
        candidate_lower = {str(s).lower() for s in candidate_skills}

        required_lower = [str(s).lower() for s in required]
        matched = [s for s in required_lower if s in candidate_lower]
        missing = [s for s in required_lower if s not in candidate_lower]

        if required_lower:
            required_ratio = len(matched) / len(required_lower)
        else:
            required_ratio = 1.0

        nice_lower = [str(s).lower() for s in nice_to_have]
        if nice_lower:
            nice_matched = sum(1 for s in nice_lower if s in candidate_lower)
            nice_ratio = nice_matched / len(nice_lower)
        else:
            nice_ratio = 1.0

        score = round((required_ratio * 0.8 + nice_ratio * 0.2) * 100)

        # Return original-casing matched/missing from required list
        matched_display = [s for s in required if str(s).lower() in candidate_lower]
        missing_display = [s for s in required if str(s).lower() not in candidate_lower]

        return score, matched_display, missing_display

    def _score_experience(self, candidate_years: float, required_min: float) -> float:
        """Returns experience match score 0-100."""
        if required_min <= 0:
            return 100.0
        years = float(candidate_years or 0)
        if years >= required_min * 1.5:
            return 100.0
        if years >= required_min:
            return 85.0
        if years >= required_min * 0.75:
            return 60.0
        return max(0.0, round((years / required_min) * 50))

    def _score_role_match(self, candidate: dict, role: str, role_keywords: list) -> float:
        """Returns role relevance score 0-100."""
        predicted = str(candidate.get("predicted_role", "")).lower()
        target = role.lower()
        text_pool = (
            predicted + " " +
            str(candidate.get("summary", "")).lower() + " " +
            " ".join(str(s) for s in candidate.get("key_strengths", []))
        ).lower()

        # Direct role title match
        if target in predicted or predicted in target:
            base = 90.0
        else:
            # Keyword overlap
            target_words = set(re.findall(r'\w+', target))
            pred_words = set(re.findall(r'\w+', predicted))
            overlap = len(target_words & pred_words)
            base = min(70.0, overlap * 20.0)

        # Bonus for role keywords in candidate profile
        kw_hits = sum(1 for kw in role_keywords if kw.lower() in text_pool)
        bonus = min(10.0, kw_hits * 2.0)

        return min(100.0, base + bonus)

    def _score_education(self, candidate: dict, education_requirement: str) -> float:
        """Returns education match score 0-100."""
        if not education_requirement:
            return 100.0
        education = candidate.get("education", [])
        if not education:
            return 40.0  # Unknown, penalise slightly
        edu_text = " ".join(
            str(e.get("degree", "")) + " " + str(e.get("institution", ""))
            for e in education
        ).lower()
        req_lower = education_requirement.lower()
        # Check for degree level keywords
        if any(kw in edu_text for kw in ["bachelor", "b.s", "b.e", "b.tech", "b.sc"]):
            if "master" in req_lower or "phd" in req_lower:
                return 60.0
            return 100.0
        if any(kw in edu_text for kw in ["master", "m.s", "m.tech", "mba", "m.e"]):
            return 100.0
        if any(kw in edu_text for kw in ["phd", "doctorate", "ph.d"]):
            return 100.0
        if any(kw in edu_text for kw in ["diploma", "associate"]):
            return 65.0
        return 55.0

    # ── Candidate Scoring ─────────────────────────────────────────────────────

    async def score_candidate(self, candidate: dict, jd_requirements: dict, role: str = "") -> dict:
        """Score a single candidate against JD requirements. Returns full scoring breakdown."""
        required_skills = jd_requirements.get("required_skills", [])
        nice_to_have = jd_requirements.get("nice_to_have_skills", [])
        min_exp = float(jd_requirements.get("min_experience_years", 0) or 0)
        education_req = jd_requirements.get("education_requirement", "")
        role_keywords = jd_requirements.get("role_keywords", [])

        candidate_skills = candidate.get("skills", [])
        candidate_years = float(candidate.get("total_experience_years", 0) or 0)

        skills_score, matched_skills, missing_skills = self._score_skills(
            candidate_skills, required_skills, nice_to_have
        )
        experience_score = self._score_experience(candidate_years, min_exp)
        role_score = self._score_role_match(candidate, role, role_keywords)
        education_score = self._score_education(candidate, education_req)

        # Weighted ATS score
        ats_score = round(
            skills_score * 0.45 +
            experience_score * 0.30 +
            role_score * 0.15 +
            education_score * 0.10
        )

        # Auto-reject: missing required skills AND overall low score
        auto_reject = bool(missing_skills and required_skills and ats_score < 30)
        rejection_reason = None
        if auto_reject:
            rejection_reason = f"Missing required skills: {', '.join(missing_skills[:3])}"

        # Verdict buckets
        if ats_score >= 75:
            verdict = "Strong Fit"
        elif ats_score >= 55:
            verdict = "Good Fit"
        elif ats_score >= 35:
            verdict = "Consider"
        else:
            verdict = "No Match"

        return {
            "candidate_id": candidate.get("id"),
            "name": candidate.get("name", "Unknown"),
            "email": candidate.get("email", ""),
            "ats_score": ats_score,
            "skills_match": skills_score,
            "experience_match": round(experience_score),
            "role_match": round(role_score),
            "education_match": round(education_score),
            "matched_skills": matched_skills,
            "missing_skills": missing_skills,
            "verdict": verdict,
            "auto_reject": auto_reject,
            "rejection_reason": rejection_reason,
            "predicted_role": candidate.get("predicted_role", ""),
            "experience_level": candidate.get("experience_level", ""),
            "total_experience_years": candidate_years,
            "location": candidate.get("location", ""),
            "summary": candidate.get("summary", ""),
            "skills": candidate_skills[:15],
        }

    # ── Batch Pipeline ────────────────────────────────────────────────────────

    async def run_ats_pipeline(
        self,
        candidates: list,
        jd_requirements: dict,
        role: str = "",
        min_experience_years: float = 0,
        required_skills: list = None,
    ) -> list:
        """Score all candidates concurrently, return sorted by ATS score."""
        # Merge caller-supplied required_skills into jd_requirements
        merged_req = dict(jd_requirements)
        if required_skills:
            existing = set(str(s).lower() for s in merged_req.get("required_skills", []))
            extras = [s for s in required_skills if str(s).lower() not in existing]
            merged_req["required_skills"] = merged_req.get("required_skills", []) + extras
        if min_experience_years > 0 and merged_req.get("min_experience_years", 0) == 0:
            merged_req["min_experience_years"] = min_experience_years

        tasks = [self.score_candidate(c, merged_req, role) for c in candidates]
        results = await asyncio.gather(*tasks)
        return sorted(results, key=lambda r: r["ats_score"], reverse=True)


ats_service = ATSService()
