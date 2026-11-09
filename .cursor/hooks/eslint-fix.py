import json
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

CONFIG_NAMES = {
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
    "eslint.config.ts",
    ".eslintrc",
    ".eslintrc.js",
    ".eslintrc.cjs",
    ".eslintrc.json",
    ".eslintrc.yml",
}
SOURCE_SUFFIXES = {".ts", ".tsx", ".js", ".jsx"}


def emit(payload):
    json.dump(payload, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


def find_root(path):
    for parent in [path.parent, *path.parents]:
        if any((parent / name).exists() for name in CONFIG_NAMES):
            return parent
    return None


def main():
    try:
        raw = sys.stdin.read()
        data = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        emit({})
        return

    file_path = str(data.get("file_path") or "")
    path = Path(file_path)
    if path.suffix.lower() not in SOURCE_SUFFIXES or not path.exists():
        emit({})
        return

    root = find_root(path)
    if root is None:
        emit({})
        return

    eslint_bin = root / "node_modules" / ".bin" / "eslint.cmd"
    if not eslint_bin.exists():
        eslint_bin = root / "node_modules" / ".bin" / "eslint"
    if not eslint_bin.exists():
        emit({})
        return

    subprocess.run(
        [str(eslint_bin), "--fix", str(path)],
        cwd=str(root),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=45,
        check=False,
    )
    emit({})


if __name__ == "__main__":
    try:
        main()
    except Exception:
        emit({})
        sys.exit(0)
