"""The interview worker's settings: the file the server reads, and never
over a setting already made.

It loaded backend/.env over everything, so a test that imported the worker
got the real OpenAI key, which the tests had taken out, and the platform's
own settings lost to a stray file.
"""
import os
import signal
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]


def _start_the_worker(env, log_path, wait=60):
    """Run `interview_agent.py start`; its exit code, or None if it kept
    running, and what it said.

    Started, LiveKit's worker never exits by itself: it keeps trying to
    connect, and its own processes outlive it. So the output goes to a file,
    where nothing can hold the test up, and after `wait` seconds the whole
    group of processes is ended.
    """
    apart = {"start_new_session": True} if os.name == "posix" else {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
    with open(log_path, "w", encoding="utf-8") as log:
        worker = subprocess.Popen([sys.executable, "interview_agent.py", "start"], cwd=BACKEND, env=env,
                                  stdout=log, stderr=subprocess.STDOUT, **apart)
        try:
            code = worker.wait(timeout=wait)
        except subprocess.TimeoutExpired:
            if os.name == "posix":
                os.killpg(worker.pid, signal.SIGKILL)
            else:
                subprocess.run(["taskkill", "/T", "/F", "/PID", str(worker.pid)], capture_output=True)
            worker.wait()
            code = None
    return code, Path(log_path).read_text(encoding="utf-8", errors="replace")


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


def test_a_deployed_worker_wont_start_without_its_server_and_secret(tmp_path):
    import interview_agent
    assert interview_agent.missing_for_start(["interview_agent.py", "start"], {}) == ["BACKEND_URL", "AGENT_SHARED_SECRET"]
    # Run locally (dev), it needs neither: the backend on the same computer.
    assert interview_agent.missing_for_start(["interview_agent.py", "dev"], {}) == []

    env = {k: v for k, v in os.environ.items() if k not in ("BACKEND_URL", "AGENT_SHARED_SECRET")}
    env["RESUMATE_ENV_FILE"] = os.devnull
    code, said = _start_the_worker(env, tmp_path / "start.log")
    assert code not in (0, None), said[-2000:]
    assert "can't start without BACKEND_URL and AGENT_SHARED_SECRET" in said
