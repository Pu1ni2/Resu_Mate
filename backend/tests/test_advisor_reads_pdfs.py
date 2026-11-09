"""The candidate advisor reads an uploaded PDF with pypdf.

It used PyPDF2, abandoned since 2022, whose text extraction a crafted PDF
made loop forever (CVE-2023-36464): one upload could hold a server worker at
full CPU.
"""
import re
import sys
from pathlib import Path

from fpdf import FPDF

BACKEND = Path(__file__).resolve().parents[1]


def _pdf(text):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Helvetica", size=12)
    pdf.cell(0, 10, text)
    return bytes(pdf.output())


def test_an_uploaded_pdfs_text_is_read_without_pypdf2(monkeypatch):
    from app.api.advisor_agent import _resume_text
    monkeypatch.setitem(sys.modules, "PyPDF2", None)  # can't be imported
    assert "Ada Lovelace, data analyst" in _resume_text("cv.pdf", _pdf("Ada Lovelace, data analyst"))


def test_the_server_neither_lists_nor_installs_pypdf2():
    for name in ("requirements.in", "requirements.txt"):
        text = (BACKEND / name).read_text(encoding="utf-8")
        assert not re.search(r"^pypdf2\b", text, re.M | re.I), name
