"""No mojibake anywhere in the source, and no UTF-8 BOMs.

This is the guard that makes the sweep stick. 2265 corrupt sequences got into
this repo through my own tooling -- PowerShell's Set-Content and Out-File write
a BOM and had read the content back through the cp1252 codepage -- so a one-off
repair with nothing watching it would simply happen again.

Failure here means some editor or script has written a file through the wrong
codepage. Run `python tools/fix_mojibake.py --write <path>` to repair it, and
work out which tool did it before writing anything else.
"""
import importlib.util
import os

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_spec = importlib.util.spec_from_file_location(
    'fix_mojibake', os.path.join(_ROOT, 'tools', 'fix_mojibake.py'))
fix_mojibake = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fix_mojibake)

SCANNED = ('frontend/src', 'backend/app', 'backend/tests', 'tools')

# test_mojibake_repair.py holds corrupt strings on purpose -- they are the inputs
# it feeds to the repair function. It is the one file that must stay broken.
ALLOWED = {'backend/tests/test_mojibake_repair.py'}


def _source_files():
    for rel in SCANNED:
        base = os.path.join(_ROOT, rel)
        for root, dirs, files in os.walk(base):
            dirs[:] = [d for d in dirs
                       if d not in ('__pycache__', 'node_modules', 'dist', '.vite')]
            for name in files:
                if not name.endswith(fix_mojibake.SOURCE_SUFFIXES):
                    continue
                path = os.path.join(root, name)
                relpath = os.path.relpath(path, _ROOT).replace(os.sep, '/')
                if relpath in ALLOWED:
                    continue
                yield relpath, path


def test_no_mojibake_in_source():
    offenders = []
    for relpath, path in _source_files():
        try:
            with open(path, 'r', encoding='utf-8-sig', newline='') as f:
                text = f.read()
        except (UnicodeDecodeError, OSError):
            # A file that is not valid UTF-8 at all is a different problem, and
            # the encoding test below is what reports it.
            continue
        n = fix_mojibake.count_suspect(text)
        if n:
            offenders.append('%s (%d)' % (relpath, n))
    assert not offenders, (
        'double-encoded text found in:\n  ' + '\n  '.join(offenders)
        + '\n\nRepair with: python tools/fix_mojibake.py --write <path>'
    )


def test_no_utf8_boms():
    """A BOM is the fingerprint of the tooling that caused the corruption.

    It is also not wanted on its own account: it is invisible, it breaks a
    shebang, and it shows up as a stray character in diffs and in JSON parsers.
    """
    offenders = []
    for relpath, path in _source_files():
        with open(path, 'rb') as f:
            if f.read(3) == b'\xef\xbb\xbf':
                offenders.append(relpath)
    assert not offenders, (
        'UTF-8 BOM found in:\n  ' + '\n  '.join(offenders)
        + '\n\nStrip with: python tools/fix_mojibake.py --strip-bom <path>'
    )


def test_the_guard_actually_scans_something():
    """A guard that silently matches no files passes forever.

    If the directory names above are ever wrong, the two tests would go green
    with nothing to say.
    """
    count = sum(1 for _ in _source_files())
    assert count > 100, 'only %d files scanned -- SCANNED paths are probably wrong' % count
