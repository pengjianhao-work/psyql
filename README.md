# 心理港湾（PsyQA）

面向高校学生的心理支持平台：自由倾诉对话 + DeepTutor 式「心理闭环」结构化陪伴 + 教师端聚合看板。

## 功能概览

**学生端**
- 心理闭环工作区（「闭环」tab）：每日签到（可跳过）、周计划与微行动（done/partial/skipped 三态不评判）、晚间三行复盘、周总结快照、用户自写安全预案卡
- 陪伴对话：`POST /api/loop/companion` 每轮先跑 `safety_check`，命中 high/critical 立即返回固定安全模板（含热线与用户应急卡），不做普通闭环操作
- 自由对话三模式（答疑解惑 / 心理疏导 / 行为指导），RAG 强引用溯源
- 情绪记录、训练模块、漂流瓶等既有功能

**教师端**
- `/api/school/loop-weather`：院系级闭环使用聚合，**k-匿名（<5 人组指标抑制、并入 merged-small 兜底组）**，纯计数无个体数据

**平台加固**
- `/health` 存活探针（缓存 + 硬预算）与 `/ready` 就绪探针分离
- 会话撤销（jti + revoked_sessions）、`/ask` 限流、schema 版本化迁移、`db:backup`/`db:restore`
- 安全 headers + CSP，CI 含 npm audit 门禁与 Docker 构建

## 技术栈

React（Create React App）前端 · Express + TypeScript 后端 · SQLite（better-sqlite3，WAL）· Qdrant + bge-m3 向量检索 · GLM / Ollama 双 LLM（故障自动回落规则兜底）· Docker 多阶段镜像。

## 快速开始

```bash
cd PsyQA
npm run install:all   # 首次；或 npm run setup 全流程初始化
npm run dev           # 前后端并行，打开 http://localhost:3000/login
```

```bash
npm run check         # 启动前自检
npm run test          # Jest 单测（server）
npm run db:backup     # SQLite 在线备份到 backups/
npm run db:restore    # 恢复（活动 WAL 时拒绝覆盖）
```

## Docker

```bash
cd PsyQA
docker build -t psyqa .
docker compose up -d  # 需先配置 .env（见 .env.example）
```

`AUTH_SECRET`、`CORS_ORIGIN` 为生产必填；SQLite / 账号 / 向量库等运行时数据不进镜像，由卷或环境注入。镜像内健康检查走 `/health`。

## 安全设计（红线）

- 风险分级固定 `low | medium | high | critical`；规则命中危机或 high/critical 必走安全路径
- 全国心理援助热线 `400-161-9995`，单一出处 `server/src/services/psych/emotionService.ts`
- 不做精神疾病诊断，不建议停药/换药/开药；辅助支持不替代专业咨询
- 高风险时不深挖创伤，不让模型自由发挥替代安全模板
- 闭环工具层在高风险下全部阻断（`loopAgentTools`），`update_memory` 需用户确认

## 评测

```bash
npm run eval:safety   # 危机路由回归（离线，7/7）
npm run eval:loop     # 闭环 7 天合成重放（离线）
npm run eval:ragas    # RAG 评测（需 bge-m3 :8091 + Qdrant :6333 + 可用 LLM）
npm run eval:counsel  # 咨询话术评测
```

## 文档（PsyQA/docs/）

| 文档 | 说明 |
|------|------|
| [PSYCH_LOOP_MIGRATION.md](PsyQA/docs/PSYCH_LOOP_MIGRATION.md) | 心理闭环迁移决策与阶段记录 |
| [PRODUCTION_READINESS.md](PsyQA/docs/PRODUCTION_READINESS.md) | 生产就绪基线与风险登记 |
| [PILOT_RELEASE.md](PsyQA/docs/PILOT_RELEASE.md) | 试点发布 runbook 与冒烟清单 |
| [安装与运行.md](PsyQA/docs/安装与运行.md) | 环境配置 |
| [作品使用与演示说明.md](PsyQA/docs/作品使用与演示说明.md) | 演示流程 |

## 目录结构

```
PsyQA1/
├── PsyQA/                  # Web 应用
│   ├── client/             # React 学生端 & 学校端
│   ├── server/             # Express API
│   │   └── src/services/loop/   # 闭环：checkin/plan/reflection/agentTools/runtime/orchestrator
│   ├── scripts/            # db:backup / db:restore
│   └── docs/               # 全部文档
├── scripts/                # 模型训练与评测脚本（可选）
├── vector_db/              # 向量检索数据
└── data/                   # 原始数据集
```

## 演示账号

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 学生 | demo | demo123 |
| 辅导员 | counselor | counselor123 |
| 管理员 | admin | admin123 |

## 声明

本系统为教学展示原型，提供心理支持参考，不能替代专业心理咨询或医疗诊断。如有紧急心理危机，请拨打全国心理援助热线 **400-161-9995** 或联系当地专业机构。
