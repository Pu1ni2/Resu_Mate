"""What the web server installs: everything its code imports, and nothing
only the tests or the interview worker need.

The test tools and the worker's LiveKit libraries were installed on the web
server too, making each deploy bigger and slower, with more code to keep
patched that the server never runs. They're in requirements-dev.txt now,
which CI installs; the server installs requirements.txt alone.

Since CI installs both, a module the server imports that only the developers'
file installs would pass every test and fail on Render. So the last test
reads every import in the server's code, and checks requirements.txt installs
it; and the same for the worker and its own file.
"""
import ast
import importlib.metadata as metadata
import re
import sys
from pathlib import Path

import pytest
import yaml
from packaging.requirements import Requirement

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent

TEST_TOOLS = {"pytest", "pytest-asyncio", "pyyaml", "packaging"}
WORKER_LIBRARIES = {"livekit-agents", "livekit-plugins-openai", "livekit-plugins-simli"}


def _name(text):
    return re.sub(r"[-_.]+", "-", text).lower()


def _lines(file):
    return [line.split("#", 1)[0].strip() for line in (BACKEND / file).read_text(encoding="utf-8").splitlines()]


def _requirements(file):
    """The requirements a file names, with those of the files it includes."""
    found = []
    for line in _lines(file):
        if line.startswith("-r "):
            found += _requirements(line[3:].strip())
        elif line:
            found.append(Requirement(line))
    return found


def _names(file):
    return {_name(r.name) for r in _requirements(file)}


def test_the_server_installs_neither_test_tools_nor_the_worker():
    assert not _names("requirements.txt") & (TEST_TOOLS | WORKER_LIBRARIES)


def test_the_tests_install_the_server_the_worker_and_their_tools():
    included = [line[3:].strip() for line in _lines("requirements-dev.txt") if line.startswith("-r ")]
    assert included == ["requirements.txt", "requirements-agent.txt"]
    assert TEST_TOOLS | WORKER_LIBRARIES <= _names("requirements-dev.txt")


def _ci_installs(job):
    ci = yaml.safe_load((ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8"))
    return [step["run"] for step in ci["jobs"][job]["steps"] if "pip install" in step.get("run", "")]


def test_ci_tests_with_the_developers_file_and_migrates_with_the_servers():
    assert _ci_installs("backend") == ["pip install -r requirements-dev.txt"]
    # The migrations job starts the app on the server's install alone, so a
    # module only the developers' file installs fails there, as on Render.
    assert _ci_installs("migrations") == ["pip install -r requirements.txt"]


def test_each_service_on_render_installs_its_own_file():
    text = (ROOT / "render.yaml").read_text(encoding="utf-8")
    backend = next(s for s in yaml.safe_load(text)["services"] if s["name"] == "resumate-backend")
    assert backend["buildCommand"].startswith("pip install -r requirements.txt ")
    # The worker's block is commented out until it's deployed. Uncommented,
    # it installs the worker's own file.
    lines = text.splitlines()
    block = []
    for line in lines[lines.index("  # - type: worker"):]:
        if not line.startswith("  # "):
            break
        block.append(line[4:])
    worker = yaml.safe_load("\n".join(block))[0]
    assert (worker["name"], worker["buildCommand"]) == ("resumate-interview", "pip install -r requirements-agent.txt")


# ── every import, installed ───────────────────────────────────────────────────

SERVER_CODE = ["app", "main.py", "alembic", "cleanup_stale.py", "reset_password.py", "scripts"]
WORKER_CODE = ["interview_agent.py"]


def _installed_by(requirements):
    """Every distribution these requirements install, by the installed
    distributions' own metadata, extras and platform markers included."""
    extras_of = {}
    waiting = [(_name(r.name), set(r.extras)) for r in requirements]
    while waiting:
        name, extras = waiting.pop()
        if name in extras_of and extras <= extras_of[name]:
            continue
        extras_of[name] = extras_of.get(name, set()) | extras
        try:
            needs = metadata.distribution(name).requires or []
        except metadata.PackageNotFoundError:
            continue
        for text in needs:
            need = Requirement(text)
            if need.marker is None or any(need.marker.evaluate({"extra": e}) for e in ["", *extras_of[name]]):
                waiting.append((_name(need.name), set(need.extras)))
    return set(extras_of)


def _imports(entries):
    """Each top-level module the code imports, anywhere in it, and one place
    that imports it."""
    paths = []
    for entry in entries:
        path = BACKEND / entry
        paths += sorted(path.rglob("*.py")) if path.is_dir() else [path]
    found = {}
    for path in paths:
        for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
            if isinstance(node, ast.Import):
                modules = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom) and node.level == 0:
                modules = [node.module]
            else:
                continue
            for module in modules:
                found.setdefault(module.split(".")[0], f"{path.relative_to(BACKEND).as_posix()}:{node.lineno}")
    return found


@pytest.mark.parametrize("code, file", [(SERVER_CODE, "requirements.txt"), (WORKER_CODE, "requirements-agent.txt")])
def test_every_module_the_code_imports_is_installed_by_its_own_file(code, file):
    imported = _imports(code)
    ours = {"app"} | {path.stem for path in BACKEND.glob("*.py")}
    installed = _installed_by(_requirements(file))
    owners = metadata.packages_distributions()
    missing = [
        f"{module} ({where})" for module, where in sorted(imported.items())
        if module not in sys.stdlib_module_names and module not in ours
        and not {_name(d) for d in owners.get(module, [])} & installed
    ]
    assert missing == []
    # The check reads real imports: the server's PDF reader, the worker's
    # LiveKit.
    assert ("fitz" if file == "requirements.txt" else "livekit") in imported
