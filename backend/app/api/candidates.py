"""Candidates API"""
import os
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.auth import get_current_user
from app.services.resume_rag import resume_rag, MAX_FILE_SIZE
from app.core.database import get_db
from app.services import db_service

router = APIRouter(prefix="/candidates", tags=["Candidates"])

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/upload")
async def upload_resume(file: UploadFile = File(...), user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Upload and analyze a resume"""
    
    allowed_extensions = ['.pdf', '.docx', '.doc', '.txt']
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(400, f"File type not allowed. Allowed: {', '.join(allowed_extensions)}")
    
    content = await file.read()
    
    size_error = resume_rag.check_file_size(len(content))
    if size_error:
        raise HTTPException(400, size_error)
    
    dup_error = resume_rag.check_duplicate(content)
    if dup_error:
        raise HTTPException(400, dup_error)
    
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as f:
        f.write(content)
    
    try:
        # Register file and get hash
        file_hash = resume_rag.register_file(content)
        
        # Process resume with hash
        result = await resume_rag.add_resume(file_path, file.filename, file_hash)
        
        if "error" in result:
            # If error, unregister the hash
            resume_rag.unregister_file(file_hash)
            raise HTTPException(400, result["error"])

        # Persist to PostgreSQL database
        await db_service.create_candidate_db(db, {**result, "file_hash": file_hash})

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
    """Get all candidates"""
    candidates = resume_rag.get_all_candidates()
    return {"candidates": candidates}


@router.get("/{candidate_id}")
async def get_candidate(candidate_id: int, user=Depends(get_current_user)):
    """Get a specific candidate"""
    candidate = resume_rag.get_candidate(candidate_id)
    if not candidate:
        raise HTTPException(404, "Candidate not found")
    return candidate


@router.delete("/{candidate_id}")
async def delete_candidate(candidate_id: int, user=Depends(get_current_user)):
    """Delete a candidate"""
    resume_rag.delete_candidate(candidate_id)
    return {"message": "Candidate deleted"}


@router.delete("")
async def delete_all_candidates(user=Depends(get_current_user)):
    """Delete ALL candidates and clear all data"""
    resume_rag.clear_all()
    return {"message": "All candidates and data deleted"}
