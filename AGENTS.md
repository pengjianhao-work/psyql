# 心理港湾（PsyQA1）

这份说明给 Cursor 和 DeepSeek Harness 共用。应用代码在 `PsyQA/`，工程条目以 `.cursor/rules/psyqa.md` 为准，纠正时写「第 N 条」。

## 技术栈

React（Create React App）前端 + Express / TypeScript 后端，SQLite，Chroma 与 Qdrant，嵌入模型 bge-m3。不是 Next.js、Prisma、PostgreSQL 或 LangGraph。咨询链路在 `PsyQA/server/src/services/llm/` 里的 `counselAgent`、`reactCounselAgent`、`totCounselAgent`。

## 常用命令

在 `PsyQA/` 目录执行：

- 安装依赖：`npm run install:all`。第一次配环境用 `npm run setup`。
- 开发：`npm run dev`，然后打开 http://localhost:3000/login
- 启动前自检：`npm run check`
- 单测：`npm run test`（即 `test:server`，Jest）
- 评测：改了回答提示词、检索或重排参数之后，再跑 `npm run eval:ragas`。脚本是仓库根目录的 `scripts/eval_ragas.py`，由 `D:\Anaconda\python.exe` 执行，需要 bge-m3 服务监听 `8091`、Qdrant 监听 `6333`。只引用这一次跑出来的分数。咨询话术评测用 `npm run eval:counsel`。

演示账号见根目录 `README.md`，不要把密码抄进新文档或对话回复。

## 必须遵守

1. 先 `/architect` 出方案并等人看完，再写代码，然后 `/review`。改了回答提示词或检索、重排参数之后，再 `/eval-run`。
2. 一次新增或改写不超过 300 行。超过就拆成下一步。
3. 不给诊断，不开药，不把知识库原文写成医疗建议。
4. 危机路径不能被普通问答捷径跳过。规则命中危机，或 `risk.level` / `riskLevel` 为 `high`、`critical`，必须走安全路径，引导联系校内心理中心或全国心理援助热线 `400-161-9995`。号码以 `PsyQA/server/src/services/psych/emotionService.ts` 里的 `CRISIS_HOTLINE` 为准，没有官方依据不要改。
5. 首字出来之前，不串行等待相似问题扫描和追问生成。
6. 检索到的文档 id 要传到回答所用的知识条目和界面，合并排序时不许丢掉。
7. 用户没有在追问时，不用上一轮话题回答这轮问题，也不要用旧记忆改写这轮检索词。
8. 界面先看 `PsyQA/client/src/theme.css` 里已有的令牌，不要另起一套配色。
9. 不要把运行时数据提交进 git，例如 `*.db*`、`chroma_data`、`qdrant_data`、`user_history`、账号文件。改完先让人看 diff，不要自行提交，除非对方明确要求。

## 关键路径

- 问答入口与编排：`PsyQA/server/src/controllers/questionController.ts`，`PsyQA/server/src/services/question/answerOrchestrator.ts`
- LLM 客户端：`PsyQA/server/src/services/llm/llmClient.ts`
- 风险等级：`PsyQA/server/src/services/psych/emotionService.ts`（`low | medium | high | critical`）
- 检索与重排：`PsyQA/server/src/services/knowledge/ragService.ts`，`rerankService.ts`
- 前端主题：`PsyQA/client/src/theme.css`
