# 试点发布 Runbook（Phase 7）

面向一个学院/班级的试点上线。本文件与 `PRODUCTION_READINESS.md`、`PSYCH_LOOP_MIGRATION.md` 保持一致。

## 1. 上线前检查

```powershell
cd PsyQA
npm run check          # server tsc + 配置自检
npm run test           # Jest 全套件（当前 205 例：loop/school/session 等）
npm run eval:safety    # 危机路由专项，必须 7/7
npm run eval:loop      # 闭环离线回归（合成 fixture，无 LLM 依赖）
npm run build          # client 构建
npm audit --audit-level=high   # 必须 0 high/critical（当前剩 3 个 moderate qs，上游待修）
```

环境与密钥：`AUTH_SECRET`、`CORS_ORIGIN` 必填（compose 已改为 required，无默认值）。`.env` 不入库。

## 2. 部署

```powershell
cd PsyQA
npm run db:backup      # 先备份 SQLite（输出到 PsyQA/backups/）
docker compose up -d --build   # 镜像不含运行时数据；qdrant/bge 走命名卷
```

启动后：`GET /health` 应毫秒级返回 liveness；`GET /ready` 查看依赖就绪（外部 LLM 不可达时 `llmMode=fallback`，规则兜底仍可服务）。

## 3. 冒烟测试（10 分钟，人工走一遍）

| # | 步骤 | 期望 |
|---|---|---|
| 1 | 学生登录 | 进入对话页，无报错 |
| 2 | 「闭环」tab → 签到（或点"今天跳过"） | 签到写入，跳过也合法 |
| 3 | 定一个一周小目标 + 第一件小事 | 计划激活，行动出现在"今天" |
| 4 | 微行动点 完成/部分/跳过 | 三态都可记，不评判 |
| 5 | "说给陪伴听" 输入普通烦恼 | mode=support，给可选下一步 |
| 6 | 输入危机词（如"想自杀"） | **立即**安全模板：热线 400-161-9995 + 应急卡 + 身边人引导；无计划/练习推荐 |
| 7 | 晚间三行复盘 | 写入成功 |
| 8 | 侧栏"这一周" | 周总结文本，非诊断表述 |
| 9 | 知识问答 | 答案带引用 id，无依据明说"资料里没有" |
| 10 | 教师账号 → /api/school/loop-weather | 仅聚合；<5 人组 metrics=null（抑制） |

## 4. 回滚

- **应用**：`docker compose down && git checkout <上一版本 tag> && docker compose up -d --build`
- **数据**：migration v2/v3 只增不改，回滚旧版本代码不会破坏新表（旧代码忽略新表）。如需回退数据：`npm run db:restore -- backups/<file>.db`（有活动 WAL 时先停服务）。
- **配置**：AUTH_SECRET 变更会使旧会话失效（用户重新登录即可），无数据损失。

## 5. 监控观察点（试点期人工巡检）

- `docker compose logs -f` 中 `http` 日志行：关注 `/api/questions/ask` 与 `/api/loop/*` 的 5xx 与耗时
- `/ready` 的 `llmMode` / `qdrantConnected` / `knowledge.qdrantCount`
- `school_alerts` 表 pending 数（心理中心通道）
- 备份：每日 `npm run db:backup`（建议接计划任务）

## 6. 已知限制（如实对外）

- 外部 LLM（SiliconFlow/GLM）不可达时回答走规则兜底；`/api/loop/companion` 始终为确定性模板，无模型自由发挥
- 本地 Docker build 未验证（daemon 未启动），由 CI docker job 兜底
- `qs` 有 3 个 moderate 漏洞待上游；无 high/critical
- 教师端无个体视图是**特性**而非缺陷：个体预警只走心理中心专业通道
- driftBottle 测试存在随机 flake（pick 随机性），重跑即可，已记录待修

## 7. 不得绕过的人工批准项

历史重写、force-push、删除真实数据、生产密钥轮换、危机热线/伦理策略修改、临床量表使用。
