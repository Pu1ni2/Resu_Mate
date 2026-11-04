""""Hide names" is kept on the manager's account.

It was only the page's, so the server couldn't keep candidates' names and
contact details from the AI when a request didn't ask it to.
"""
from conftest import auth_headers, register


def _me(client, token):
    r = client.get("/api/auth/me", headers=auth_headers(token))
    assert r.status_code == 200, r.text
    return r.json()


def test_names_are_shown_on_a_new_account(client):
    token, _ = register(client, "new@x.com")
    assert _me(client, token)["hide_names"] is False


def test_hiding_names_is_kept_on_the_account(client):
    token, _ = register(client, "hide@x.com")
    r = client.put("/api/auth/preferences", headers=auth_headers(token), json={"hide_names": True})
    assert r.status_code == 200, r.text
    assert r.json()["hide_names"] is True
    assert _me(client, token)["hide_names"] is True
    client.put("/api/auth/preferences", headers=auth_headers(token), json={"hide_names": False})
    assert _me(client, token)["hide_names"] is False


def test_it_is_each_managers_own(client):
    mine, _ = register(client, "mine@x.com")
    theirs, _ = register(client, "theirs@x.com")
    client.put("/api/auth/preferences", headers=auth_headers(mine), json={"hide_names": True})
    assert _me(client, theirs)["hide_names"] is False


def test_it_needs_a_signed_in_manager(client):
    assert client.put("/api/auth/preferences", json={"hide_names": True}).status_code in (401, 403)
