---
description: 跑评测
---

跑现有的知识库评测，不要改评测题目，也不要改线上回答提示词，除非用户明确要求。

在 `PsyQA` 目录执行 `npm run eval:ragas`。脚本是 `scripts/eval_ragas.py`，解释器是 `D:\Anaconda\python.exe`。默认 8 条、种子沿用脚本里的设置。本机 bge-m3（8091）和 Qdrant（6333）要先在。

跑完只报告这次真实读到的数字：faithfulness、answer relevancy、检索命中。不要编造没跑出来的分数，不要把咨询原文贴进回复。服务没起来或命令失败时，写出失败原因，不要换一套评测。
