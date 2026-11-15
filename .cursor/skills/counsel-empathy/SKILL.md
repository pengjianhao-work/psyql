---
name: counsel-empathy
description: 心理港湾回答链路的情绪理解规范：改共情块、建议块、话术库、干预框架、LLM prompt 的情绪相关部分时使用。涉及 answerOrchestrator 的 prompt 结构、interventionService 的开场/结尾/structureHint、情绪细读脚手架、共情粒度要求时必读。目标是让回答先"细读"用户情绪再开口，而不是模板化安慰。
---

# counsel-empathy — 回答链路与情绪理解检查点

## 定位

本 skill 描述**一轮回答从进来到出去的完整链路**，并在每个环节标注「情绪理解要做到什么粒度」。改链路任何一环前先对照本表，确认没有破坏情绪理解的递进关系。

与其他 skill 的分工：
- `counsel-agent`：Agent/工具/路由的工程契约
- `safety-review`：安全路径改动红线
- `rag-eval` / `model-eval`：评测怎么跑
- 本 skill：**回答内容本身的情绪质量**

## 回答链路总览

```
用户输入
  → 规则判定（emotionService：情绪/风险/问题/意图）
  → 干预框架选择（interventionService：framework + 开场/结尾 + 话术库）
  → 背景注入（counselSkills 决定 wiki/trend/web/记忆谁能进）
  → LLM 生成（answerOrchestrator prompt：情绪细读 → 共情块 → 建议块）
  → 后处理（normalizeAnswerStructure / normalizeBulletLines / sanitizer）
  → 安全兜底（risk 融合后二次守卫 + ETHICS_FOOTER）
```

## 各环节检查点

### 1. 规则判定（emotionService）

- **输入**：原始问句 + 补充描述
- **守卫**：crisis 关键词、risk.level high/critical → 后续全部走安全路径
- **情绪粒度**：只到「情绪类别 + 强度 + 关键词」，不做深层解读——深层解读留给 LLM
- **红线**：这里判错会级联到所有下游；宁可误判保守，不可漏判危机

### 2. 干预框架（interventionService）

- **输入**：emotion + problem.category + risk
- **守卫**：high/critical → SAFETY_PLAN，直接返回，不进表格
- **情绪粒度**：frameworkName 告诉模型「这类问题的主诉情绪是什么」；`actionScripts` 提供可直接改写的话术
- **注意**：openingPhrase/closingPhrase 是定稿话术，不要在 prompt 里再让模型自由发挥替代

### 3. 背景注入（counselSkills + orchestrator）

- **输入**：riskLevel + intentKind + category + freshInfo
- **守卫**：`isSafetyContext` 为 true 时 wiki/trend/web 全部不注入；web 还要 `needsFreshWebSearch` 命中
- **情绪粒度**：注入的背景只用于「组织思路」，prompt 里明确要求不要复述、不要改变共情方向
- **红线**：背景里的情绪色彩不能盖过用户原话的情绪

### 4. LLM 生成（answerOrchestrator prompt）

- **输入**：systemPrompt + agentContext + 记忆 + 情绪分析 + framework + 话术库 + 知识/背景 + 【情绪细读】+ answerShape
- **守卫**：crisis answerShape 禁止步骤清单和长篇分析；非危机才有【情绪细读】块
- **情绪粒度（核心）**：
  - **情绪细读**（prompt 内部完成，不写进回答）：① 情绪粒度——用户说的词背后更准确的词（「烦」可能是委屈、「不想上课」可能是无力/羞耻）；② 潜在需求——用户想被看见/被回应的是什么；③ 奖励自检——好回答因「说出没说出口的感受」被奖励，因「跳过情绪给方法」「模板化安慰」被惩罚
  - **共情块**：优先使用用户没说出口的更准确情绪词，并说明为什么这样理解（「听起来你不是懒，是被『必须优秀』的期待压住了」）
  - **建议块**：3–5 条具体建议，允许 1 条可直接使用的话术
- **红线**：不诊断、不编造记忆里没有的事实、不以复述原话开头

### 5. 后处理

- **输入**：LLM 原始输出
- **守卫**：`normalizeAnswerStructure` 删除「3 个小步骤」「参考建议 N」等违规板块；`MAX_ANSWER_CHARS=900` 截断
- **情绪粒度**：后处理只删结构不删情绪内容；如果发现它误删了合法的话术块，改 regex 而不是绕过

### 6. 安全兜底

- **输入**：融合后的 risk.level + intent.kind
- **守卫**：`isSafetyContext` 二次判定；`ETHICS_FOOTER` 固定附加
- **情绪粒度**：高风险时情绪细读让位于安全确认（「你现在安全吗」优先于「我理解你的委屈」）

## 改 prompt 的注意事项

- **加内容优先加在【情绪细读】和共情块**，不要动安全约束和篇幅上限
- 情绪细读是「内部完成」，不要让模型把三步分析写进回答正文
- crisis answerShape 里**不要出现**情绪细读块——安全路径不需要它
- 改完必须跑 `eval:ragas`（提示词变了）+ `eval:counsel --online`（话术倾向变了），引用本次分数

## 评测时看什么

- 共情块有没有出现「用户没说出口的感受」这类细读产出
- 有没有从「情绪」跳到「方法」的断层
- 有没有模板化安慰（「我理解你的感受」式空话）
- 危机题是否仍走安全路径、不受新 prompt 影响
