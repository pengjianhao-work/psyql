#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 transcript 恢复到子目录，并修复 ? 损坏的字符串。"""
from __future__ import annotations

import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "PsyQA" / "server" / "src"
TRANSCRIPT = Path(
    r"C:\Users\lenovo\.cursor\projects\c-Users-lenovo-Desktop-PsyQA1\agent-transcripts"
    r"\7a79d58e-45b0-4600-a45b-c17432f0e64d\7a79d58e-45b0-4600-a45b-c17432f0e64d.jsonl"
)

# services/ 旧路径 -> services/ 子目录
PATH_MAP = {
    "services/emotionService.ts": "services/psych/emotionService.ts",
    "services/historyManager.ts": "services/common/historyManager.ts",
    "services/reportQueue.ts": "services/common/reportQueue.ts",
    "services/seedDemoData.ts": "services/common/seedDemoData.ts",
    "services/interventionService.ts": "services/psych/interventionService.ts",
    "services/carePlanHints.ts": "services/psych/carePlanHints.ts",
    "services/psychStatsService.ts": "services/psych/psychStatsService.ts",
    "services/psychAnalysisService.ts": "services/psych/psychAnalysisService.ts",
    "services/psychNeuralEngine.ts": "services/psych/psychNeuralEngine.ts",
    "services/psychFusionEngine.ts": "services/psych/psychFusionEngine.ts",
    "services/psychFeatureEngine.ts": "services/psych/psychFeatureEngine.ts",
    "services/psychMLEngine.ts": "services/psych/psychMLEngine.ts",
    "services/psychMetrics.ts": "services/psych/psychMetrics.ts",
    "services/knowledgeScheduler.ts": "services/knowledge/knowledgeScheduler.ts",
    "services/ragService.ts": "services/knowledge/ragService.ts",
    "services/vectorDBService.ts": "services/knowledge/vectorDBService.ts",
    "services/embeddingService.ts": "services/knowledge/embeddingService.ts",
    "services/chromaVectorService.ts": "services/knowledge/chromaVectorService.ts",
    "services/llmClient.ts": "services/llm/llmClient.ts",
    "services/llmEnhanceService.ts": "services/llm/llmEnhanceService.ts",
    "services/zhipuClient.ts": "services/llm/zhipuClient.ts",
    "services/ollamaClient.ts": "services/llm/ollamaClient.ts",
    "services/ollamaAvailability.ts": "services/llm/ollamaAvailability.ts",
    "services/userProfileService.ts": "services/user/userProfileService.ts",
    "services/userMemoryService.ts": "services/user/userMemoryService.ts",
    "services/userAgentSummaryService.ts": "services/user/userAgentSummaryService.ts",
    "services/portraitService.ts": "services/user/portraitService.ts",
    "services/portraitQueue.ts": "services/user/portraitQueue.ts",
    "services/sessionService.ts": "services/user/sessionService.ts",
    "services/accountService.ts": "services/user/accountService.ts",
    "services/adminAccountService.ts": "services/user/adminAccountService.ts",
    "services/orgService.ts": "services/user/orgService.ts",
    "services/insightsStatus.ts": "services/user/insightsStatus.ts",
    "services/schoolService.ts": "services/school/schoolService.ts",
    "services/schoolReportService.ts": "services/school/schoolReportService.ts",
    "services/schoolAlertService.ts": "services/school/schoolAlertService.ts",
    "services/schoolStatsCache.ts": "services/school/schoolStatsCache.ts",
    "services/questionService.ts": "services/questionService.ts",
    "services/question/questionCatalog.ts": "services/question/questionCatalog.ts",
    "services/question/userProgressService.ts": "services/question/userProgressService.ts",
    "utils/psychTextAnalysis.ts": "utils/psychTextAnalysis.ts",
    "utils/relevanceFilter.ts": "utils/relevanceFilter.ts",
    "utils/textProcessor.ts": "utils/textProcessor.ts",
    "utils/resolveUserId.ts": "utils/resolveUserId.ts",
    "server.ts": "server.ts",
}

IMPORT_FIXES = [
    ("services/psych/", "from '../utils/", "from '../../utils/"),
    ("services/common/", "from './emotionService'", "from '../psych/emotionService'"),
    ("services/common/", "from './psychStatsService'", "from '../psych/psychStatsService'"),
    ("services/common/", "from './psychAnalysisService'", "from '../psych/psychAnalysisService'"),
    ("services/common/", "from './interventionService'", "from '../psych/interventionService'"),
    ("services/common/", "from './llmClient'", "from '../llm/llmClient'"),
    ("services/common/", "from './llmEnhanceService'", "from '../llm/llmEnhanceService'"),
    ("services/common/", "from './portraitQueue'", "from '../user/portraitQueue'"),
    ("services/common/", "from './portraitService'", "from '../user/portraitService'"),
    ("services/user/", "from '../db/", "from '../../db/"),
    ("services/user/", "from '../types/", "from '../../types/"),
    ("services/knowledge/", "from './psychMLEngine'", "from '../psych/psychMLEngine'"),
]

# knowledgeScheduler REPO_ROOT: 从 knowledge/ 需多一层 ..
KNOWLEDGE_SCHEDULER_OLD = "const REPO_ROOT = path.join(__dirname, '..', '..', '..');"
KNOWLEDGE_SCHEDULER_NEW = "const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');"


def fix_imports(text: str, rel: str) -> str:
    for prefix, old, new in IMPORT_FIXES:
        if rel.replace("\\", "/").startswith(prefix):
            text = text.replace(old, new)
    if rel.endswith("knowledge/knowledgeScheduler.ts"):
        text = text.replace(KNOWLEDGE_SCHEDULER_OLD, KNOWLEDGE_SCHEDULER_NEW)
    return text


def fix_broken_strings(text: str) -> str:
    """修复 UTF-8 末字节丢失导致的未闭合字符串。"""
    # '....?, -> '....',
    text = re.sub(r"'([^'\n]{4,}?),\s*\n", r"'\1',\n", text)
    text = re.sub(r"'([^'\n]{4,}?)\s*\}\);", r"'\1' });", text)
    text = re.sub(r"'([^'\n]{4,}?)\s*\);", r"'\1');", text)
    text = re.sub(r"'([^'\n]{4,}?)\s*\]", r"'\1']", text)
    text = re.sub(r"'([^'\n]{4,}?)\s*\}", r"'\1'}", text)
    # 模板字符串
    text = re.sub(r"`([^`\n]{4,}?)\s*\n", lambda m: m.group(0) if m.group(1).endswith("'") else m.group(1) + "`\n" if False else m.group(0), text)
    replacements = [
        ("考不?,", "考不好',"),
        ("补?,", "补考',"),
        ("看不?,", "看不进',"),
        ("睡不?,", "睡不着',"),
        ("注意?]", "注意力']"),
        ("沟?]", "沟通']"),
        ("没朋?,", "没朋友',"),
        ("计算机学? },", "计算机学院' },"),
        ("未分配院?", "未分配学院'"),
        ("正在执行?,", "正在执行中',"),
        ("更新脚?", "更新脚本:"),
        ("KNOWLEDGE_AUTO_UPDATE=1?", "KNOWLEDGE_AUTO_UPDATE=1）"),
        ("帮?]", "帮助']"),
        ("置?${", "置信度${"),
        ("等级为${risk}?", "等级为${risk}。"),
        ("围绕?{problem}", "围绕「${problem}"),
        ("输?JSON", "输出 JSON"),
        ("客?,", "客观',"),
        ("模?", "模式"),
        ("优?]", "优点']"),
        ("需?]", "需求']"),
        ("资?,", "资源',"),
        ("基础画像?", "基础画像。"),
        ("用户?{", "用户：${"),
        ("摘要?{", "摘要：${"),
        ("总结?", "总结："),
        ("情绪?", "情绪："),
        ("诱因?", "诱因："),
        ("话题?", "话题："),
        ("疏导?", "疏导："),
        ("内?", "内耗"),
        ("最?项", "最多3项"),
        ("共?", "共情"),
        ("开?", "开场"),
        ("待观?", "待观察"),
        ("?{month}", "【${month}"),
        ("${m.month}?", "${m.month}："),
        ("档案?00", "档案（400"),
        ("模?", "模式"),
        ("方?", "方式"),
        ("建?", "建议"),
        ("用户?", "用户："),
        ("摘要?", "摘要："),
        ("无对话?", "无对话）"),
        ("人设?", "人设】"),
        ("生成中?,", "生成中…',"),
        ("请稍后刷新查看?,", "请稍后刷新查看。',"),
        ("大模型推?,", "大模型推荐',"),
        ("12?8 字", "12–18 字"),
        ("话?*/", "话术"),
        ("要求?", "要求："),
        ("调节情绪?", "调节情绪」"),
        ("的那?", "的那种"),
        ("其它文?", "其它文字"),
        ("【用户?{", "【用户】${"),
        ("【主题?{", "【主题】${"),
        ("摘要?{", "摘要】${"),
        ("请输?JSON", "请输出 JSON"),
        ("80?20 汉字", "80–120 汉字"),
        ("心理中?热线", "心理中心/热线"),
        ("原话?{", "原话】${"),
        ("困扰类型?{", "困扰类型】${"),
        ("风险?{", "风险】${"),
        ("不?JSON", "不用 JSON"),
        ("要点?{", "要点：${"),
        ("听到你说?{", "听到你说「${"),
        ("提到?{", "提到「${"),
        ("调整方式?", "调整方式。"),
        ("**?{", "**${"),
        ("今?步", "今日3步"),
        ("长?", "长段"),
        ("页脚?", "页脚）"),
        ("异步生成?*/", "异步生成中"),
        ("第一位?", "第一位。"),
        ("计?·", "计划·"),
        ("?-4-3-2-1", "5-4-3-2-1"),
        ("手?游戏", "手机/游戏"),
        ("睡?小时", "睡前1小时"),
        ("写?件", "写3件"),
        ("?次职", "1次职"),
        ("或?个", "或1个"),
        ("人生?", "人生。"),
        ("记?个", "记1个"),
        ("每?0分钟", "每30分钟"),
    ]
    for old, new in replacements:
        text = text.replace(old, new)
    return text


def restore_from_transcript() -> int:
    if not TRANSCRIPT.exists():
        return 0
    latest: dict[str, str] = {}
    with open(TRANSCRIPT, encoding="utf-8") as f:
        for line in f:
            o = json.loads(line)
            for part in o.get("message", {}).get("content", []):
                if part.get("type") != "tool_use" or part.get("name") != "Write":
                    continue
                p = part.get("input", {}).get("path", "").replace("\\", "/")
                c = part.get("input", {}).get("contents")
                if not p or not c:
                    continue
                if "PsyQA/server/src/" in p:
                    rel = p.split("PsyQA/server/src/", 1)[1]
                else:
                    continue
                latest[rel] = c

    n = 0
    for rel, content in latest.items():
        target_rel = PATH_MAP.get(rel, rel)
        out = SRC / target_rel.replace("/", "\\")
        out.parent.mkdir(parents=True, exist_ok=True)
        text = fix_imports(content, target_rel.replace("\\", "/"))
        out.write_text(text, encoding="utf-8")
        print(f"[restore] {target_rel}")
        n += 1
    return n


def patch_existing() -> int:
    n = 0
    for p in SRC.rglob("*.ts"):
        if "export * from" in p.read_text(encoding="utf-8", errors="replace")[:80]:
            continue
        text = p.read_text(encoding="utf-8", errors="replace")
        fixed = fix_broken_strings(text)
        if fixed != text:
            p.write_text(fixed, encoding="utf-8")
            print(f"[patch] {p.relative_to(REPO)}")
            n += 1
    return n


def main() -> None:
    print("=== restore ===")
    r = restore_from_transcript()
    print(f"restored {r} files")
    # fix_broken_strings 会误伤合法代码，仅做 transcript 恢复
    print("=== patch (skipped) ===")
    print("patched 0 files")


if __name__ == "__main__":
    main()
