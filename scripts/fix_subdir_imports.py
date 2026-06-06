#!/usr/bin/env python3
"""删除 question/ 下误生成的垫片，修复子目录 import 路径。"""
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent / "PsyQA" / "server" / "src" / "services"
KEEP_IN_QUESTION = {
    "answerOrchestrator.ts",
    "llmEnhanceService.ts",
    "questionCatalog.ts",
    "userProgressService.ts",
}

IMPORT_RULES: list[tuple[str, list[tuple[str, str]]]] = [
    (
        "common/",
        [
            ("from '../utils/", "from '../../utils/"),
            ("from '../db/", "from '../../db/"),
            ("from '../types/", "from '../../types/"),
        ],
    ),
    (
        "knowledge/",
        [
            ("from '../utils/", "from '../../utils/"),
            ("from './emotionService'", "from '../psych/emotionService'"),
            ("from './psychMLEngine'", "from '../psych/psychMLEngine'"),
        ],
    ),
    (
        "psych/",
        [
            ("from './historyManager'", "from '../common/historyManager'"),
            ("from './ollamaClient'", "from '../llm/ollamaClient'"),
        ],
    ),
    (
        "user/",
        [
            ("from '../db/", "from '../../db/"),
            ("from './historyManager'", "from '../common/historyManager'"),
            ("from './reportQueue'", "from '../common/reportQueue'"),
            ("from './psychStatsService'", "from '../psych/psychStatsService'"),
            ("from './emotionService'", "from '../psych/emotionService'"),
            ("from './ollamaClient'", "from '../llm/ollamaClient'"),
            ("from './llmClient'", "from '../llm/llmClient'"),
            ("from './vectorDBService'", "from '../knowledge/vectorDBService'"),
            ("from './chromaVectorService'", "from '../knowledge/chromaVectorService'"),
            ("from './embeddingService'", "from '../knowledge/embeddingService'"),
        ],
    ),
    (
        "school/",
        [
            ("from '../utils/", "from '../../utils/"),
            ("from './historyManager'", "from '../common/historyManager'"),
            ("from './accountService'", "from '../user/accountService'"),
            ("from './emotionService'", "from '../psych/emotionService'"),
        ],
    ),
    (
        "common/",
        [
            ("from './ollamaAvailability'", "from '../llm/ollamaAvailability'"),
            ("from './accountService'", "from '../user/accountService'"),
            ("from './schoolAlertService'", "from '../school/schoolAlertService'"),
            ("from './orgService'", "from '../user/orgService'"),
        ],
    ),
]


def main() -> None:
    qdir = REPO / "question"
    for fp in qdir.glob("*.ts"):
        if fp.name not in KEEP_IN_QUESTION:
            fp.unlink()
            print(f"[del] question/{fp.name}")

    # 根目录 vectorDBService 垫片
    vdb = REPO / "vectorDBService.ts"
    vdb.write_text("export * from './knowledge/vectorDBService';\n", encoding="utf-8")
    print("[fix] vectorDBService.ts")

    n = 0
    for prefix, rules in IMPORT_RULES:
        base = REPO / prefix.rstrip("/")
        if not base.exists():
            continue
        for fp in base.rglob("*.ts"):
            if fp.read_text(encoding="utf-8", errors="replace").startswith("export * from"):
                continue
            text = fp.read_text(encoding="utf-8", errors="replace")
            orig = text
            for old, new in rules:
                text = text.replace(old, new)
            if text != orig:
                fp.write_text(text, encoding="utf-8")
                print(f"[import] {fp.relative_to(REPO)}")
                n += 1
    print(f"fixed {n} import files")


if __name__ == "__main__":
    main()
