#!/usr/bin/env python3
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent / "PsyQA" / "server" / "src" / "services"
SHIM_MAP = {
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

for name, target in SHIM_MAP.items():
    actual = REPO / f"{target}.ts"
    if not actual.exists():
        continue
    shim = REPO / f"{name}.ts"
    if shim.resolve() == actual.resolve():
        continue
    shim.write_text(f"export * from './{target}';\n", encoding="utf-8")
    print(f"shim {shim.name}")
