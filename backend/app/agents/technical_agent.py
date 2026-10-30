"""
Technical Agent — Conducts interviews, generates questions, scores answers.

Multi-step agent for the interview system:
1. Generates role-specific questions from candidate data + trends
2. Scores each answer with rubric (relevance, depth, clarity, confidence)
3. Reflects: is scoring fair? consistent?
4. Generates comprehensive interview report
"""
import re
import json
from datetime import date
from typing import Dict, List, Any
from app.agents.base_agent import BaseAgent, AgentStep
from app.tools.openai_tool import openai_tool
from app.tools.tavily_tool import tavily_tool
from app.services.scores import describe_average

def clean_questions(questions) -> List[str]:
    """The model's questions as plain text: no numbering or bullets, no blanks."""
    out = []
    for q in questions or []:
        if isinstance(q, str):
            q = re.sub(r"^\s*(?:\d+[.)]|[-*•])\s*", "", q).strip()
            if q:
                out.append(q)
    return out


class TechnicalAgent(BaseAgent):
    def __init__(self):
        super().__init__(
            name="TechnicalAgent",
            persona="I am a senior technical interviewer with expertise in evaluating candidates. I ask probing questions, score fairly, and provide constructive feedback. I adapt questions to the candidate's level.",
            tools={
                "llm": self._llm_call,
                "tavily": self._web_search,
            }
        )

    # ═══════ RESUME INTELLIGENCE — Gap & Credibility Analysis ═══════

    async def analyze_resume_gaps(self, candidate_data: dict) -> Dict:
        """Analyze resume for gaps, inconsistencies, and verification targets."""
        skills = candidate_data.get("skills", [])
        work_exp = candidate_data.get("work_experience", [])
        education = candidate_data.get("education", [])
        summary = candidate_data.get("summary", "")
        role = candidate_data.get("predicted_role", "Professional")
        level = candidate_data.get("experience_level", "Mid-Level")
        total_years = candidate_data.get("total_experience_years", 0)
        key_strengths = candidate_data.get("key_strengths", [])

        work_text = "\n".join(
            f"- {w.get('title','')} at {w.get('company','')} ({w.get('start_date','?')} – {w.get('end_date','?')}, {w.get('duration_months',0)} months)"
            for w in work_exp
        ) or "No work experience listed"

        edu_text = "\n".join(
            f"- {e.get('degree','')} from {e.get('institution','')}" for e in education
        ) or "No education listed"

        prompt = f"""Analyze this resume for a {level} {role} candidate and identify:

RESUME DATA:
Name: {candidate_data.get('name', 'Unknown')}
Role: {role} | Level: {level} | Total Exp: {total_years} years
Summary: {summary}
Skills: {', '.join(skills[:20])}
Key Strengths: {', '.join(key_strengths[:5])}
Work Experience:
{work_text}
Education:
{edu_text}

ANALYZE:
1. Employment gaps (periods with no job listed)
2. Skills claimed but not backed by any work experience
3. Experience level vs actual years (overclaiming?)
4. Role progression (does the career path make sense?)
5. Skills that are "trendy" but may be surface-level (e.g., listing LLMs/GenAI without relevant projects)

Return ONLY valid JSON:
{{
    "gaps": [
        {{"type": "employment_gap", "detail": "6-month gap between X and Y", "severity": "low/medium/high"}},
        {{"type": "unverified_skill", "detail": "Claims Kubernetes but no role mentions it", "severity": "low/medium/high"}},
        {{"type": "level_mismatch", "detail": "Claims Senior but only 2 years exp", "severity": "low/medium/high"}}
    ],
    "verification_targets": [
        {{"skill": "skill_name", "claim": "what resume says", "question_angle": "how to probe this in interview"}}
    ],
    "red_flags": ["any concerning patterns"],
    "strong_points": ["genuinely impressive aspects"],
    "resume_confidence_score": 0-100
}}"""

        try:
            content = await openai_tool.structured_call(prompt, "You are a senior technical recruiter analyzing resumes for verification targets. Be fair but thorough.")
            content = content.strip()
            if '```' in content:
                for part in content.split('```'):
                    part = part.strip()
                    if part.startswith('json'): content = part[4:].strip(); break
                    elif part.startswith('{'): content = part; break
            return json.loads(content)
        except Exception as e:
            # No made-up verdict: this used to say 70/100 confidence for a
            # résumé nobody had looked at.
            print(f"[WARN] resume gap analysis failed: {e}")
            return {"gaps": [], "verification_targets": [], "red_flags": [], "strong_points": [],
                    "resume_confidence_score": None, "analysis_failed": True}

    async def generate_smart_questions(self, role: str, level: str, num_questions: int = 8,
                                        focus_areas: list = None, candidate_name: str = "Candidate",
                                        candidate_data: dict = None) -> Dict[str, Any]:
        """Generate interview questions informed by resume intelligence."""
        self.logs = []
        self.log("start", f"Smart question generation for {candidate_name} — {level} {role}")

        # Step 1: Analyze resume gaps if candidate data is available
        resume_intel = None
        if candidate_data:
            self.log("analyze", "Analyzing resume for gaps and verification targets...")
            resume_intel = await self.analyze_resume_gaps(candidate_data)
            self.log("analyze_done", f"Found {len(resume_intel.get('gaps', []))} gaps, {len(resume_intel.get('verification_targets', []))} targets", "success")

        # Step 2: Research current trends
        trends = ""
        if tavily_tool.client:
            self.log("research", f"Researching current trends for {role}...")
            search = await tavily_tool.call({"query": f"{role} interview questions {date.today().year} trends", "max_results": 2})
            trends = search.get("answer", "")
            self.log("research_done", "Market research complete", "success")

        # Step 3: Build intelligent prompt with gap-informed questions
        focus_str = f"\nFocus areas: {', '.join(focus_areas)}" if focus_areas else ""
        trends_str = f"\nCurrent trends: {trends[:300]}" if trends else ""

        gap_str = ""
        if resume_intel:
            targets = resume_intel.get("verification_targets", [])[:5]
            if targets:
                gap_str = "\n\nRESUME VERIFICATION TARGETS (weave these into questions naturally):"
                for t in targets:
                    gap_str += f"\n- Probe '{t.get('skill', '')}': {t.get('question_angle', '')}"
            gaps = resume_intel.get("gaps", [])
            if gaps:
                gap_str += "\n\nRESUME GAPS TO EXPLORE:"
                for g in gaps[:3]:
                    gap_str += f"\n- [{g.get('severity', 'low')}] {g.get('detail', '')}"

        prompt = f"""Generate exactly {num_questions} interview questions for {candidate_name}, a {level} {role}.
{focus_str}{trends_str}{gap_str}

RULES:
- 30% questions should directly probe resume claims (skills, experience, projects)
- 30% technical depth questions (can they actually do what they claim?)
- 20% behavioral/situational
- 20% problem-solving/system design
- Start conversational, increase difficulty
- Make questions feel natural, NOT like an interrogation
- Reference specific things from their background when possible

Return ONLY questions, one per line, no numbering."""

        self.log("generate", "Generating resume-informed questions...")
        content = await openai_tool.structured_call(prompt, "You are an expert interviewer who crafts questions based on resume analysis. Ask probing but fair questions.")
        questions = [q.strip() for q in content.strip().split('\n') if q.strip() and len(q.strip()) > 10][:num_questions]

        # Step 4: Reflect on quality
        self.log("reflect", "Checking question quality...")
        try:
            reflect_prompt = f"""Review these {level} {role} interview questions:
{chr(10).join(f'{i+1}. {q}' for i, q in enumerate(questions))}

Are they: appropriate for {level} level? Covering technical + behavioral? Probing resume claims? Not too generic?
Reply JSON: {{"quality": "good/needs_improvement", "feedback": "brief note"}}"""
            reflect_resp = await openai_tool.structured_call(reflect_prompt, "You are a quality checker. Return ONLY JSON.")
            reflection = json.loads(reflect_resp.strip().replace('```json', '').replace('```', ''))
            self.log("reflect_done", f"Quality: {reflection.get('quality', 'ok')}", "success")
        except:
            pass

        self.log("complete", f"Generated {len(questions)} smart questions", "success")

        return {
            "questions": questions,
            "resume_intelligence": resume_intel,
        }

    # ═══════ CREDIBILITY ANALYSIS ═══════

    async def analyze_credibility(self, candidate_data: dict, interview_report: dict, transcript=None) -> Dict:
        """Compare the résumé's claims with what the candidate said in the interview.

        No score, verdict label or hiring recommendation: those were the model's
        own numbers ("72/100", "Low Credibility") on a person, judged from the
        first 1,500 characters of another model's summary, and the report
        already gives the recommendation. The evidence is the transcript itself.
        """
        skills = candidate_data.get("skills", [])
        work_exp = candidate_data.get("work_experience", [])
        role = candidate_data.get("predicted_role", "Professional")
        level = candidate_data.get("experience_level", "Mid-Level")
        total_years = candidate_data.get("total_experience_years", 0)
        key_strengths = candidate_data.get("key_strengths", [])

        turns = transcript or interview_report.get("transcript") or []
        if turns:
            said = "\n".join(
                f"{'Interviewer' if t.get('role') == 'interviewer' else 'Candidate'}: {t.get('text', '')}"
                for t in turns if isinstance(t, dict)
            )[:12000]
            evidence = f"INTERVIEW TRANSCRIPT:\n{said}"
        else:
            evidence = f"INTERVIEW REPORT (no transcript was saved):\n{str(interview_report.get('report', ''))[:4000]}"

        prompt = f"""Compare this candidate's RESUME CLAIMS with what they said in their INTERVIEW.

RESUME CLAIMS:
- Role: {role} | Level: {level} | Claims {total_years} years experience
- Skills: {', '.join(skills[:15])}
- Key Strengths: {', '.join(key_strengths[:5])}
- Work History: {', '.join(f"{w.get('title','')} at {w.get('company','')}" for w in work_exp[:4])}

{evidence}

Base every finding on what was said. A skill nobody asked about is "not discussed",
not a weakness. Give no score, rating or hiring recommendation.

Return ONLY valid JSON:
{{
    "resume_vs_interview": {{
        "confirmed_skills": ["claimed skills the candidate showed with specifics"],
        "unverified_skills": ["claimed skills the interview didn't discuss"],
        "overrated_skills": ["claimed as a strength, but the answers about it stayed thin"],
        "hidden_strengths": ["shown in the interview but not on the resume"]
    }},
    "level_assessment": {{
        "resume_claims": "{level}",
        "interview_suggests": "the level the answers suggest",
        "match": true/false,
        "explanation": "brief why, from the answers"
    }},
    "key_insights": [
        "a finding about the claims and the answers, with the evidence"
    ],
    "confidence_in_assessment": "High / Medium / Low, by how much the interview covered"
}}"""

        try:
            content = await openai_tool.structured_call(prompt, "You are a careful hiring analyst comparing a resume with an interview transcript. Be fair and specific, and claim nothing the transcript doesn't show.")
            content = content.strip()
            if '```' in content:
                for part in content.split('```'):
                    part = part.strip()
                    if part.startswith('json'): content = part[4:].strip(); break
                    elif part.startswith('{'): content = part; break
            result = json.loads(content)
            # Whatever the model adds anyway, the app shows no number or label on a person.
            for invented in ("credibility_score", "verdict", "hiring_recommendation"):
                result.pop(invented, None)
            return result
        except Exception as e:
            # No made-up finding when nothing was compared.
            print(f"[WARN] credibility analysis failed: {e}")
            return {
                "analysis_failed": True,
                "resume_vs_interview": {"confirmed_skills": [], "unverified_skills": [], "overrated_skills": [], "hidden_strengths": []},
                "level_assessment": {"resume_claims": level, "interview_suggests": None, "match": None, "explanation": "Analysis unavailable"},
                "key_insights": ["The comparison could not be completed. Try again."],
                "confidence_in_assessment": None,
            }

    # ═══════ REPORT GENERATION ═══════

    async def generate_report(self, candidate_name: str, candidate_email: str, role: str,
                               questions: list, answers: list, scores: list, duration: int = 0) -> str:
        """Generate comprehensive interview evaluation report"""
        self.logs = []
        self.log("start", f"Generating interview report for {candidate_name}")

        qa_pairs = ""
        for i, (q, a, s) in enumerate(zip(questions, answers, scores)):
            score_val = s.get('score', '?') if isinstance(s, dict) else '?'
            fb = s.get('feedback', '') if isinstance(s, dict) else ''
            qa_pairs += f"\nQ{i+1}: {q}\nAnswer: {a or '(no answer)'}\nScore: {score_val}/10 — {fb}\n"


        prompt = f"""Generate an interview evaluation report:

Candidate: {candidate_name}
Role: {role}
Duration: {duration // 60}min {duration % 60}sec
Average Score: {describe_average(scores)}

Questions & Answers:
{qa_pairs}

Format:
## Interview Summary (2-3 sentences)
## Strengths Demonstrated (2-3 points)
## Areas for Improvement (2-3 points, be KIND)
## Overall Recommendation (Strong Hire / Hire / Consider / Pass)
## Suggested Follow-up (1-2 questions for next round)

Be professional, constructive, and fair. Never harsh."""

        self.log("generate", "Generating report via AI...")
        report = await openai_tool.structured_call(prompt, "You are a professional hiring manager writing fair evaluations.")
        self.log("complete", "Report generated", "success")
        return report

    async def _llm_call(self, params, context):
        return await openai_tool.call(params, context)

    async def _web_search(self, params, context):
        return await tavily_tool.call(params, context)


technical_agent = TechnicalAgent()
