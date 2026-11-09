"""The interview worker's settings: the file the server reads, and never
over a setting already made.

It loaded backend/.env over everything, so a test that imported the worker
got the real OpenAI key, which the tests had taken out, and the platform's
own settings lost to a stray file.
"""
import os
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]


def test_the_worker_reads_the_named_settings_file_and_overrides_nothing(tmp_path):
    settings = tmp_path / "worker.env"
    settings.write_text("BACKEND_URL=http://from-the-file\nSIMLI_FACE_ID=from-the-file\n", encoding="utf-8")
    env = {**os.environ, "RESUMATE_ENV_FILE": str(settings), "BACKEND_URL": "http://already-set"}
    env.pop("SIMLI_FACE_ID", None)
    # In a process of its own: importing the worker loads its settings once.
    worker = subprocess.run(
        [sys.executable, "-c", "import interview_agent as w; print(w.BACKEND_URL, w.SIMLI_FACE_ID)"],
        cwd=BACKEND, env=env, capture_output=True, text=True, timeout=120,
    )
    assert worker.returncode == 0, worker.stderr[-2000:]
    assert worker.stdout.split()[-2:] == ["http://already-set", "from-the-file"]
