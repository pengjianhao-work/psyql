#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""修复 server/src 编码损坏与模块路径垫片。"""
from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "PsyQA" / "server" / "src"
SERVICES = SRC / "services"

# 子目录 -> 真实模块路径（相对 services/）
SHIM_MAP: dict[str, str] = {
    "historyManager": "common/historyManager",
    "reportQueue": "common/reportQueue",
    "seedDemoData": "common/seedDemoData",
    "emotionService": "psych/emotionService",
    "psychStatsService": "psych/psychStatsService",
    "psychAnalysisService": "psych/psychAnalysisService",
    "psychNeuralEngine": "psych/psychNeuralEngine",
    "psychFusionEngine": "psych/psychFusionEngine",
    "psychFeatureEngine": "psych/psychFeatureEngine",
    "psychMLEngine": "psych/psychMLEngine",
    "psychMetrics": "psych/psychMetrics",
    "interventionService": "psych/interventionService",
    "carePlanHints": "psych/carePlanHints",
    "llmClient": "llm/llmClient",
    "llmEnhanceService": "llm/llmEnhanceService",
    "zhipuClient": "llm/zhipuClient",
    "ollamaClient": "llm/ollamaClient",
    "ollamaAvailability": "llm/ollamaAvailability",
    "ragService": "knowledge/ragService",
    "vectorDBService": "knowledge/vectorDBService",
    "embeddingService": "knowledge/embeddingService",
    "chromaVectorService": "knowledge/chromaVectorService",
    "knowledgeScheduler": "knowledge/knowledgeScheduler",
    "userProfileService": "user/userProfileService",
    "userMemoryService": "user/userMemoryService",
    "userAgentSummaryService": "user/userAgentSummaryService",
    "portraitService": "user/portraitService",
    "portraitQueue": "user/portraitQueue",
    "insightsStatus": "user/insightsStatus",
    "sessionService": "user/sessionService",
    "accountService": "user/accountService",
    "adminAccountService": "user/adminAccountService",
    "orgService": "user/orgService",
    "schoolService": "school/schoolService",
    "schoolReportService": "school/schoolReportService",
    "schoolAlertService": "school/schoolAlertService",
    "schoolStatsCache": "school/schoolStatsCache",
}

SUBDIRS = ["", "common", "psych", "llm", "knowledge", "user", "school", "question"]


def write_shim(base: Path, name: str, target: str) -> None:
    rel = Path(target.replace("/", "\\"))
    actual = SERVICES / target.replace("/", "/")
    if not actual.with_suffix(".ts").exists():
        return
    shim = base / f"{name}.ts"
    if shim.exists() and shim.read_text(encoding="utf-8", errors="replace").startswith("export *"):
        return
    depth = len(base.relative_to(SERVICES).parts) if base != SERVICES else 0
    prefix = "/".join([".."] * depth) if depth else "."
    if prefix == ".":
        import_path = f"./{target}"
    else:
        import_path = f"{prefix}/{target}"
    shim.write_text(f"export * from '{import_path}';\n", encoding="utf-8")
    print(f"[shim] {shim.relative_to(REPO)}")


def create_shims() -> None:
    for sub in SUBDIRS:
        base = SERVICES if sub == "" else SERVICES / sub
        base.mkdir(parents=True, exist_ok=True)
        for name, target in SHIM_MAP.items():
            actual = SERVICES / f"{target}.ts"
            if not actual.exists():
                continue
            if (base / f"{name}.ts").resolve() == actual.resolve():
                continue
            write_shim(base, name, target)


# 逐词修复：损坏字符 ? 替换了 UTF-8 末字节
WORD_FIXES: list[tuple[str, str]] = [
    ("'开?,", "'开心',"),
    ("'成就?,", "'成就感',"),
    ("'害?,", "'害怕',"),
    ("'着?,", "'着急',"),
    ("'愤?,", "'愤怒',"),
    ("'气死?,", "'气死了',"),
    ("'没人?,", "'没朋友',"),
    ("'不知所?,", "'不知道',"),
    ("'不清?,", "'不清楚',"),
    ("'不明?,", "'不明白',"),
    ("'不知道怎么?,", "'不知道怎么',"),
    ("'做不?,", "'做不到',"),
    ("'对不?,", "'对不起',"),
    ("'高?,", "'高考',"),
    ("'人际沟?,", "'人际沟通',"),
    ("'异地?,", "'异地恋',"),
    ("'前?,", "'前途',"),
    ("'价?,", "'价值',"),
    ("'自我怀?,", "'自我怀疑',"),
    ("'自尊?,", "'自尊心',"),
    ("'颜?,", "'颜值',"),
    ("'不想?,", "'不想活',"),
    ("'打自?,", "'打自己',"),
    ("'咬自?,", "'咬自己',"),
    ("'心死?,", "'心死了',"),
    ("'撑不?,", "'撑不住',"),
    ("'快疯?,", "'快疯了',"),
    ("'杀?,", "'杀人',"),
    ("'打别?,", "'打别人',"),
    ("'动手?,", "'动手了',"),
    ("'睡不?,", "'睡不着',"),
    ("'不开?,", "'不开心',"),
    ("'没朋?,", "'没朋友',"),
    ("'为什?,", "'为什么',"),
    ("'什?,", "'什么',"),
    ("'是不?,", "'是不是',"),
    ("'一?,", "'一些',"),
    ("'需?,", "'需要',"),
    ("'怎么?,", "'怎么办',"),
    ("'能不?,", "'能不能',"),
    ("'会不?,", "'会不会',"),
    ("'好不?,", "'好不好',"),
    ("'考不?,", "'考不好',"),
    ("'补?,", "'补考',"),
    ("'看不?,", "'看不进',"),
    ("'注意?,", "'注意力',"),
    ("'沟?,", "'沟通',"),
    ("'孤独?,", "'孤独感',"),
    ("'家庭沟?,", "'家庭沟通',"),
    ("'自信心不?,", "'自信心不足',"),
    ("'价值认?,", "'价值认同',"),
    ("'心态调?,", "'心态调整',"),
    ("'已过? });", "'已过期' });"),
    ("'已过?);", "'已过期');"),
    ("'该功? });", "'该功能' });"),
    ("'该功?);", "'该功能');"),
    ("'帮助?);", "'帮助');"),
    ("热线?00-161-9995", "热线400-161-9995"),
    ("'?,", "'不',"),
    ("'?, '没有'", "'不', '没有'"),
    ("'?, '他们'", "'他', '他们'"),
    ("'?, '自己'", "'我', '自己'"),
    ("'?,", "'低',"),
    ("'?,", "'中',"),
    ("'?,", "'高',"),
    ("join('?)", "join('、')"),
    ("'?", "'无'"),
    ("'?) ", "'、') "),
    ("以?{", "以「{"),
    ("集中在?{", "集中在「{"),
    ("?{getCategoryName", "「{getCategoryName"),
    ("领域?{", "领域」{"),
    ("参考?}", "参考'"),
    ("结果?}", "结果'"),
    ("解?${", "解读${"),
    ("报告?", "报告」"),
    ("分?", "分析"),
    ("情绪?{", "情绪：{"),
    ("问题?{", "问题：{"),
    ("框架?{", "框架：{"),
    ("评?-", "评估"),
    ("提?${", "提示${"),
    ("指标（模型估计）?", "指标（模型估计）："),
    ("指数?{", "指数：{"),
    ("心理咨?", "心理咨询"),
    ("热情、积极、鼓?,", "热情、积极、鼓励',"),
    ("陪着?..", "陪着你..."),
    ("共?,", "共情',"),
    ("引?,", "引导',"),
    ("🌬?,", "🌬️',"),
    ("支?,", "支持',"),
    ("帮助?👋", "帮助！👋"),
    ("友?,", "友好',"),
    ("梳?..", "梳理..."),
    ("分?,", "分析',"),
    ("正?..", "正常..."),
    ("成?..", "成长..."),
    ("安?,", "安慰',"),
    ("接?..", "接纳..."),
    ("赞?,", "赞美',"),
    ("开?,", "开心',"),
    ("愤?,", "愤怒',"),
]

# 完整块替换（更可靠）
BLOCKS: dict[str, str] = {}


def patch_file(path: Path) -> bool:
    text = path.read_text(encoding="utf-8", errors="replace")
    orig = text
    for old, new in WORD_FIXES:
        text = text.replace(old, new)
    # 未闭合字符串：'...? }); -> '...期' });
    text = re.sub(r"'([^'\n]{2,30})\?\s*\}\);", r"'\1期' });", text)
    text = re.sub(r"'([^'\n]{2,30})\?\s*\);", r"'\1期');", text)
    if text != orig:
        path.write_text(text, encoding="utf-8")
        return True
    return False


def patch_encoding() -> int:
    n = 0
    for p in SRC.rglob("*.ts"):
        if patch_file(p):
            print(f"[enc] {p.relative_to(REPO)}")
            n += 1
    return n


def main() -> None:
    print("=== 创建模块垫片 ===")
    create_shims()
    print("\n=== 修复编码 ===")
    n = patch_encoding()
    print(f"\n完成：垫片已写入，编码修复 {n} 个文件")


if __name__ == "__main__":
    main()
