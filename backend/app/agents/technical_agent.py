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
from typing import Dict, List, Any
from app.agents.base_agent import BaseAgent, AgentStep
from app.tools.openai_tool import openai_tool
from app.tools.tavily_tool import tavily_tool


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

    # ═══════ QUESTION GENERATION ═══════

    async def generate_questions(self, role: str, level: str, num_questions: int = 8,
                                  focus_areas: list = None, candidate_name: str = "Candidate") -> List[str]:
        """Generate interview questions with planning and reflection"""
        context = {"role": role, "level": level, "num_questions": num_questions,
                   "focus_areas": focus_areas or [], "candidate_name": candidate_name}

        self.logs = []
        self.log("start", f"Generating {num_questions} questions for {level} {role}")

        # Step 1: Research current trends
        trends = ""
        if tavily_tool.client:
            self.log("research", f"Researching current trends for {role}...")
            search = await tavily_tool.call({"query": f"{role} interview questions 2024 trends", "max_results": 2})
            trends = search.get("answer", "")
            self.log("research_done", "Market research complete", "success")

        # Step 2: Generate questions
        focus_str = f"\nFocus areas: {', '.join(focus_areas)}" if focus_areas else ""
        trends_str = f"\nCurrent trends: {trends[:300]}" if trends else ""

        prompt = f"""Generate exactly {num_questions} interview questions for a {level} {role} position.
{focus_str}{trends_str}

RULES:
- Mix: 40% technical, 30% behavioral, 30% situational
- Start easy, increase difficulty gradually
- Include 1-2 teamwork/collaboration questions
- Include 1 question about handling challenges
- Make questions specific to {role}, not generic
- Questions should be conversational

Return ONLY questions, one per line, no numbering."""

        self.log("generate", "Generating questions via AI...")
        content = await openai_tool.structured_call(prompt, "You are an expert interviewer. Generate clear, professional questions.")
        questions = [q.strip() for q in content.strip().split('\n') if q.strip() and len(q.strip()) > 10][:num_questions]

        # Step 3: Reflect on quality
        self.log("reflect", "Checking question quality...")
        reflect_prompt = f"""Review these {level} {role} interview questions:
{chr(10).join(f'{i+1}. {q}' for i, q in enumerate(questions))}

Are they: appropriate for {level} level? Covering technical + behavioral? Not too generic?
Reply JSON: {{"quality": "good/needs_improvement", "feedback": "brief note"}}"""

        try:
            reflect_resp = await openai_tool.structured_call(reflect_prompt, "You are a quality checker. Return ONLY JSON.")
            reflection = json.loads(reflect_resp.strip().replace('```json', '').replace('```', ''))
            self.log("reflect_done", f"Quality: {reflection.get('quality', 'ok')}", "success")
        except:
            pass

        self.log("complete", f"Generated {len(questions)} questions", "success")
        return questions

    # ═══════ ANSWER SCORING ═══════

    async def score_answer(self, question: str, answer: str, role: str = "General",
                           candidate_name: str = "Candidate") -> Dict:
        """Score an interview answer 1-10 with feedback"""
        if not answer or len(answer.strip()) < 5:
            return {"score": 1, "feedback": "No substantial answer provided."}

        prompt = f"""Score this interview answer on a scale of 1-10.

Role: {role}
Question: "{question}"
Answer: "{answer}"

Scoring rubric:
- Relevance to question (0-3 points)
- Depth and detail (0-3 points)
- Communication clarity (0-2 points)
- Confidence and professionalism (0-2 points)

Empty/noise = 1, Short but relevant = 4-6, Detailed and impressive = 7-10.

Return EXACTLY:
SCORE: [1-10]
FEEDBACK: [one sentence]"""

        content = await openai_tool.structured_call(prompt, "You are a fair interview evaluator. Score objectively.")

        score = 5
        feedback = "Answer noted."
        score_match = re.search(r'SCORE:\s*(\d+)', content)
        if score_match:
            score = min(10, max(1, int(score_match.group(1))))
        feedback_match = re.search(r'FEEDBACK:\s*(.+)', content)
        if feedback_match:
            feedback = feedback_match.group(1).strip()

        return {"score": score, "feedback": feedback}

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

        avg = sum(s.get('score', 0) if isinstance(s, dict) else 0 for s in scores) / max(len(scores), 1)

        prompt = f"""Generate an interview evaluation report:

Candidate: {candidate_name}
Role: {role}
Duration: {duration // 60}min {duration % 60}sec
Average Score: {avg:.1f}/10

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
