#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 agent transcript 恢复损坏的 TS 源文件（取最后一次 Write）。"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
TRANSCRIPT = Path(
    r"C:\Users\lenovo\.cursor\projects\c-Users-lenovo-Desktop-PsyQA1\agent-transcripts"
    r"\7a79d58e-45b0-4600-a45b-c17432f0e64d\7a79d58e-45b0-4600-a45b-c17432f0e64d.jsonl"
)

# 相对 server/src 的路径映射（transcript 里可能是旧路径 services/xxx）
PATH_MAP = {
    "services/emotionService.ts": "services/psych/emotionService.ts",
    "services/historyManager.ts": "services/common/historyManager.ts",
    "services/reportQueue.ts": "services/common/reportQueue.ts",
    "services/seedDemoData.ts": "services/common/seedDemoData.ts",
    "services/interventionService.ts": "services/psych/interventionService.ts",
    "services/answerOrchestrator.ts": "services/question/answerOrchestrator.ts",
    "utils/psychTextAnalysis.ts": "utils/psychTextAnalysis.ts",
    "utils/relevanceFilter.ts": "utils/relevanceFilter.ts",
    "utils/textProcessor.ts": "utils/textProcessor.ts",
    "server.ts": "server.ts",
}


def normalize_path(raw: str) -> str | None:
    raw = raw.replace("\\", "/")
    if "PsyQA/server/src/" in raw:
        rel = raw.split("PsyQA/server/src/", 1)[1]
    elif raw.startswith("server/src/"):
        rel = raw.split("server/src/", 1)[1]
    else:
        return None
    return PATH_MAP.get(rel, rel)


def fix_imports(text: str, rel: str) -> str:
    """psych/ 下文件引用 utils 需 ../../utils"""
    if rel.startswith("services/psych/"):
        text = text.replace("from '../utils/", "from '../../utils/")
    if rel.startswith("services/common/"):
        text = text.replace("from './emotionService'", "from '../psych/emotionService'")
        text = text.replace("from './psychStatsService'", "from '../psych/psychStatsService'")
        text = text.replace("from './psychAnalysisService'", "from '../psych/psychAnalysisService'")
        text = text.replace("from './interventionService'", "from '../psych/interventionService'")
        text = text.replace("from './llmClient'", "from '../llm/llmClient'")
        text = text.replace("from './llmEnhanceService'", "from '../llm/llmEnhanceService'")
        text = text.replace("from './portraitQueue'", "from '../user/portraitQueue'")
    return text


def main() -> int:
    if not TRANSCRIPT.exists():
        print("transcript not found", file=sys.stderr)
        return 1
    latest: dict[str, str] = {}
    with open(TRANSCRIPT, encoding="utf-8") as f:
        for line in f:
            o = json.loads(line)
            for part in o.get("message", {}).get("content", []):
                if part.get("type") != "tool_use" or part.get("name") != "Write":
                    continue
                inp = part.get("input", {})
                p = inp.get("path", "")
                c = inp.get("contents")
                if not p or not c:
                    continue
                rel = normalize_path(p)
                if rel:
                    latest[rel] = c

    src = REPO / "PsyQA" / "server" / "src"
    for rel, content in sorted(latest.items()):
        out = src / rel.replace("/", "\\") if "\\" in str(src) else src / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        content = fix_imports(content, rel)
        out.write_text(content, encoding="utf-8")
        print(f"[restore] {rel} ({len(content)} chars)")

    print(f"restored {len(latest)} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
