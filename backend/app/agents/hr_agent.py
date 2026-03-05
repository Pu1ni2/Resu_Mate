"""
HR Agent — Evaluates candidates, drafts emails, makes hiring recommendations.

Multi-step agent that:
1. Gathers all candidate data (resume + enriched)
2. Researches market salary for role + location
3. Evaluates fit against requirements
4. Reflects: is evaluation fair? any bias?
5. Generates report with recommendation
"""
import json
from typing import Dict, List, Any
from app.agents.base_agent import BaseAgent, AgentStep
from app.tools.openai_tool import openai_tool
from app.tools.tavily_tool import tavily_tool


class HRAgent(BaseAgent):
    def __init__(self):
        super().__init__(
            name="HRAgent",
            persona="I am a senior HR manager with 15+ years of experience in talent acquisition. I evaluate candidates fairly, kindly, and thoroughly. I never criticize — I frame gaps as growth opportunities.",
            tools={
                "llm": self._llm_call,
                "tavily": self._web_search,
            }
        )

    # ═══════ EVALUATION ═══════

    async def evaluate(self, candidate: Dict, role: str = None, level: str = None,
                       experience: str = None, job_description: str = None,
                       anonymize: bool = False) -> Dict:
        """Full candidate evaluation with market research"""
        context = {
            "candidate": candidate,
            "role": role or candidate.get("predicted_role", "General"),
            "level": level or candidate.get("experience_level", "Mid-Level"),
            "experience": experience or "",
            "job_description": job_description,
            "anonymize": anonymize,
        }

        result = await self.run("Evaluate this candidate for the specified role", context)
        return {"report": result.output if result.success else f"Evaluation failed: {result.error}", "logs": result.logs}

    async def plan(self, task: str, context: Dict) -> List[AgentStep]:
        """Plan evaluation steps"""
        steps = []
        candidate = context.get("candidate", {})
        role = context.get("role", "General")

        # Step 1: Research market data
        steps.append(AgentStep(
            action="research_market", tool="tavily",
            params={"query": f"{role} {candidate.get('location', '')} salary requirements 2024"},
            reason="Research market salary and requirements for this role"
        ))

        # Step 2: Evaluate candidate
        steps.append(AgentStep(
            action="evaluate_candidate", tool="llm",
            params={"type": "evaluate"},
            reason="Generate comprehensive evaluation report"
        ))

        return steps

    async def execute_step(self, step: AgentStep, context: Dict) -> Any:
        if step.action == "research_market":
            result = await tavily_tool.call(step.params)
            context["market_data"] = result.get("answer", "")
            return result
        elif step.action == "evaluate_candidate":
            return await self._generate_evaluation(context)
        elif step.action == "draft_email_content":
            return await self._generate_email(context)
        return await super().execute_step(step, context)

    async def reflect(self, task: str, results: List, context: Dict) -> Dict:
        """Check for bias and completeness"""
        if not self.llm:
            return {"needs_retry": False, "feedback": "No LLM for reflection"}

        evaluation = results[-1] if results else ""
        prompt = f"""Review this hiring evaluation for fairness and bias:
{str(evaluation)[:500]}

Check:
1. Is it fair and objective?
2. Are gaps framed as growth opportunities (not criticism)?
3. Does it reference specific resume data?
Reply JSON: {{"needs_retry": false, "feedback": "brief assessment"}}"""

        try:
            resp = await openai_tool.structured_call(prompt, "You are a bias checker. Return ONLY JSON.")
            return json.loads(resp.strip().replace('```json', '').replace('```', ''))
        except:
            return {"needs_retry": False, "feedback": "Reflection completed"}

    async def synthesize(self, task: str, results: List, reflection: Dict, context: Dict) -> str:
        """Return the evaluation report"""
        for r in results:
            if isinstance(r, str) and len(r) > 100:
                return r
        return "Evaluation could not be generated."

    async def _generate_evaluation(self, context: Dict) -> str:
        """Generate the full evaluation report"""
        candidate = context.get("candidate", {})
        role = context.get("role", "General")
        level = context.get("level", "Mid-Level")
        experience = context.get("experience", "")
        jd = context.get("job_description", "")
        market_data = context.get("market_data", "")
        anonymize = context.get("anonymize", False)
        display_name = "The Candidate" if anonymize else candidate.get("name", "Candidate")

        # Build candidate context
        ctx = f"Name: {display_name}\nRole: {candidate.get('predicted_role', 'N/A')}\n"
        ctx += f"Experience: {candidate.get('total_experience_years', 'N/A')} years | Level: {candidate.get('experience_level', 'N/A')}\n"
        ctx += f"Location: {candidate.get('location', 'N/A')}\nSkills: {', '.join(str(s) for s in (candidate.get('skills') or [])[:15])}\n"
        ctx += f"Summary: {candidate.get('summary', 'N/A')}\n"

        enriched = candidate.get("enriched_data", {})
        if enriched.get("github"):
            gh = enriched["github"]
            ctx += f"\nGitHub: @{gh.get('username', '')} | {gh.get('public_repos', 0)} repos | {gh.get('followers', 0)} followers\n"
        if enriched.get("linkedin"):
            li = enriched["linkedin"]
            ctx += f"\nLinkedIn: {li.get('headline', '')} | {li.get('about', '')[:200]}\n"

        jd_section = f"\nJOB DESCRIPTION:\n{jd}\n" if jd else f"\nTARGET: {level} {role} ({experience})\n"

        prompt = f"""Evaluate {display_name} for the {level} {role} position.

CANDIDATE DATA:
{ctx}
{jd_section}
MARKET DATA: {market_data[:300] if market_data else 'N/A'}

Generate this EXACT format:
## 🎯 Evaluation Report: {display_name}
### 📊 Overall Fit Score: [X/100]
### ✅ Strengths & Matches (4-6 points with specifics)
### 🔄 Growth Areas (2-4 points, framed kindly)
### 💡 Recommendation (Strong Fit / Good Fit / Better for Related Role / Different Level)
### 🌐 Online Presence (GitHub/LinkedIn findings)
### 📌 Suggested Interview Questions (3-4 specific questions)

RULES: Be professional, constructive, encouraging. Never harsh. Use specific data."""

        return await openai_tool.structured_call(prompt, f"You are a senior HR manager evaluating {display_name}. Be fair and kind.")

    # ═══════ EMAIL DRAFTING ═══════

    async def draft_email(self, candidate: Dict, email_type: str,
                          evaluation_report: str = None, anonymize: bool = False) -> Dict:
        """Draft a professional email"""
        context = {"candidate": candidate, "email_type": email_type, "evaluation_report": evaluation_report, "anonymize": anonymize}
        
        name = "Candidate" if anonymize else candidate.get("name", "Candidate")
        first_name = "Candidate" if anonymize else name.split()[0]
        role = candidate.get("predicted_role", "the position")

        type_prompts = {
            "interest": f"Express interest in {name} as a candidate. Be enthusiastic about their background.",
            "interview": f"Schedule an interview with {name}. Ask for availability. Be warm.",
            "offer": f"Initiate offer discussions with {name}. Express excitement.",
            "pass": f"Politely pass on {name}. Thank them genuinely. Encourage future applications.",
            "followup": f"Follow up with {name}. Check interest and availability. Be brief.",
        }

        eval_context = f"\nEvaluation context:\n{evaluation_report[:1000]}" if evaluation_report else ""

        prompt = f"""{type_prompts.get(email_type, type_prompts['interest'])}

Candidate: {name} | Role: {role} | Skills: {', '.join(str(s) for s in (candidate.get('skills') or [])[:8])}
{eval_context}

Return EXACTLY:
SUBJECT: <subject line>
BODY:
<email body, sign off with [Your Name]>"""

        content = await openai_tool.structured_call(prompt, "You are a professional recruiter writing personalized emails. Be natural, not robotic.")

        subject, body = "", content
        if "SUBJECT:" in content and "BODY:" in content:
            parts = content.split("BODY:", 1)
            subject = parts[0].replace("SUBJECT:", "").strip().split("\n")[0].strip()
            body = parts[1].strip() if len(parts) > 1 else content

        return {"subject": subject, "body": body}

    # ═══════ TOOL WRAPPERS ═══════

    async def _llm_call(self, params, context):
        return await openai_tool.call(params, context)

    async def _web_search(self, params, context):
        return await tavily_tool.call(params, context)


hr_agent = HRAgent()
