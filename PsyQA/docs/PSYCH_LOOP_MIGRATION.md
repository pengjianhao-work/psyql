# 心理闭环迁移决策记录（PSYCH_LOOP_MIGRATION）

> 创建：2026-11-23 ｜ 状态：Phase 0 决策稿 ｜ 维护：每阶段更新
> 姊妹文档：`PRODUCTION_READINESS.md`（工程基线与风险登记）

## 1. 产品决策

### 1.1 目标用户与试点

- **目标用户**：高校学生。先做**单学院/单班级试点**（orgId 分组能力已存在）。
- **角色**：`student`（闭环主体）、`teacher`（聚合只读，已落地）、`counselor`/`admin`（心理中心专业通道，已存在）。

### 1.2 「心理陪伴」vs「心理闭环」边界

| | 心理陪伴（现状） | 心理闭环（目标） |
|---|---|---|
| 形态 | 开放式对话，想聊就聊 | 可完成、可回看、可调整的结构化链路 |
| 状态 | 会话级 | 跨天/跨周持续状态（计划、行动、复盘） |
| AI 角色 | 回应者 | 理解者 + 计划协作者 |
| 成功标准 | 聊得舒服 | 学生能说清「这周做了什么、什么有用、下周怎么调」 |

两者**共存不互斥**：聊天是入口和自由层，闭环是结构化轨道。任何时刻命中高风险 → 闭环暂停，走安全路径，恢复后闭环继续。

### 1.3 闭环七环节 → 现有能力映射

| 环节 | 现状 | 差距 |
|---|---|---|
| ① 签到/表达 | `mood_checkins`（单一心情词+限次） | 扩为 `wellbeing_checkins`：心情/压力/睡眠/能量/一件事的简短记录，可跳过不强迫 |
| ② 非诊断理解 | `companion`/`guided` 模式 + 共情链路 | 加「复述确认」输出结构，禁诊断标签（已有红线约束） |
| ③ 支持计划 | `wellness_tasks` + task-board API | 升级为 `support_plans`（周主目标）+ `plan_actions`（每日 1–3 微行动），计划由对话/复盘生成与调整 |
| ④ 每日行动 | `wellness_tasks.completed` + `training_sessions`（微训练） | 统一 `practice_logs`：完成/部分完成/跳过都记录不评判 |
| ⑤ 复盘 | `user_journals`（自由日记） | 新增 `reflections`：晚间三行 + 周复盘结构化模板；周总结可保存/导出 |
| ⑥ 计划调整与记忆 | L1/L2/L3 记忆 + `user_facts`（可编辑/删除）+ `collectUserSignals` | 记忆写入**只收用户确认过**的偏好/有效方法；复盘结论驱动 `adjust_plan` |
| ⑦ 危机插曲 | `assessRisk` + safety path + `school_alerts` + 热线锁定 | 新增 `safety_plans`：用户预写「难受时联系谁/做什么」，危机时优先呈现 |

### 1.4 首批 6 个核心模式（其余分期）

| 模式 | 对应 DeepTutor | 实现基础 |
|---|---|---|
| 倾诉 | Chat | `companion` 模式（已有） |
| 签到 | — | mood checkin 扩展（已有 UI 卡） |
| 计划 | Learning plan | task-board 演化（已有 API） |
| 微行动 | Practice | wellness_tasks + training_sessions（已有） |
| 复盘 | Review | 新增 reflections（复用 journal 面板壳） |
| 知识问答 | Ask | `insight`/`reading` + wiki 引用链（已有 `wiki_documents`、`/wiki/:slug`、`WikiReaderModal`） |

后排：主题探索（Research）、趋势可视化（Visualize）、技能课（Course）、成长路径（Mastery）、自助阅读（Immersive）。不一次铺满。

## 2. 信息架构（目标态）

学生端从现有「对话/记录/漂流瓶」三页演进为**三栏工作区**（桌面）/底 tab（移动）：

```
左栏 · 我的旅程      中栏 · 工作面               右栏 · 镜子
本周计划+今日微行动   按模式切换：               情绪/行动趋势
成长路径             倾诉 | 签到 | 计划 |         今日复盘入口
                    微行动 | 复盘 | 知识问答      知识引用
漂流瓶归入「互助」区   + 日记/阅读沉浸态           记忆管理（可编辑/删除）
                                              安全计划卡
```

教师端维持现状：Dashboard + 气象 + 热力图，k<5 抑制，无个体数据。

## 3. 数据模型

**复用**：`mood_checkins`、`wellness_tasks`、`training_sessions`、`user_facts`、`user_journals`、`user_agent_profile`、`dialogs`、`wiki_documents`、`drift_bottles`。

**新增**（Phase 2，版本化 migration）：

- `wellbeing_checkins`（user_id, mood, stress_1_5, sleep_h, energy_1_5, event_text, skipped, created_at）
- `support_plans`（id, user_id, week_of, goal_text, status, source, created_at, updated_at）
- `plan_actions`（id, plan_id, day, action_text, status[done/partial/skipped], done_at）
- `practice_logs`（id, user_id, kind, ref_id, outcome, logged_at）
- `reflections`（id, user_id, scope[evening|weekly], line1..3/helped/not_helped, adjust_note, created_at）
- `progress_snapshots`（id, user_id, period, metrics_json, created_at）
- `safety_plans`（id, user_id, contacts_json, coping_json, warning_signs_json, updated_at）
- `resource_items`（id, kind[skill|selfhelp|campus], title, body, source_ref, active）

## 4. Agent 工具面（Phase 3，已落地 `services/loop/`）

统一 runtime 按模式路由，工具：`search_psych_knowledge`（带引用 id）、`get_recent_signals`（复用 `collectUserSignals`）、`create_support_plan`/`adjust_plan`、`log_micro_action`/`log_reflection`、`suggest_practice`、`safety_check`、`update_memory`（**仅用户确认项**）。约束：最大步数+超时+成本上限；先理解再建议；一次只问一个关键问题。

**已实现**（`psych-loop/phase2-domain-model` 分支）：

- `loopAgentTools.ts`：9 个工具的确定性执行器 `executeLoopTool(userId, name, input, ctx)`。`ctx.riskLevel` 为 high/critical 时除 `safety_check` 外全部 `blocked`——高风险不可能进入计划/练习/记忆写入；`update_memory` 必须 `confirmed:true` 才写 `user_facts`（confidence=high）；`log_micro_action` 既标记计划内行动（服务内做归属校验）也写自由练习 `practice_logs`。
- `loopRuntime.ts`：`runLoopTurn` 有界执行器。`safety_check` 恒为第一步且不可跳过；high/critical 返回固定安全模板（热线来自 `assessRisk().hotline` + 用户自写 `safety_plan` 的联系人/应对项），不深入创伤细节；普通路径按时间预算（3s）顺序跑 signals→plan→practice，`LOOP_MAX_STEPS=5`。
- `POST /api/loop/companion`：student-only + 自助断言，body `{text}` → `LoopTurnResult`。
- 决策：暂**不**把 loop 工具注入 ReAct 的 `COUNSEL_TOOL_DEFS`——那会改 system prompt，而 `eval:ragas` 依赖的 SiliconFlow 当前不可达；待评测恢复再考虑合并。

**验证**：`loopAgentTools.test.ts` 6 例（危机阻断、确认门禁、越权拒绝、practice_logs 落库、runLoopTurn 双路径）；`eval:safety` 7/7 路由正确；`tsc` 干净。

## 5. 隐私与伦理边界

- 教师端：仅聚合；k<5 抑制（已实现）；个体预警只走 counselor/admin 通道。
- 记忆：全部可见/可编辑/可删除；不存未经确认的敏感推断；`held` 漂流瓶不入池不回显。
- 人设：锁安全边界行恒在，危机时安全路径优先（已实现）。
- 反依赖：无连续打卡惩罚、无焦虑提醒、无疗效宣称；文案统一「自我觉察/非诊断」。
- 红线沿用 `.cursor/rules/psyqa-ethics.mdc`：不诊断/不开药/热线 `400-161-9995` 唯一来源 `emotionService.ts`。

## 6. WIP 保护现状（Phase 0 已完成项）

- 全部功能 WIP 已按主题分 4 commit 落盘并推送 `feat/deeptutor-workspace`：`c334f1ff`/`f554a91a`/`b83965cd`/`b6f96380`；运行时数据有意排除。
- 备份快照：`%TEMP%\wip_Dcode.diff`、`%TEMP%\wip_desktop.diff`。
- Desktop 旧副本 `C:\Users\lenovo\Desktop\PsyQA1` 为陈旧分叉，待人类决定处置（见 PRODUCTION_READINESS §3/R6）。
- CI `.github/workflows/ci.yml` 在 D:\code 完好（main/master 触发）；health 集成测试超时根因 = `/health` 同步探测外部依赖 20.2s（Phase 1 拆 liveness/ready 修复）。

## 7. 阶段计划（对齐任务书 Phase 0–7）

| 阶段 | 主题 | 关键产出 |
|---|---|---|
| P0 | 决策+基线+WIP | 本文档、PRODUCTION_READINESS、CI 绿 |
| P1 | 平台加固 | 数据出仓、会话/限流/migration/备份、Docker 对齐、漏洞清零 |
| P2 | 心理域模型+知识库 ✅ | §3 新表 + resource_items + 信号接入蒸馏 |
| P3 | Agent 与安全 ✅ | §4 工具层 + runLoopTurn 安全门禁 + 回归 20/20 |
| P4 | 闭环编排 ✅ | /loop/today + /loop/summary + progress_snapshots + 计划收口 |
| P5 | 工作区 UI | 三栏布局、拆 StudentApp、移动+无障碍 |
| P6 | 教师端与评测 | 聚合看板增强、离线评测、试点报告 |
| P7 | 生产化与试点 | 安全/性能/可观测/冒烟/runbook |

## 8. KPI

- 试点学生 7 天闭环完成率（≥1 人走完全链路为验收下限）
- 周计划调整率、微行动完成/部分完成分布、复盘条目深度
- 知识问答引用命中率（无依据必须明说，不编造）
- 危机路由回归 100%；高风险内容 0 进入普通任务推荐
- 工程 KPI 沿用 PRODUCTION_READINESS §6（冷启动/检索/health/漏洞）

## 9. 待人类确认

1. Desktop 旧副本处置（归档 or 删除）
2. `gh auth` 授权或手动点 compare 链接建 PR
3. 试点 orgId/班级名单确定
4. Git 历史重写（17.6GB 瘦身）批准与否
5. `safety_plans` 中是否允许用户填写校内联系人（涉及真实号码录入的校验口径）
