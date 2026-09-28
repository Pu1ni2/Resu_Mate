"""
Candidate sourcer API
Streams a sourcing run (find people, write a judgement on every one) and keeps
its results for the manager who ran it.
"""
import json
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.agents.sourcer_agent import sourcer_agent
from app.services.auth import get_current_user

router = APIRouter(prefix="/sourcer", tags=["sourcer"])
limiter = Limiter(key_func=get_remote_address)


# ── Request models ────────────────────────────────────────────────────────────

class Sources(BaseModel):
    uploads: bool = True
    github: bool = True
    web: bool = True


class RunRequest(BaseModel):
    description: str = Field(..., max_length=2000)
    sources: Sources = Sources()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/runs")
@limiter.limit("10/hour")
async def start_run(request: Request, req: RunRequest, user=Depends(get_current_user)):
    """Find people for a description and judge every one, streamed live.

    The body is NDJSON, one event per line (see SourcerAgent.run_stream). It is a
    POST read with fetch rather than Server-Sent Events because the browser's
    EventSource cannot send the Authorization header.
    """
    description = req.description.strip()
    if len(description) < 3:
        raise HTTPException(400, "Describe who you're looking for.")
    sources = req.sources.model_dump()
    if not any(sources.values()):
        raise HTTPException(400, "Choose at least one place to look.")
    manager_id = user.id

    async def events():
        async for event in sourcer_agent.run_stream(description, manager_id, sources):
            yield json.dumps(event, default=str) + "\n"

    return StreamingResponse(
        events(),
        media_type="application/x-ndjson",
        # Proxies that buffer would hold every event until the run ends.
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
