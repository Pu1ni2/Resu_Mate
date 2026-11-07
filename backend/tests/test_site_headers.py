"""What render.yaml asks Render to send with the frontend.

The site sent only Cache-Control: no-cache, on everything. So the hashed
files were fetched again on every visit, and nothing kept browsers on HTTPS,
kept the site out of other sites' frames, or kept the camera and microphone
to this site.
"""
import os
import re

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _site_headers():
    with open(os.path.join(ROOT, "render.yaml"), encoding="utf-8") as f:
        blueprint = yaml.safe_load(f)
    site = next(s for s in blueprint["services"] if s.get("runtime") == "static")
    return {(h["path"], h["name"]): h["value"] for h in site["headers"]}


def test_hashed_files_are_kept_and_the_page_is_checked_each_time():
    headers = _site_headers()
    assert headers[("/assets/*", "Cache-Control")] == "public, max-age=31536000, immutable"
    # The page itself, which names the hashed files, so a deploy shows at once.
    assert headers[("/*", "Cache-Control")] == "no-cache"


def test_every_page_carries_the_security_headers():
    headers = _site_headers()
    assert headers[("/*", "Strict-Transport-Security")] == "max-age=31536000; includeSubDomains"
    assert headers[("/*", "X-Content-Type-Options")] == "nosniff"
    assert headers[("/*", "X-Frame-Options")] == "DENY"
    assert headers[("/*", "Referrer-Policy")] == "strict-origin-when-cross-origin"
    allowed = dict(rule.split("=") for rule in headers[("/*", "Permissions-Policy")].split(", "))
    # The interviews use both, on this site only.
    assert allowed["camera"] == allowed["microphone"] == "(self)"
    assert allowed["geolocation"] == "()"


def test_the_csp_blocks_only_what_the_app_never_does():
    csp = _site_headers()[("/*", "Content-Security-Policy")]
    rules = dict(rule.strip().split(" ", 1) for rule in csp.split(";") if rule.strip())
    assert rules == {"frame-ancestors": "'none'", "object-src": "'none'",
                     "base-uri": "'self'", "form-action": "'self'"}
    # Nothing in the app is a plugin, a <base> or a form sent elsewhere.
    blocked = re.compile(r"<object|<embed|<base[\s>]|<form[^>]*\saction=")
    for folder, _, files in os.walk(os.path.join(ROOT, "frontend", "src")):
        for name in files:
            if name.endswith((".js", ".jsx")) and ".test." not in name:
                with open(os.path.join(folder, name), encoding="utf-8") as f:
                    assert not blocked.search(f.read()), name
    with open(os.path.join(ROOT, "frontend", "index.html"), encoding="utf-8") as f:
        assert not blocked.search(f.read())
