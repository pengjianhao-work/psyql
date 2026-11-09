import json
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")


def emit(payload):
    json.dump(payload, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")


def find_package(start):
    found = []
    for parent in [start, *start.parents]:
        candidate = parent / "package.json"
        if candidate.exists():
            found.append(candidate)
    for candidate in found:
        try:
            meta = json.loads(candidate.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        scripts = meta.get("scripts") or {}
        if any(name in scripts for name in ("check", "test:server", "eval:ragas")):
            return candidate
    return found[0] if found else None


def main():
    try:
        raw = sys.stdin.read()
        data = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        emit({"permission": "allow"})
        return

    cwd = Path(str(data.get("cwd") or ".")).resolve()
    package_json = find_package(cwd)
    if package_json is None:
        emit({"permission": "allow"})
        return

    try:
        meta = json.loads(package_json.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        emit({
            "permission": "allow",
            "agent_message": "package.json 无法读取，跳过提交前检查。",
        })
        return

    scripts = meta.get("scripts") or {}
    # 优先跑启动自检。不要在每次 git commit 时自动跑完整 Jest 或 CRA test，
    # 那些依赖本地服务，也容易误匹配到 client 的 react-scripts test。
    wanted = [name for name in ("typecheck", "lint", "check") if name in scripts]
    if not wanted:
        emit({
            "permission": "allow",
            "agent_message": "未找到 typecheck、lint 或 check，跳过提交前自动检查。提交前请在 PsyQA 目录手动跑 npm run test。",
        })
        return

    failed = []
    root = package_json.parent
    for name in wanted:
        result = subprocess.run(
            f"npm run {name}",
            cwd=str(root),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            shell=True,
            timeout=90,
            check=False,
        )
        if result.returncode != 0:
            tail = ((result.stdout or "") + "\n" + (result.stderr or ""))[-1200:]
            failed.append(f"{name}:\n{tail}")

    if failed:
        emit({
            "permission": "deny",
            "user_message": "提交前的 typecheck、lint 或 check 没通过。",
            "agent_message": "先修好再提交。\n" + "\n".join(failed),
        })
        return

    emit({"permission": "allow"})


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        emit({
            "permission": "allow",
            "agent_message": f"提交前检查脚本异常，已放行：{exc}",
        })
        sys.exit(0)
