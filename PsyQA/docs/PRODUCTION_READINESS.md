# 生产就绪基线报告（PRODUCTION_READINESS）

> 创建：2026-11-23 ｜ 阶段：Phase 0 基线 ｜ 维护：每完成一个阶段更新一次
> 本文只记录**实测**结果；未测到的标 `待测`，被环境挡住的标 `受阻`。

## 1. 基线状态

| 项 | 值 |
|---|---|
| 工作仓库 | `D:\code\PsyQA1`（另一份 `C:\Users\lenovo\Desktop\PsyQA1` 为旧快照，见 §3） |
| 分支 | `feat/deeptutor-workspace`（HEAD `b6f96380`，含本阶段 4 个 WIP 保护提交） |
| 远端 | `origin = github.com/pengjianhao-work/psyql` |
| 已提交 WIP | `c334f1ff` 信号层+人设 / `f554a91a` 日记+漂流瓶 / `b83965cd` 教师气象 / `b6f96380` 分层导航 |
| 未提交（有意排除） | `server/data/accounts.json`、`memory_meta.json`、`intervention_ledgers.json`、`school_notifications.json`、`training_data/fetch_status.json`、`scripts/_tmp_*`、`training_data/` 产物 —— 运行时数据，不提交 |

## 2. 已知问题逐条核实（对任务书第 2 节）

| # | 审计结论 | 核实结果 | 实测值 |
|---|---|---|---|
| 1 | Git pack ≈2.97 GiB | **过期** | `.git` 实测 **17.6 GB**（LFS 历史大对象） |
| 2 | qdrant 6.1G / chroma 618M / server/data 583M / training 3.86G | **属实** | 6136 / 618 / 583 / 3857 MB |
| 3 | `server/data/accounts.json` 被跟踪（74 账号+scrypt） | **属实** | 另有一份种子副本 `server/src/data/accounts.json`，两份都在 git 内 |
| 4 | ~176 未提交变更、删 ci.yml+4 skills | **部分过期** | 该快照对应 **Desktop 副本**（49M/5D/123U）。D:\code 副本 ci.yml 完好、6 个 skill 均在 |
| 5 | 测试 179/180，health.integration 15s 超时 | **根因属实** | `/health` 实测 **200 但耗时 20.2s**——它同步探测 Ollama/Chroma/GLM 等不可达外部服务。集成测试超时是同一根因，非偶发 |
| 6 | vector_documents 32776 行、22322 带 embedding ≈485MB | **基本属实** | 32776 行、22322 带 embedding、**462 MB** |
| 7 | colbert 1024d float16×64tok、quantization null | **属实** | colbert: size=1024, float16, on_disk, max_sim；dense 1024 on_disk；无 quantization_config |
| 8 | load() 每次启动重建稀疏索引+全量 syncToSqlite | **属实** | `knowledge/vectorDBService.ts` L71-86：`load()→sparse.add×N→syncToSqlite()` |
| 9 | compose `AUTH_SECRET` 弱默认值、无 qdrant/bge、镜像含 server/data | **属实** | `AUTH_SECRET:-change-me-in-production-min-16-chars`（会被 env.ts 拒绝）；compose 无 qdrant/bge-m3/bge-reranker 服务；Dockerfile `COPY server/data`、`COPY vector_db` |
| 10 | token 7 天无撤销、ask 无限流、密码≥6 | **属实** | `createApp.ts:181 maxAge:'7d'`；限流仅 `authRateLimiter`（20/15min，在 /auth 上）；`adminAccountService` 校验 `password.length < 6` |
| 11 | 大文件 orchestrator 53KB/StudentApp 50KB/api 47KB | **属实** | 53.6 / 51.2 / 47.5 KB；`services/` 根 **34 个** ≤3 行 shim |
| 12 | CRA、hooks 警告、client 仅 1 测试、CI 仅 main/master+关 eslint | **属实** | `client/src` 仅 `App.test.tsx`；ci.yml 只监听 main/master，client build 带 `DISABLE_ESLINT_PLUGIN` |

## 3. 双工作区事实（重要）

- 两份 checkout 同分支同 HEAD，**功能源码（32 个修改文件）字节级一致**。
- 差异仅在工具配置：`D:\code` 的 `.gitignore` 与 `.cursor/skills/*` 是**更新版**（skill 已扩充契约/流程/不变量；.gitignore 已补 `qdrant_data/`、`user_history`、`logs/`、`*.hf_cache`）。
- Desktop 副本独有的删除（`ci.yml` + 4 个 SKILL.md）判定为**陈旧/非有意**，不采纳。
- 决定：以 `D:\code\PsyQA1` 为唯一工作仓库；Desktop 副本不动、不清理，留待人类决定（风险登记 R6）。

## 4. 实测基线

### 构建/测试（本会话实跑）

| 命令 | 结果 |
|---|---|
| server `tsc --noEmit` | ✅ 干净 |
| client `tsc --noEmit` | ✅ 干净 |
| server jest（本轮全量） | ✅ 31 suites / 138 tests 通过（较早轮）；新增 6 套 51/51 通过 |
| `eval:safety` | ✅ 7/7 |
| `eval:ragas` | ⚠️ **受阻**：`api.siliconflow.cn` 当前断连，脚本在 generate 步崩溃（网络层故障，非代码回归） |

### 体积与性能

| 指标 | 实测 | 目标（DoD） |
|---|---|---|
| `/health` 延迟 | **p100 = 20.2s**（探测外部依赖所致） | p95 < 200ms |
| 后端 RSS（pid 31580） | ~54 MB（暖态） | — |
| 冷启动 | 待测（Phase 3 建基线工具） | < 5s |
| 检索 p95 | 待测 | < 300ms |
| SQLite embedding_json | 462 MB | Phase 3 删除 |
| 依赖审计 `npm audit --omit=dev` | **8 漏洞（1 critical / 5 high / 2 moderate）**，含 qs DoS | 0 high/critical |

### 运行时环境现状

- 端口 3000/3001/6333/8091/8092 可起（`dev:full` 已验证）；当前 `llmMode=fallback`、`llmAvailable=false`（SiliconFlow 不可达，Ollama 无模型）。

## 5. 风险登记表

| ID | 风险 | 等级 | 处理阶段 |
|---|---|---|---|
| R1 | `/health` 同步探测外部服务 → liveness 阻塞、健康检查失真 | ~~高~~ ✅ | **已修复（phase-1a）**：`/health`=缓存探测+400ms 预算；`/ready`=SQLite 探活+快照，`?deep=1` 全量；health.integration 3/3 通过（11.8s，原 15s 超时） |
| R2 | 启动路径 `load()` 全量同步 SQLite + 稀疏重建，阻塞事件循环 | 高 | Phase 3（Qdrant 模式跳过 legacy 加载） |
| R3 | `accounts.json` 在仓内（含哈希）+ README 演示密码 | 中 | **部分修复（phase-1a）**：`server/data/accounts.json` + `src/data` 副本已 untrack（文件保留在磁盘）；历史中的哈希需批准历史重写后清除；README 密码待轮换方案 |
| R4 | 会话 7d 无撤销、ask 无配额、密码≥6 | 高 | Phase 1b/2 |
| R5 | `.git` 17.6GB（历史大对象/LFS） | 中 | Phase 1 出方案；**历史重写需人类批准** |
| R6 | Desktop 陈旧副本可能再次被误编辑，产生分叉 | 中 | 等人类决定是否归档/删除 |
| R7 | SiliconFlow/外部 LLM 单点不可达 → 问答降级 | 中 | Phase 2 超时/熔断 + Phase 4 离线评测 |
| R8 | 依赖漏洞 1 critical + 5 high | ~~高~~ ✅→低 | **已修复（phase-1a）**：`npm audit fix` 后剩 3 个 moderate（qs DoS），0 high/critical；CI 门禁待加 |

> **已验证缺陷修复记录（phase-1a）**：`.gitignore` 的 `server/data/*.json` 规则相对仓库根目录书写，而数据实际在 `PsyQA/server/data/`——规则从未生效（运行时 JSON 一直以 `??` 出现）。已改为 `**/server/data/*.json` 并补 `**/server/src/data/`、`training_data/`、`_tmp_*` 脚本规则。

## 6. 阶段计划与 KPI

- **Phase 0**（本阶段）：CI 确认存在并可用；WIP 已 4 提交保护；本报告 ✅
- **Phase 1**：运行时数据出仓（.gitignore/untrack）、CI 加强（分支/audit/docker）、Docker 拓扑对齐真实依赖
- **Phase 2**：会话 TTL/撤销、ask 限流+配额、密码策略、migration、/health 拆分、安全头、漏洞清零
- **Phase 3**：向量存储收敛到 Qdrant、量化评估、冷启动 <5s、检索 p95 <300ms、缓存版本键
- **Phase 4**：离线可复现评测、安全回归 fixture、前端关键用例
- **Phase 5**：StudentApp/api 拆分、hooks 警告清零、可访问性、bundle 预算
- **Phase 6**：指标/日志、镜像 CI、staging 冒烟、runbook 与文档

## 7. 阻塞与需人类批准

| 事项 | 状态 |
|---|---|
| `gh auth login` 未配置 → 无法 `gh pr create` | **阻塞**：分支可推送，PR 需用户点 compare 链接或授权 gh |
| SiliconFlow 不可达 → eval:ragas / 聊天链路 | **阻塞（外部）**：以 mock/fixture 评测替代并如实标注 |
| Git 历史重写（17.6GB 瘦身） | 待批准 |
| Desktop 旧副本处置 | 待人类决定 |
| 演示密码轮换、热线/伦理策略 | 红线，不动 |
