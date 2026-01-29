# """Candidates API - Upload and manage resumes"""
# import os
# import aiofiles
# from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
# from app.services.auth import get_current_user
# from app.services.resume_rag import resume_rag

# router = APIRouter(prefix="/candidates", tags=["Candidates"])

# UPLOAD_DIR = "uploads"
# os.makedirs(UPLOAD_DIR, exist_ok=True)

# @router.post("/upload")
# async def upload_resume(file: UploadFile = File(...), user = Depends(get_current_user)):
#     """Upload and analyze a resume"""
#     allowed = {'.pdf', '.docx', '.doc', '.txt'}
#     ext = os.path.splitext(file.filename)[1].lower()
    
#     if ext not in allowed:
#         raise HTTPException(400, f"File type not supported. Allowed: {', '.join(allowed)}")
    
#     # Save file
#     file_id = resume_rag.candidate_counter + 1
#     file_path = os.path.join(UPLOAD_DIR, f"{file_id}_{file.filename}")
    
#     async with aiofiles.open(file_path, 'wb') as f:
#         content = await file.read()
#         await f.write(content)
    
#     try:
#         result = await resume_rag.add_resume(file_path, file.filename)
#         if "error" in result:
#             os.remove(file_path)
#             raise HTTPException(400, result["error"])
#         return result
#     except HTTPException:
#         raise
#     except Exception as e:
#         if os.path.exists(file_path):
#             os.remove(file_path)
#         raise HTTPException(500, f"Error processing resume: {str(e)}")

# @router.get("")
# async def get_candidates(user = Depends(get_current_user)):
#     """Get all uploaded candidates"""
#     candidates = resume_rag.get_all_candidates()
#     return {"candidates": candidates, "total": len(candidates)}

# @router.get("/{candidate_id}")
# async def get_candidate(candidate_id: int, user = Depends(get_current_user)):
#     """Get specific candidate"""
#     candidate = resume_rag.get_candidate(candidate_id)
#     if not candidate:
#         raise HTTPException(404, "Candidate not found")
#     return candidate

# @router.delete("/{candidate_id}")
# async def delete_candidate(candidate_id: int, user = Depends(get_current_user)):
#     """Delete a candidate"""
#     resume_rag.delete_candidate(candidate_id)
#     return {"message": "Deleted"}

# @router.delete("")
# async def delete_all(user = Depends(get_current_user)):
#     """Delete all candidates"""
#     resume_rag.clear_all()
#     return {"message": "All candidates deleted"}

"""Candidates API with duplicate & size checks"""
import os
import aiofiles
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from app.services.auth import get_current_user
from app.services.resume_rag import resume_rag, MAX_FILE_SIZE

router = APIRouter(prefix="/candidates", tags=["Candidates"])

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/upload")
async def upload_resume(file: UploadFile = File(...), user=Depends(get_current_user)):
    allowed = {'.pdf', '.docx', '.doc', '.txt'}
    ext = os.path.splitext(file.filename)[1].lower()
    
    if ext not in allowed:
        raise HTTPException(400, f"File type not supported. Allowed: {', '.join(allowed)}")
    
    content = await file.read()
    
    # Check size
    size_error = resume_rag.check_file_size(len(content))
    if size_error:
        raise HTTPException(400, size_error)
    
    # Check duplicate
    dup_error = resume_rag.check_duplicate(content)
    if dup_error:
        raise HTTPException(400, dup_error)
    
    file_id = resume_rag.candidate_counter + 1
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}_{file.filename}")
    
    async with aiofiles.open(file_path, 'wb') as f:
        await f.write(content)
    
    try:
        result = await resume_rag.add_resume(file_path, file.filename)
        
        if "error" in result:
            os.remove(file_path)
            raise HTTPException(400, result["error"])
        
        resume_rag.register_file(content)
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(500, f"Error: {str(e)}")


@router.get("")
async def get_candidates(user=Depends(get_current_user)):
    return {"candidates": resume_rag.get_all_candidates(), "total": len(resume_rag.candidates)}


@router.get("/{candidate_id}")
async def get_candidate(candidate_id: int, user=Depends(get_current_user)):
    candidate = resume_rag.get_candidate(candidate_id)
    if not candidate:
        raise HTTPException(404, "Candidate not found")
    return candidate


@router.delete("/{candidate_id}")
async def delete_candidate(candidate_id: int, user=Depends(get_current_user)):
    resume_rag.delete_candidate(candidate_id)
    return {"message": "Deleted"}


@router.delete("")
async def delete_all(user=Depends(get_current_user)):
    resume_rag.clear_all()
    return {"message": "All deleted"}