"""Remake the locked requirement files from the .in files.

Each backend/requirements*.in names what is wanted, with the lowest versions
that work. This pins all of it, every dependency included, at one exact
version with the hashes of its files, into the .txt file of the same name:
what Render, CI and the worker's image install. It runs uv's pip compile, in
Docker with a fixed uv, for runtime.txt's Python on every system: the same
files install on Linux, macOS and Windows. Dependabot updates them with uv
too, keeping those options.

    python backend/scripts/lock_requirements.py               # after changing a .in file
    python backend/scripts/lock_requirements.py -P fastapi    # fastapi to its newest allowed
    python backend/scripts/lock_requirements.py --upgrade     # everything to its newest allowed

Without either option, every version already pinned stays where it is, if
the .in files still allow it. The tests' file comes first: the server's and
the worker's requirements together, as CI installs them. The server's and the
worker's files are then held to its versions, so CI tests what production
runs. (The worker's LiveKit, for one, needs openai below 3, so the server's
openai stays below 3 too.) Needs Docker.
"""
import argparse
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
UV = "0.13.7"


def runtime_python():
    """runtime.txt's Python: 3.12.8 for python-3.12.8."""
    return (BACKEND / "runtime.txt").read_text(encoding="utf-8").strip().removeprefix("python-")


def python_version():
    """The oldest Python the files are made for: runtime.txt's, as 3.12."""
    return ".".join(runtime_python().split(".")[:2])


def compile_command(in_file, upgrade, packages, constraints=()):
    parts = ["uv pip compile --quiet --universal", f"--python-version {python_version()}", "--generate-hashes"]
    parts += ["--upgrade"] if upgrade else []
    parts += [f"--upgrade-package {name}" for name in packages]
    parts += [f"-c {c}" for c in constraints]
    parts += [f"--output-file {in_file[:-3]}.txt", in_file]
    return " ".join(parts)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--upgrade", action="store_true", help="every package to its newest allowed version")
    parser.add_argument("-P", "--upgrade-package", action="append", default=[], metavar="NAME",
                        help="this package to its newest allowed version (may be repeated)")
    args = parser.parse_args()
    tested = ("requirements-dev.txt",)
    steps = [
        f"pip install --quiet --disable-pip-version-check --root-user-action=ignore uv=={UV}",
        compile_command("requirements-dev.in", args.upgrade, args.upgrade_package),
        compile_command("requirements.in", args.upgrade, args.upgrade_package, constraints=tested),
        compile_command("requirements-agent.in", args.upgrade, args.upgrade_package, constraints=tested),
    ]
    # The named volume keeps uv's downloads between runs.
    command = ["docker", "run", "--rm", "-v", f"{BACKEND}:/backend", "-v", "resumate-lock-cache:/root/.cache",
               "-w", "/backend", f"python:{runtime_python()}-slim", "sh", "-c", " && ".join(steps)]
    sys.exit(subprocess.call(command))


if __name__ == "__main__":
    main()
