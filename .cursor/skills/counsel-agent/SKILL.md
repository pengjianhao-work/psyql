---
name: counsel-agent
description: 修改心理港湾咨询 Agent 或危机分支时使用。本仓库不是 LangGraph 项目。
---

# 咨询 Agent

问答不是 LangGraph。不要新增 `langgraph` 节点文件，也不要按 `lib/llm` 或 Prisma 的结构改。

## 主要文件

- 编排：`PsyQA/server/src/services/question/answerOrchestrator.ts`
- 控制器：`PsyQA/server/src/controllers/questionController.ts`
- 咨询：`PsyQA/server/src/services/llm/counselAgent.ts`、`reactCounselAgent.ts`、`totCounselAgent.ts`、`coreTaskLoopAgent.ts`
- 模型调用：`PsyQA/server/src/services/llm/llmClient.ts`
- 风险：`PsyQA/server/src/services/psych/emotionService.ts`（`low | medium | high | critical`）
- 干预框架：`PsyQA/server/src/services/psych/interventionService.ts`（`high`/`critical` → `safety_plan`）
- 检索：`PsyQA/server/src/services/knowledge/ragService.ts`
- ReAct 额外工具：`suggest_micro_training`、`recommend_video`（危机禁用）
- 豆包蒸馏：`training_data/distill_doubao/` → `scripts/scrub_doubao_distill.py` → `merge_scenario_skill_pack.py`

## 改的时候记住

- `high` / `critical` 或规则命中危机时必须走安全路径，保留求助通道和 `CRISIS_HOTLINE`（`400-161-9995`）。
- 回答要流式；首字前不要串行等待相似问题扫描或追问生成。
- 非追问时不要用上一轮记忆改写检索词或回答。
- 检索文档 id 不能在合并排序时丢失。
- 改完提示词或检索、重排后跑 `npm run eval:ragas`；场景/干预改完优先 `npm run eval:counsel -- --online`。
