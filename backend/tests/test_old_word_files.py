"""Old Word files (.doc) are refused, saying what to do instead.

They were taken, then read by the .docx reader, which can't, so the upload
failed afterwards, or, for a candidate's own upload, read as raw bytes that
the advisor was then given as the résumé.
"""
import io

from conftest import auth_headers, register

from app.api.candidates import _safe_upload_path
from app.services.auth import create_candidate_token
from app.services.resume_rag import OLD_WORD_FILE, RESUME_EXTENSIONS

WORD_97 = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 64  # an old Word file's first bytes


def test_a_manager_upload_of_an_old_word_file_says_what_to_do(client):
    token, _ = register(client, "doc@x.com")
    r = client.post("/api/candidates/upload", headers=auth_headers(token),
                    files={"file": ("CV.DOC", WORD_97, "application/msword")})
    assert r.status_code == 400
    assert r.json()["detail"] == OLD_WORD_FILE


def test_a_candidates_upload_of_an_old_word_file_says_the_same(client):
    r = client.post("/api/advisor/upload-resume",
                    headers={"Authorization": f"Bearer {create_candidate_token('ada@x.com')}"},
                    files={"file": ("cv.doc", io.BytesIO(WORD_97), "application/msword")})
    assert r.status_code == 400
    assert r.json()["detail"] == OLD_WORD_FILE


def test_the_files_that_can_be_read_still_are():
    assert RESUME_EXTENSIONS == ('.pdf', '.docx', '.txt')
    for name in ("cv.pdf", "cv.DOCX", "cv.txt"):
        path, safe = _safe_upload_path(name, set(RESUME_EXTENSIONS))
        assert safe.lower().endswith(name.lower().rsplit(".", 1)[1])
