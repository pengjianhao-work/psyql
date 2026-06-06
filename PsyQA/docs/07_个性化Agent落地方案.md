# 07 · 两年长效个性化心理 Agent 落地方案

> 基于 PsyQA + Chroma + 智谱 LLM，**不重构主架构**，在原有栈上增量扩展。  
> 详细系统说明见 [系统说明文档.md](./系统说明文档.md) §2.5。

---

## 1. 功能概览

| 能力 | 说明 |
|------|------|
| 结构化画像 | 基础属性、情绪时序、干预偏好、月度/年度摘要 |
| 私有记忆 | 每用户独立 Chroma 集合 `user_{uid}` |
| 混合 RAG | 私有记忆 + 公共知识库 `psyqa_knowledge` 动态加权检索 |
| 动态权重 | 按咨询时长连续插值 + 记忆条数加成（见 §3） |
| Prompt 注入 | 每次对话自动拼装专属档案与人设 |
| 前端档案卡 | 侧边栏「专属 Agent 档案」：权重可视化、编辑、导出 |
| 定时任务 | 补向量 / 月度总结 / 年度报告 |

---

## 2. 架构与数据流

```
学生咨询
  ├─ answerOrchestrator
  │    ├─ searchBlendedUserMemory()  ← 动态 RAG 权重
  │    ├─ buildAgentPromptContext() ← 专属 Prompt
  │    └─ 智谱/Ollama 生成回复
  └─ indexUserDialogMemory()        ← 异步写入 Chroma + SQLite 元数据

定时任务
  ├─ chat:save_emb          补全历史向量
  ├─ user:feature_summary   月度 LLM 摘要 → 画像
  └─ user:annual_report     年度档案 → mature 阶段写入 agent_system_prompt
```

### 2.1 数据分层

| 存储 | 内容 |
|------|------|
| `user_agent_profile` | 基础属性、情绪时序、干预偏好、摘要、专属 System Prompt |
| `user_dialog_vectors` | 对话向量元数据（与 Chroma 对齐） |
| Chroma `psyqa_knowledge` | 公共心理知识 RAG |
| Chroma `user_{uid}` | 该用户全部对话向量 + metadata(month/emotion/trigger) |

### 2.2 关键源码

| 模块 | 路径 |
|------|------|
| 权重策略 | `server/src/services/user/ragWeightPolicy.ts` |
| 记忆与 RAG | `server/src/services/user/userMemoryService.ts` |
| 月度/年度总结 | `server/src/services/user/userAgentSummaryService.ts` |
| API | `server/src/controllers/agentController.ts` |
| 前端档案卡 | `client/src/components/AgentProfileCard.tsx` |
| 权重可视化 | `client/src/components/RagWeightBar.tsx` |

---

## 3. 动态 RAG 权重

阶段标签分三期（collect / shape / mature），**实际权重按时间轴连续变化**：

| 锚点月数 | 私有权重 | 阶段标签 |
|----------|----------|----------|
| 0 | 30% | collect |
| 6 | 45% | collect→shape |
| 18 | 70% | shape→mature |
| 24+ | 85% | mature |

**记忆密度加成**（与 time 权重相加，上限 92%）：

| 已向量化对话数 | 加成 |
|----------------|------|
| ≥5 | +1.5% |
| ≥20 | +3% |
| ≥50 | +5% |

核心函数：`computeTimelineUserWeight()` · `computeMemoryBoost()` · `getRagBlendWeights()`

---

## 4. API

### 学生端

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/questions/agent-profile?userId=` | 画像 + phase + ragWeights |
| PATCH | `/api/questions/agent-profile` | 更新 basic / intervention / agentSystemPrompt |
| GET | `/api/questions/agent-profile/export?userId=` | 下载 JSON 配置包 |

**PATCH 示例**

```json
{
  "userId": "demo",
  "basic": { "age": 22, "occupation": "大学生" },
  "intervention": {
    "preferredTone": "gentle",
    "sensitiveTopics": ["父母指责"],
    "avoidPhrases": ["你应该"]
  }
}
```

**ragWeights 响应字段**

```json
{
  "user": 0.375,
  "public": 0.625,
  "phase": "collect",
  "label": "特征采集期（0-6月）",
  "monthsElapsed": 3,
  "memoryCount": 12,
  "timelineUser": 0.36,
  "memoryBoost": 0.015
}
```

### 管理端

| GET | `/api/questions/admin/agent-profile?userId=demo` |

---

## 5. 环境变量

```env
PSYQA_CHROMA_ENABLED=1
CHROMA_URL=http://localhost:8000
CHROMA_PUBLIC_COLLECTION=psyqa_knowledge
ZHIPU_API_KEY=...          # 月度/年度 LLM 总结
PSYQA_LLM_PROVIDER=zhipu
```

---

## 6. npm 定时任务

```bash
# 每日：补全未向量化的历史对话
npm run chat:save_emb
npm run chat:save_emb -- --user=demo --limit=500

# 每月：LLM 总结上月心理特征
npm run user:feature_summary
npm run user:feature_summary -- --month=2026-05

# 每年：年度档案；mature 用户写入 agent_system_prompt
npm run user:annual_report
npm run user:annual_report -- --year=2025
```

---

## 7. 清除与导出

- **清空历史** `POST /api/questions/history/clear`：同步删除对话、`user_agent_profile`、`user_dialog_vectors` 及 Chroma `user_{uid}` 集合。
- **导出配置包**：前端「导出配置包」或 GET export 接口，含画像 JSON + ragWeights + chromaCollection 名（向量本体在 Chroma 中需单独备份）。

---

## 8. 演示技巧（不必真等 2 年）

1. 用 `demo` 账号咨询若干次，观察权重条与 memoryCount 上升。
2. 将 `user_agent_profile.first_dialog_at` 改为 20 个月前 → 进入 mature 阶段。
3. 运行 `npm run user:annual_report -- --user=demo` 生成专属人设。
4. 再发咨询，对比 Prompt 中【专属Agent人设】与 85% 级私有权重。

---

## 9. 与短期画像的关系

| 表/模块 | 周期 | 用途 |
|---------|------|------|
| `user_profile` / UserProfileCard | 0–3 月可见 | 会话统计、反馈聚合 |
| `user_agent_profile` / AgentProfileCard | 24 月长效 | 专属 Agent 人格与记忆 |

两者并行：短期看反馈与次数，长期看专属 Agent 成型进度。

---

## 10. 待办

- [ ] Windows 计划任务一键注册脚本（每日/每月/每年）
- [ ] Chroma 用户集合批量备份 CLI
