---
name: rag-eval
description: 在心理港湾里跑 RAGAS 评测：改了回答提示词、检索或重排参数之后使用。
---

# 检索与回答评测

本仓库的评测入口是 `PsyQA/` 下的 `npm run eval:ragas`，脚本在仓库根目录 `scripts/eval_ragas.py`，由 `D:\Anaconda\python.exe` 执行。

## 何时跑

只在改了回答提示词、检索或重排参数之后跑。没改这些就不要跑，也不要引用旧分数充数。

## 前置条件

- bge-m3 服务监听 `8091`（需要时在 `PsyQA/` 下执行 `npm run start:bge-m3`）
- Qdrant 监听 `6333`（需要时执行 `npm run start:qdrant`）

缺服务时先启动或报告，不要伪造指标。

## 怎么跑

```bash
cd PsyQA
npm run eval:ragas
```

只引用这一次输出的分数。若还要看咨询话术，再跑 `npm run eval:counsel`。
