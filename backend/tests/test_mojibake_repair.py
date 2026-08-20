"""The mojibake repair must fix corrupt text and leave correct text alone.

The second half is the part that needs proving. A real em dash is encodable as
cp1252 (byte 0x97), so encoding correct text back to bytes succeeds -- only the
following utf-8 decode rejects it, and not always. An early version of this,
matching a fixed-width run, turned pipeline.py's two corrupt em dashes into
U+FFFD instead of repairing them, and the same mistake on a file's correct text
would silently destroy it.

Lives in the backend suite because that is where pytest already runs; the script
it tests is repo-level tooling, not backend code.
"""
import importlib.util
import os

import pytest

_SCRIPT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    'tools', 'fix_mojibake.py',
)
_spec = importlib.util.spec_from_file_location('fix_mojibake', _SCRIPT)
fix_mojibake = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fix_mojibake)

repair = fix_mojibake.repair
count_suspect = fix_mojibake.count_suspect


# ── Corrupt text is repaired ──────────────────────────────────────────────────
# Written as escapes rather than literals so the expectations cannot themselves
# be corrupted by whatever tool edits this file next.

@pytest.mark.parametrize('broken,expected', [
    ('â€”', '—'),   # em dash
    ('â€“', '–'),   # en dash
    ('â€™', '’'),   # right single quote
    ('â€¦', '…'),   # ellipsis
    ('â€¢', '•'),   # bullet
    ('â”€', '─'),   # box drawing light horizontal
    ('â—Ž', '◎'),   # bullseye, the Jarvis orb glyph
    ('Ã©', 'é'),         # e-acute
    ('Â·', '·'),         # middle dot
    ('â†’', '→'),   # right arrow
])
def test_repairs_known_sequences(broken, expected):
    assert repair(broken) == expected


def test_repairs_a_sequence_in_context():
    src = 'Interview Invitation â€” Backend Engineer'
    assert repair(src) == 'Interview Invitation — Backend Engineer'


def test_repairs_adjacent_sequences():
    """Two corrupt box-drawing characters in a row.

    A fixed-width match takes four of the six characters and then resumes
    mid-sequence, repairing only every other one -- which is what a first
    attempt at this did.
    """
    src = 'â”€' * 4
    assert repair(src) == '─' * 4


def test_repairs_a_four_byte_sequence():
    # A rocket emoji, U+1F680, is four UTF-8 bytes and so four mojibake chars.
    broken = 'ðŸš€'
    assert repair(broken) == '\U0001f680'


def test_repairs_sequences_built_on_cp1252_undefined_bytes():
    """The bytes cp1252 leaves undefined: 0x81, 0x8D, 0x8F, 0x90, 0x9D.

    Python's cp1252 codec refuses them in both directions, but .NET's maps them
    to the same-numbered control character -- and .NET is what did the damage, so
    the files really do contain U+0090. Missing these made every sequence built
    on one of those bytes invisible to an earlier version of this script: 90
    occurrences in InterviewRoom.jsx alone, because the box-drawing double
    horizontal U+2550 is E2 95 90.
    """
    # U+2550 ═ -> E2 95 90 -> 'a-circumflex', bullet, U+0090
    assert repair('â•') == '═'
    # U+25CF ● -> E2 97 8F -> 'a-circumflex', em dash, U+008F
    assert repair('â—') == '●'
    # A full banner of them, adjacent.
    assert repair('â•' * 3) == '═' * 3


# ── Correct text is left exactly as it was ────────────────────────────────────
# This is the guard that matters. Each of these is encodable as cp1252, so a
# naive round-trip reaches for them.

@pytest.mark.parametrize('good', [
    'plain ascii only',
    'an em dash — in a sentence',
    'an en dash – here',
    'quotes ‘single’ and “double”',
    'ellipsis…',
    'café naïve résumé',
    'bullet • point',
    'box ── drawing',
    'a middle · dot',
    'arrow → and back ←',
    'the orb ◎ glyph',
    'emoji \U0001f680 \U0001f4c1',
    '100° and 50¢ and © 2026',
])
def test_leaves_correct_text_byte_identical(good):
    assert repair(good) == good
    assert count_suspect(good) == 0


def test_leaves_a_real_em_dash_alone_even_beside_a_repair():
    """The mixed case, which is why this is per-occurrence and not per-file.

    PipelineWizard.jsx had a corrupt em dash on line 30 and a correct one on
    line 129.
    """
    src = 'corrupt â€” and correct — together'
    assert repair(src) == 'corrupt — and correct — together'


def test_never_introduces_a_replacement_character():
    samples = [
        'an em dash — alone',
        'â by itself',
        'Ã alone',
        'â€',                  # truncated, decodes to nothing valid
        'accented âme',             # French "ame" with circumflex
    ]
    for s in samples:
        assert '�' not in repair(s), s


def test_a_lone_lead_character_survives():
    # "âme" is a real French word. The lead character is genuine text here.
    assert repair('âme') == 'âme'


# ── Idempotence ───────────────────────────────────────────────────────────────

def test_repair_is_idempotent():
    src = 'a â€” b Ã© c â”€ d'
    once = repair(src)
    assert repair(once) == once, 'a second pass changed the text again'


def test_count_matches_what_repair_changes():
    src = 'â€” x Ã© y â€¦'
    assert count_suspect(src) == 3
    assert count_suspect(repair(src)) == 0
