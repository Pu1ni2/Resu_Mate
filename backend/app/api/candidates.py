"""Candidates API"""
import os
import re
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.services.auth import get_current_user
from app.services.resume_rag import resume_rag, MAX_FILE_SIZE
from app.core.database import get_db
from app.services import db_service

router = APIRouter(prefix="/candidates", tags=["Candidates"])
limiter = Limiter(key_func=get_remote_address)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

_SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


def _safe_upload_path(original_filename: str, allowed_ext: set[str]) -> tuple[str, str]:
    """Return (absolute_path, safe_basename) for a freshly uploaded file.

    Drops directory components, normalises the basename, and prefixes a uuid so
    different users uploading "resume.pdf" never collide and a malicious
    "../../etc/passwd" can never escape UPLOAD_DIR.
    """
    base = os.path.basename(original_filename or "")
    ext = os.path.splitext(base)[1].lower()
    if ext not in allowed_ext:
        raise HTTPException(400, f"File type not allowed. Allowed: {', '.join(sorted(allowed_ext))}")
    stem = _SAFE_NAME_RE.sub("_", os.path.splitext(base)[0]) or "resume"
    safe = f"{uuid.uuid4().hex[:8]}_{stem[:60]}{ext}"
    return os.path.join(UPLOAD_DIR, safe), safe


@router.post("/upload")
@limiter.limit("20/hour")
async def upload_resume(request: Request, file: UploadFile = File(...), user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Upload and analyze a resume"""

    allowed_extensions = {'.pdf', '.docx', '.doc', '.txt'}
    file_path, safe_name = _safe_upload_path(file.filename or "", allowed_extensions)

    content = await file.read()
    mgr = user.id

    size_error = resume_rag.check_file_size(len(content))
    if size_error:
        raise HTTPException(400, size_error)

    dup_error = resume_rag.check_duplicate(content, manager_id=mgr)
    if dup_error:
        raise HTTPException(400, dup_error)

    with open(file_path, "wb") as f:
        f.write(content)

    try:
        # Register file and get hash (scoped to this manager)
        file_hash = resume_rag.register_file(content, manager_id=mgr)

        # Process resume with hash. Pass the safe name so downstream display uses
        # something stable; the original filename is never trusted as a path.
        result = await resume_rag.add_resume(file_path, safe_name, file_hash, manager_id=mgr)

        if "error" in result:
            # If error, unregister the hash
            resume_rag.unregister_file(file_hash, manager_id=mgr)
            raise HTTPException(400, result["error"])

        # Persist to PostgreSQL database, owned by this manager
        cand_row = await db_service.create_candidate_db(db, {**result, "file_hash": file_hash}, manager_id=mgr)

        # If object storage is configured, keep the ORIGINAL file so the manager
        # can re-download it later. No-op (and no error) when S3 is off.
        try:
            from app.services.storage_service import storage_service
            if storage_service.enabled and cand_row is not None:
                import mimetypes
                ctype = mimetypes.guess_type(safe_name)[0] or "application/octet-stream"
                key = storage_service.key_for(mgr, cand_row.id, safe_name)
                if storage_service.upload(key, content, content_type=ctype):
                    cand_row.file_object_key = key
                    await db.commit()
                    result["file_object_key"] = key
        except Exception as exc:
            print(f"[WARN] resume object-store upload failed: {exc}")

        await db_service.log_event(
            db, action="candidate.create", actor="manager",
            manager_id=mgr, target_email=result.get("email"),
            detail=f"file={safe_name}",
        )
        return result

    finally:
        # Windows fix: file may still be locked by PDF reader
        import time
        time.sleep(0.5)
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except PermissionError:
            pass  # File still locked, will be cleaned up later


@router.get("")
async def get_candidates(user=Depends(get_current_user)):
    """Get this manager's candidates only."""
    candidates = resume_rag.get_all_candidates(manager_id=user.id)
    return {"candidates": candidates}


@router.get("/{candidate_id}")
async def get_candidate(candidate_id: int, user=Depends(get_current_user)):
    """Get a specific candidate — only if it belongs to this manager."""
    candidate = resume_rag.get_candidate(candidate_id, manager_id=user.id)
    if not candidate:
        # 404 (not 403) so we don't reveal that the id exists under another manager.
        raise HTTPException(404, "Candidate not found")
    return candidate


@router.get("/{candidate_id}/file")
async def get_candidate_file(candidate_id: int, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Download the original resume file for one of THIS manager's candidates.

    Returns a short-lived presigned URL when the storage backend supports it,
    otherwise proxies the bytes. 404 if the candidate isn't this manager's or
    no original was stored (object storage was off at upload time).
    """
    from sqlalchemy import select as sql_select
    from app.models.candidate import Candidate
    from app.services.storage_service import storage_service

    row = (await db.execute(
        sql_select(Candidate).where(
            Candidate.id == candidate_id, Candidate.manager_id == user.id
        )
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Candidate not found")
    if not row.file_object_key:
        raise HTTPException(404, "No original file stored for this candidate")

    url = storage_service.presigned_url(row.file_object_key)
    if url:
        return {"url": url}

    # Fallback: proxy the bytes directly.
    data = storage_service.download(row.file_object_key)
    if data is None:
        raise HTTPException(404, "File could not be retrieved")
    from fastapi.responses import StreamingResponse
    import io
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{row.file_name or "resume"}"'},
    )


@router.delete("/{candidate_id}")
async def delete_candidate(candidate_id: int, user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Delete one of THIS manager's candidates from memory and DB."""
    from sqlalchemy import delete as sql_delete
    from app.models.candidate import Candidate
    # Only delete if the candidate is in this manager's drawer.
    if not resume_rag.get_candidate(candidate_id, manager_id=user.id):
        raise HTTPException(404, "Candidate not found")
    resume_rag.delete_candidate(candidate_id, manager_id=user.id)
    await db.execute(
        sql_delete(Candidate).where(
            Candidate.id == candidate_id, Candidate.manager_id == user.id
        )
    )
    await db.commit()
    return {"message": "Candidate deleted"}


@router.delete("")
async def delete_all_candidates(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Delete ALL of THIS manager's candidates from memory and DB (never global)."""
    from sqlalchemy import delete as sql_delete
    from app.models.candidate import Candidate
    resume_rag.clear_all(manager_id=user.id)
    await db.execute(sql_delete(Candidate).where(Candidate.manager_id == user.id))
    await db.commit()
    return {"message": "All candidates and data deleted"}
