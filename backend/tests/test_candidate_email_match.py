"""A candidate reaches a resume only through that resume's OWN address.

verify-email and the advisor used to accept any address that appeared anywhere
in any tenant's resume text. So hn@x.com matched john@x.com, and a reference
named in a resume matched it too; the look-alike then signed in with a code
sent to their own mailbox and read someone else's profile and resume.
"""
import sqlite3

from conftest import register, _TMP_DB

from app.services.auth import create_candidate_token

RESUME = "John Doe\njohn@x.com | +1 555 0100\nBackend engineer.\nReferences: ref.person@acme.com"


def _seed(resume_rag, manager_id, **extra):
    resume_rag.candidates.setdefault(manager_id, {})[1] = {
        "id": 1, "manager_id": manager_id, "name": "John Doe", "is_resume": True,
        "text": RESUME, "predicted_role": "Backend Engineer", "skills": ["Python"], **extra,
    }


def _grants(email):
    with sqlite3.connect(_TMP_DB) as db:
        return db.execute("select count(*) from candidate_access where email = ?", (email,)).fetchone()[0]


def _verify(client, email):
    return client.post("/api/chat/verify-email", json={"email": email}).json()["access"]


def test_a_look_alike_address_gets_no_access(client):
    from app.services.resume_rag import resume_rag
    _, mgr = register(client, "m1@co.com")
    _seed(resume_rag, mgr["id"])
    assert _verify(client, "hn@x.com") is False
    assert _grants("hn@x.com") == 0


def test_an_address_merely_mentioned_in_a_resume_gets_no_access(client):
    from app.services.resume_rag import resume_rag
    _, mgr = register(client, "m2@co.com")
    _seed(resume_rag, mgr["id"])
    assert _verify(client, "ref.person@acme.com") is False
    assert _grants("ref.person@acme.com") == 0


def test_the_resumes_own_address_still_gets_access(client):
    from app.services.resume_rag import resume_rag
    _, mgr = register(client, "m3@co.com")
    _seed(resume_rag, mgr["id"])
    assert _verify(client, "JOHN@x.com ") is True
    assert _grants("john@x.com") == 1


def test_a_pdf_mailto_counts_as_the_resumes_own_address(client):
    from app.services.resume_rag import resume_rag
    _, mgr = register(client, "m4@co.com")
    _seed(resume_rag, mgr["id"], embedded_links={"email": "j.doe@mail.com"})
    assert _verify(client, "j.doe@mail.com") is True


def _context(client, email):
    headers = {"Authorization": f"Bearer {create_candidate_token(email)}"}
    return client.get("/api/advisor/context", headers=headers).json()


def test_the_advisor_never_hands_a_look_alike_someone_elses_resume(client):
    from app.services.resume_rag import resume_rag
    _, mgr = register(client, "m5@co.com")
    _seed(resume_rag, mgr["id"])
    assert _context(client, "hn@x.com") == {"found": False}
    assert _context(client, "ref.person@acme.com") == {"found": False}
    own = _context(client, "john@x.com")
    assert own["found"] is True and own["name"] == "John Doe"
