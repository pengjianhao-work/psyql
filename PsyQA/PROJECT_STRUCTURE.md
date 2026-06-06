# PsyQA 项目结构说明

> 更新：2026-06 · 与当前仓库一致

## 根目录

```
PsyQA/
├── client/              React 前端（端口 3000）
├── server/              Express 后端（端口 3001）
├── docs/                文档（见 docs/README.md）
├── scripts/             安装、启动、数据处理脚本
├── vector_db/           本地向量 JSON（documents.json）
├── dist/                编译产物（git 忽略）
├── .env.example         环境变量模板
├── package.json         根 npm 脚本
├── README.md            项目入口
├── DEPLOYMENT.md        部署指南
└── 一键*.bat            根目录快捷入口（转发到 scripts/）
```

根目录 `.bat` 为**快捷方式**，实际逻辑在 `scripts/`（例如 `一键启动.bat` → `scripts/一键启动.bat`）。

## 前端 `client/src/`

```
client/src/
├── api/index.ts         全部 REST API 封装
├── student/             学生端（StudentApp）
├── school/              学校端（看板、告警、用户管理）
├── pages/               LoginPage
├── components/          共用 UI 组件
│   ├── charts/          报告可视化（雷达、环形、权重等）
│   ├── AgentProfileCard.tsx   专属 Agent 档案
│   ├── RagWeightBar.tsx       动态 RAG 权重条
│   ├── ReportPanel.tsx
│   └── ...
├── types/               TypeScript 类型
└── utils/               格式化、历史、导出等工具
```

## 后端 `server/src/`

```
server/src/
├── server.ts            入口
├── createApp.ts         Express 应用、/health
├── routes/              auth · question · school
├── controllers/         HTTP 处理器
├── middleware/          认证、限流
├── db/                  SQLite、迁移、各 Store
├── types/               共享类型
└── services/            业务逻辑（按领域分子目录）
    ├── psych/           情绪、风险、统计、融合引擎
    ├── llm/             智谱、Ollama、llmClient
    ├── knowledge/       RAG、Chroma、嵌入、调度
    ├── user/            账号、画像、记忆、Agent 总结
    │   ├── userMemoryService.ts
    │   ├── ragWeightPolicy.ts
    │   └── userAgentSummaryService.ts
    ├── school/          院系、告警、报表
    ├── question/        问答编排 answerOrchestrator
    └── common/          历史、报告队列、种子数据
```

`services/*.ts` 根目录下多为**兼容 re-export**（如 `userMemoryService.ts` → `./user/userMemoryService`），新代码请直接引用子目录路径。

## 数据与存储

| 路径 | 说明 |
|------|------|
| `server/data/psyqa.db` | SQLite（账号、对话、告警、Agent 画像） |
| `server/data/mental_dataset.json` | 心理知识库 |
| `vector_db/documents.json` | 本地向量索引 |
| Chroma `psyqa_knowledge` | 公共 RAG 集合 |
| Chroma `user_{uid}` | 每用户私有对话记忆 |

## npm 脚本分类

| 类别 | 命令示例 |
|------|----------|
| 开发 | `dev` · `free:ports` · `test:server` |
| 构建 | `build` · `build:embeddings` |
| Chroma | `start:chroma` · `sync:chroma:stored` |
| 专属 Agent | `chat:save_emb` · `user:feature_summary` · `user:annual_report` |
| 知识库 | `pipeline:data:rag` · `expand:knowledge` · `reload:knowledge` |
| 安装 | `setup` · `setup:fast` · `install:all` |

完整列表见根目录 `package.json`。

## 测试

```
server/src/__tests__/     Jest 单元与集成测试
npm run test:server
```
