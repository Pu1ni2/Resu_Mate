"""export-report must require auth + ownership (was previously public)."""
from conftest import register, auth_headers


def test_export_report_requires_auth(client):
    # No Authorization header → 401/403, never a PDF.
    r = client.get("/api/chat/export-report/anyone@x.com")
    assert r.status_code in (401, 403), r.status_code


def test_export_report_unknown_candidate_is_404_for_authed_manager(client):
    tok, _ = register(client, "exp@co.com")
    # Authenticated but the email belongs to nobody under this manager.
    r = client.get(
        "/api/chat/export-report/ghost@x.com",
        headers=auth_headers(tok),
    )
    # Not a 200 PDF — either 404 (no data) is the expected safe outcome.
    assert r.status_code == 404, r.status_code
