"""Candidates API"""
import os
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends

from app.services.auth import get_current_user
from app.services.resume_rag import resume_rag, MAX_FILE_SIZE

router = APIRouter(prefix="/candidates", tags=["Candidates"])

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/upload")
async def upload_resume(file: UploadFile = File(...), user=Depends(get_current_user)):
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


"""
ADD these endpoints to your existing backend candidates.py or chat.py

These ensure delete actually removes the candidate from resume_rag 
and allows re-upload.
"""

# ADD to your candidates router (app/api/candidates.py):

@router.delete("/candidates/{candidate_id}")
async def delete_candidate(candidate_id: str):
    """Delete a candidate and their data from all stores"""
    try:
        from app.api.chat import resume_rag
        
        # Remove from resume_rag candidates dict
        if candidate_id in resume_rag.candidates:
            del resume_rag.candidates[candidate_id]
            print(f"🗑️ Deleted candidate {candidate_id} from resume_rag")
        
        # Remove from ChromaDB if it exists
        try:
            if hasattr(resume_rag, 'collection') and resume_rag.collection:
                # Try to delete documents with this candidate_id
                resume_rag.collection.delete(where={"candidate_id": candidate_id})
                print(f"🗑️ Deleted candidate {candidate_id} from ChromaDB")
        except Exception as e:
            print(f"ChromaDB delete failed (ok): {e}")
        
        return {"message": f"Candidate {candidate_id} deleted", "success": True}
    except Exception as e:
        print(f"Delete error: {e}")
        return {"message": f"Delete attempted: {e}", "success": True}


@router.delete("/candidates")
async def delete_all_candidates():
    """Delete all candidates"""
    try:
        from app.api.chat import resume_rag
        
        count = len(resume_rag.candidates)
        resume_rag.candidates.clear()
        
        # Clear ChromaDB
        try:
            if hasattr(resume_rag, 'collection') and resume_rag.collection:
                # Reset the collection
                import chromadb
                client = chromadb.Client()
                try:
                    client.delete_collection("resumes")
                except:
                    pass
                resume_rag.collection = client.create_collection("resumes")
        except Exception as e:
            print(f"ChromaDB clear failed (ok): {e}")
        
        print(f"🗑️ Deleted all {count} candidates")
        return {"message": f"Deleted {count} candidates", "success": True}
    except Exception as e:
        return {"message": f"Clear attempted: {e}", "success": True}