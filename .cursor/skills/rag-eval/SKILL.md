---
name: rag-eval
description: 在心理港湾里跑 RAGAS 检索/回答评测、咨询话术评测或安全路由检查：改了回答提示词、检索、重排参数或危机分支之后使用。
---

# 检索与回答评测

## 边界

- 本 skill 只管评测怎么跑、何时跑、分数怎么引用。
- 评测脚本本身的实现不在此列；改 `scripts/eval_*.py` 或 `run_eval_ragas.js` 时按普通代码改。
- 没改触发条件（见下）就不要跑评测，也不要拿历史分数充数。

## 接口（命令与前置条件）

- `npm run eval:ragas`（在 `PsyQA/` 下）→ `node ../scripts/run_eval_ragas.js`，底层是仓库根目录 `scripts/eval_ragas.py`，由 `D:\Anaconda\python.exe` 执行。
- `npm run eval:counsel` → `python ../scripts/eval_counsel.py`；参数：`--online`（在线抽题，需后端在跑，默认 `http://127.0.0.1:3001`）、`--corpus-limit`（默认 200）、`--base-url`、`--timeout`（默认 120）。不加 `--online` 只跑离线语料基线。
- `npm run eval:safety` → `ts-node server/scripts/check-safety-routing.ts`，检查危机路由是否被普通问答捷径跳过；改危机分支后建议加跑。
- 外部依赖：bge-m3 监听 `8091`（`npm run start:bge-m3`）、Qdrant 监听 `6333`（`npm run start:qdrant`）、reranker 按需 `npm run start:bge-rerank`。

## 何时跑（触发条件）

- 改了回答提示词、检索或重排参数 → 必须 `npm run eval:ragas`。
- 改了场景话术、干预或咨询 Agent 行为 → `npm run eval:counsel`，在线验证加 `--online`。
- 改了危机/风险分支 → `npm run eval:safety`。
- 只引用这一次跑出来的分数；旧分数一律作废。

## 流程

1. 确认改动属于上述触发条件；不属于就跳过。
2. 检查依赖服务：`8091`（bge-m3）、`6333`（Qdrant）；`eval:counsel --online` 还需要后端 `3001` 在跑。
3. 缺服务先启动（`npm run start:bge-m3` / `start:qdrant`），起不来就如实报告卡在哪个端口。
4. 在 `PsyQA/` 下执行对应 `npm run eval:*`。
5. 报告分数时写清：跑的是哪条命令、本次输出的具体数值、与上一次的差异（如果有上一次可比记录）。

## 异常处理

- 服务未起：先启动；仍失败则报告缺哪个服务及报错原文，不伪造指标。
- 评测脚本报错（环境、依赖、超时）：贴原始报错，定位是脚本问题还是环境问题，不要改脚本掩盖问题。
- `eval:counsel --online` 连不上 `3001`：先确认后端已启动再重试；不要把离线分数当在线结果报。
- 分数明显劣化：先怀疑提示词/检索改动本身，回滚或调整后重跑，不要解释性引用。
