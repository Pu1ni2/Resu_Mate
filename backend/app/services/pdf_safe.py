"""Text the PDF report's built-in fonts can draw.

The report uses fpdf2's core fonts, which cover Windows-1252 at most, and
fpdf2 only allows Latin-1 unless told otherwise. An em dash or a curly quote
from the AI's report, an emoji, or a name in another script crashed the export
with FPDFUnicodeEncodingException.
"""
import re
import unicodedata

from fpdf import FPDF

# Common symbols with a plain stand-in; everything else in Windows-1252 (dashes,
# curly quotes, the ellipsis, bullets, accented letters, €) is drawn as it is.
_STAND_INS = {
    "✓": "+", "✔": "+", "✗": "x", "✘": "x", "→": "->", "←": "<-",
    "≥": ">=", "≤": "<=", " ": " ", "​": "",
}


def pdf_safe(text) -> str:
    """The text with what the fonts can't draw replaced: a symbol (an emoji,
    a dingbat) is dropped, anything else (a letter in another script) is "?"."""
    out = []
    for ch in str(text if text is not None else ""):
        ch = _STAND_INS.get(ch, ch)
        try:
            ch.encode("cp1252")
            out.append(ch)
        except UnicodeEncodeError:
            out.append("" if unicodedata.category(ch[0]) in ("So", "Sk", "Cs", "Mn") else "?")
    return "".join(out)


def ascii_filename(name: str, fallback: str = "report") -> str:
    """A download name a header can carry: ASCII letters, digits, ., _ and -."""
    # Accents come off first, so José Núñez is Jose-Nunez.
    plain = "".join(c for c in unicodedata.normalize("NFKD", name or "") if not unicodedata.combining(c))
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "-", plain).strip("-.")
    return cleaned or fallback


class ReportPDF(FPDF):
    """An FPDF whose text is made drawable before it is written."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.core_fonts_encoding = "cp1252"

    def normalize_text(self, text):
        return super().normalize_text(pdf_safe(text))
