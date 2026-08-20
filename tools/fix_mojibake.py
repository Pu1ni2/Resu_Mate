#!/usr/bin/env python3
"""Repair double-encoded UTF-8 (mojibake) in source files.

The damage: text was written by a tool that read UTF-8 bytes through the Windows
cp1252 codepage and then saved the result as UTF-8. An em dash, U+2014, is the
bytes E2 80 94; read as cp1252 those are three separate characters, "a-circumflex
euro double-quote", and re-encoding those as UTF-8 bakes the wrong characters
into the file. So `--` renders as `a EUR "`. No charset header fixes it; the file
genuinely says the wrong thing and the bytes have to be rewritten.

Repair is the inverse: encode the mojibake text back to the cp1252 bytes it was
mistakenly read as, then decode those bytes as UTF-8.

The whole difficulty is doing that WITHOUT touching text that is already correct.
A blind round-trip over a file is not safe:

  - Files mix corrupt and correct copies of the same glyph. PipelineWizard.jsx
    has a corrupt em dash on line 30 and a clean one on line 129; JarvisAgent.jsx
    has 1590 corrupt sequences alongside clean em dashes added by later edits.
  - A real em dash IS encodable as cp1252 (byte 0x97), so encoding back succeeds
    on correct text too. Only the subsequent utf-8 decode rejects it, and not
    always -- with the wrong surrounding characters it can decode to U+FFFD
    instead of raising. A first attempt at this, matching a fixed-width run,
    turned pipeline.py's two corrupt em dashes into replacement characters
    instead of repairing them.

So a run is repaired only when all of these hold:

  1. It starts with the cp1252 reading of a UTF-8 lead byte (see LEADS).
  2. Every character in the run is in the cp1252 high table (CP1252_HIGH).
     A character outside it cannot have come from this corruption.
  3. The round-trip changes the text and introduces no U+FFFD.

Usage:
    python tools/fix_mojibake.py --check                report, change nothing
    python tools/fix_mojibake.py --check PATH...        report on specific paths
    python tools/fix_mojibake.py --write PATH...        repair those paths
    python tools/fix_mojibake.py --strip-bom PATH...    remove a leading BOM
"""
from __future__ import annotations

import argparse
import os
import sys

# Every character a cp1252 mis-read can produce from a single high byte, mapped
# back to the byte it came from. Built from the codec rather than hand-listed,
# because hand-listing it missed a case: see the five bytes below.
CP1252_ENCODE = {}
for _b in range(0x80, 0x100):
    try:
        CP1252_ENCODE[bytes([_b]).decode('cp1252')] = _b
    except UnicodeDecodeError:
        pass

# 0x81, 0x8D, 0x8F, 0x90 and 0x9D are undefined in cp1252 and Python's codec
# refuses them in both directions. The corruption was not done by Python though
# -- it was .NET, whose CP1252 quietly maps those five bytes to the
# same-numbered control characters. So the files really do contain U+0090, and
# without these entries every sequence built on one of those bytes is
# undetectable and unrepairable. That is 90 occurrences of U+0090 in
# InterviewRoom.jsx alone, which is where I found this: the box-drawing double
# horizontal U+2550 is E2 95 90, so every '=' banner ends in one.
for _b in (0x81, 0x8D, 0x8F, 0x90, 0x9D):
    CP1252_ENCODE[chr(_b)] = _b

# Guard 2: a character outside this set cannot have come from the corruption.
CP1252_HIGH = set(CP1252_ENCODE)


def _to_cp1252_bytes(s: str) -> bytes:
    """Encode a candidate run back to the bytes it was mis-read from.

    Not str.encode('cp1252') -- that raises on the five undefined slots above.
    """
    return bytes(CP1252_ENCODE[c] for c in s)

# A mojibake run always opens with the cp1252 reading of a UTF-8 lead byte:
# C2-DF start a 2-byte sequence, E0-EF a 3-byte one, F0-F4 a 4-byte one. cp1252
# maps all of those bytes straight through to the same codepoint, so the lead
# character is simply chr(byte).
#
# In practice this codebase's corruption is almost all E2 (punctuation and box
# drawing, giving 'a-circumflex') and F0 (emoji, giving 'eth'), but restricting
# the set to those would silently skip accented Latin text. Being generous here
# is safe: it only decides which runs are CONSIDERED. The three guards below are
# what actually decide whether anything is rewritten.
LEADS = ({chr(b) for b in range(0xC2, 0xE0)}
         | {chr(b) for b in range(0xE0, 0xF0)}
         | {chr(b) for b in range(0xF0, 0xF5)})

# Longest sequence we try to repair at once: a 4-byte UTF-8 character (an emoji)
# becomes 4 mojibake characters.
MAX_RUN = 4

SOURCE_SUFFIXES = ('.js', '.jsx', '.ts', '.tsx', '.py', '.css', '.html',
                   '.json', '.md', '.txt')
SKIP_DIRS = {'node_modules', '.git', 'dist', 'build', '__pycache__', 'venv',
             '.vite', 'coverage'}


def repair(text: str) -> str:
    """Return text with mojibake runs repaired and everything else untouched."""
    out = []
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch not in LEADS:
            out.append(ch)
            i += 1
            continue

        # Collect the longest candidate run, then try to decode progressively
        # shorter prefixes. Longest-first matters because adjacent sequences run
        # together: "--" as two corrupt em dashes is six characters, and a
        # fixed-width match would take four and then resume mid-sequence,
        # repairing only every other one.
        end = i + 1
        while end < n and end - i < MAX_RUN and text[end] in CP1252_HIGH:
            end += 1

        for stop in range(end, i + 1, -1):
            candidate = text[i:stop]
            try:
                decoded = _to_cp1252_bytes(candidate).decode('utf-8')
            except (KeyError, UnicodeDecodeError):
                continue
            # Guard 3. A decode that "succeeds" into U+FFFD has not recovered
            # anything -- it has destroyed a character that may well have been
            # correct to begin with.
            if '�' in decoded or decoded == candidate:
                continue
            out.append(decoded)
            i = stop
            break
        else:
            # No prefix decoded cleanly, so this lead character is genuinely
            # part of the text. Leave it exactly as it is.
            out.append(ch)
            i += 1
    return ''.join(out)


def count_suspect(text: str) -> int:
    """How many runs repair() would change."""
    total = 0
    i = 0
    n = len(text)
    while i < n:
        if text[i] in LEADS:
            end = i + 1
            while end < n and end - i < MAX_RUN and text[end] in CP1252_HIGH:
                end += 1
            for stop in range(end, i + 1, -1):
                cand = text[i:stop]
                try:
                    dec = _to_cp1252_bytes(cand).decode('utf-8')
                except (KeyError, UnicodeDecodeError):
                    continue
                if '�' in dec or dec == cand:
                    continue
                total += 1
                i = stop
                break
            else:
                i += 1
        else:
            i += 1
    return total


BOM = '﻿'


def read_text(path: str) -> tuple[str, bool]:
    """Return (text, had_bom). The BOM is stripped from the returned text."""
    with open(path, 'r', encoding='utf-8-sig', newline='') as f:
        text = f.read()
    with open(path, 'rb') as f:
        had_bom = f.read(3) == b'\xef\xbb\xbf'
    return text, had_bom


def write_text(path: str, text: str, bom: bool = False) -> None:
    # newline='' so existing line endings survive untouched; this script is not
    # here to reflow anyone's CRLFs.
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write((BOM if bom else '') + text)


def walk(paths: list[str]) -> list[str]:
    found = []
    for p in paths:
        if os.path.isfile(p):
            found.append(p)
            continue
        for root, dirs, files in os.walk(p):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            for f in files:
                if f.endswith(SOURCE_SUFFIXES):
                    found.append(os.path.join(root, f))
    return sorted(found)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument('--check', action='store_true', help='report only')
    g.add_argument('--write', action='store_true', help='repair in place')
    g.add_argument('--strip-bom', action='store_true', help='remove leading BOM')
    ap.add_argument('paths', nargs='*', default=['.'])
    args = ap.parse_args()

    paths = args.paths or ['.']
    files = walk(paths)
    total = 0
    touched = 0

    for path in files:
        try:
            text, had_bom = read_text(path)
        except (UnicodeDecodeError, OSError):
            continue

        rel = os.path.relpath(path).replace(os.sep, '/')

        if args.strip_bom:
            if had_bom:
                write_text(path, text, bom=False)
                touched += 1
                print('stripped BOM  %s' % rel)
            continue

        n = count_suspect(text)
        if not n:
            continue
        total += n

        if args.check:
            print('%6d  %s%s' % (n, rel, '  (+BOM)' if had_bom else ''))
        else:
            fixed = repair(text)
            # Belt and braces: never write a U+FFFD that was not already there.
            if fixed.count('�') > text.count('�'):
                print('REFUSED %s: repair would introduce U+FFFD' % rel)
                return 1
            write_text(path, fixed, bom=had_bom)
            touched += 1
            print('%6d  %s' % (n, rel))

    if args.strip_bom:
        print('\n%d file(s) had a BOM removed.' % touched)
    elif args.check:
        print('\n%d mojibake run(s).' % total)
        # Non-zero exit so this can gate a commit or a CI step.
        return 1 if total else 0
    else:
        print('\nrepaired %d run(s) across %d file(s).' % (total, touched))
    return 0


if __name__ == '__main__':
    sys.exit(main())
