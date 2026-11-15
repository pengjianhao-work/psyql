---
name: counsel-agent
description: 修改心理港湾咨询 Agent、危机分支或干预框架时使用。本仓库不是 LangGraph 项目。
---

# 咨询 Agent

问答编排是 Express + TypeScript，不是 LangGraph。不要新增 `langgraph` 节点文件，不要按 `lib/llm/client.ts`、Prisma 或 pgvector 的结构改代码。

## 边界

- 本 skill 只覆盖服务端咨询链路：编排、Agent、LLM 调用、风险分级、干预、安全路径。
- 前端页面与样式不在此列，走 `.cursor/rules/psyqa-ui.mdc`；通用工程约束见 `.cursor/rules/psyqa-engineering.mdc`。
- 不新增诊断、开药、停药/换药建议；知识库原文不得改写成医疗建议。

## 接口（关键文件与契约）

- 编排入口：`PsyQA/server/src/services/question/answerOrchestrator.ts`；HTTP 入口：`PsyQA/server/src/controllers/questionController.ts`
- 咨询 Agent：`PsyQA/server/src/services/llm/` 下 `counselAgent.ts`、`reactCounselAgent.ts`、`totCounselAgent.ts`、`coreTaskLoopAgent.ts`
- 模型调用只走 `llmClient.ts`：`callLlmGenerate` / `callLlmGenerateStream`（流式），provider 解析用 `resolveActiveLlmProvider` / `resolveLlmMode`。不要绕过它直接 fetch 模型 API。
- 风险分级：`PsyQA/server/src/services/psych/emotionService.ts`，`RiskLevel = 'low' | 'medium' | 'high' | 'critical'`；`assessRisk(text)` 返回 `RiskAssessment`，高风险响应里带 `hotline` 字段（`CRISIS_HOTLINE` 是模块内常量，不要改号码 `400-161-9995`）。
- 干预框架：`PsyQA/server/src/services/psych/interventionService.ts`，`high`/`critical` 映射到 `safety_plan`。
- 检索：`PsyQA/server/src/services/knowledge/ragService.ts`、`rerankService.ts`。
- ReAct 额外工具 `suggest_micro_training`、`recommend_video`：危机分支禁用。
- 豆包蒸馏数据流：`training_data/distill_doubao/` → `scripts/scrub_doubao_distill.py` → `scripts/merge_scenario_skill_pack.py`。

## 流程

1. 先定位改动落在哪一层：编排（orchestrator/controller）、Agent（counsel/react/tot/coreTaskLoop）、模型调用（llmClient）、风险（emotionService）、检索（rag/rerank）。
2. 涉及风险分支时，先读 `emotionService.ts` 的 `assessRisk` 和各 Agent 的危机分支现状，确认安全路径入口，再改普通路径。
3. 保持流式：首字发出前不得串行等待相似问题扫描和追问生成，这两件事与正文并行或推迟到正文之后。
4. 检索命中的文档 id 必须一路传到知识条目和前端，合并排序不许丢 id。
5. 用户未追问时，不用上一轮话题或旧记忆改写本轮检索词和回答。
6. 改完跑自检 `npm run check`；改了提示词、检索或重排参数再跑 `npm run eval:ragas`（见 rag-eval skill）；场景/干预话术改动优先 `npm run eval:counsel -- --online`（需服务端在跑，默认 `http://127.0.0.1:3001`）。

## 稳定性约束（不变量）

- `high`/`critical` 或规则层命中危机：必须走安全路径，保留求助通道（校内心理中心、身边可信任的人）和 `CRISIS_HOTLINE`；不深入挖掘创伤细节，不让模型自由发挥替代安全路径。
- 风险等级只用 `low | medium | high | critical`，不引入 `risk_red` 等不存在的标识。
- 所有大模型调用走 `llmClient`，回答保持流式。
- TypeScript 严格，不滥用 `any`。

## 异常处理

- LLM 不可用：`isLlmAvailable` / provider fallback 已在 `llmClient` 内处理；不要在 Agent 里再包一层静默重试导致双重调用。
- 检索为空或重排失败：按 `ragService` 现有降级走，不要让空结果崩掉回答流。
- 危机误判担忧：宁可保守走安全路径，不要为减少误报而放宽 `assessRisk` 阈值。
- 改动后评测服务起不来（bge-m3 `8091`、Qdrant `6333`、后端 `3001`）：先启动或如实报告，不伪造指标、不引用旧分数。
