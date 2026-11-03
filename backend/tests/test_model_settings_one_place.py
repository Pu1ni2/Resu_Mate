"""The AI models are named in one place: the settings.

They were written into seven files, so changing one meant finding every
copy. The server reads them from app/core/config.py, and the interview
worker reads the same names from its environment.
"""
import re
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
# A model named in a call: model="gpt-4o", or model='tts-1'.
NAMED_IN_CODE = re.compile(r"""\bmodel\s*=\s*["']""")


def _sources():
    yield from (p for p in (BACKEND / "app").rglob("*.py") if p.name != "config.py" or p.parent.name != "core")
    yield BACKEND / "interview_agent.py"


def test_no_model_is_named_in_the_code():
    named = [f"{p.relative_to(BACKEND)}:{n}" for p in _sources()
             for n, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1) if NAMED_IN_CODE.search(line)]
    assert named == []


def test_the_settings_name_every_model():
    from app.core.config import settings
    for name in ("openai_model", "realtime_model", "embedding_model", "transcription_model",
                 "speech_to_text_model", "text_to_speech_model"):
        assert getattr(settings, name), name


def test_the_worker_reads_the_same_names_as_the_server():
    source = (BACKEND / "interview_agent.py").read_text(encoding="utf-8")
    assert 'os.getenv("REALTIME_MODEL"' in source
    assert 'os.getenv("TRANSCRIPTION_MODEL"' in source
