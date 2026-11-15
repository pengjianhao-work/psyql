---
name: model-eval
description: 心理港湾第二模型/模型路由/LoRA 微调相关工作时使用：改模型选择、模型路由、模型评测、蒸馏或微调流程时必读。涉及 llmClient、zhipuClient、ollamaClient、train_lora、eval:counsel、eval50 对比评测、模型环境变量时使用。
---

# model-eval — 第二模型与评测规范

## 边界

- 本 skill 管「用哪个模型、怎么评模型、微调怎么验证」；改咨询话术本身走 `counsel-agent`，改检索评测走 `rag-eval`。
- 不编造评测分数；只引用实际跑出来的报告文件。
- 不把 API key 写进代码或文档；模型配置走 `.env`。

## 当前模型架构

| 层 | 位置 | 说明 |
|---|---|---|
| 主答 LLM | `server/src/services/llm/llmClient.ts` | `PSYQA_LLM_PROVIDER=auto` 时智谱优先、Ollama 备选 |
| 智谱客户端 | `server/src/services/llm/zhipuClient.ts` | `ZHIPU_API_URL`（默认 SiliconFlow 兼容端点）、`ZHIPU_MODEL` 或 `SILICONFLOW_MODEL` |
| Ollama 客户端 | `server/src/services/llm/ollamaClient.ts` | `OLLAMA_API_URL`、`OLLAMA_MODEL` |
| 离线生成 | `server/scripts/build-llm-wiki.ts` | Wiki 生成用 Qwen2.5-72B via SiliconFlow |
| 评审 judge | `scripts/_tmp_judge_eval50.py` | DeepSeek-V3.2 via `ZHIPU_API_URL`，`EVAL_JUDGE_MODEL` 可换 |

## 模型路由（规划中，改动前先确认方案）

如果要做按 intent/risk 分流：

- crisis/high/critical → 最强模型 + 安全路径，**不允许**为了省成本降级
- 普通倾诉 → 快模型即可
- fresh-info（`needsFreshWebSearch` 命中）→ 需要联网上下文的模型
- 路由决策必须在规则层（确定性），不能让模型自己决定走哪条安全路径

## 评测命令

```powershell
cd PsyQA
npm run eval:counsel -- --online          # 需后端 :3001，含危机样本
npm run eval:safety                        # 危机路由检查（改安全分支必跑）
npm run eval:ragas                         # 改提示词/检索/重排必跑
python ../scripts/eval_counsel.py --help   # 评测脚本参数
```

50 题对比评测资产（`training_data/`）：`eval50_questions.json`、`eval50_psyqa.jsonl`、`eval50_doubao.jsonl`、`eval50_judge.jsonl`、`eval50_report.json`。复用前先确认题集和采集条件一致（每题新会话）。

## LoRA 微调链路

```powershell
npm run export:lora-dataset   # python ../scripts/export_lora_dataset.py
npm run train:lora            # python ../scripts/train_lora.py
npm run pipeline:lora         # 导出 + 训练
npm run import:lora-ollama    # 导入 Ollama 使用
```

语料：`training_data/` 下 psydial、cpsycoun、distill_doubao。微调目标是「说话方式和话术风格」，不是医疗知识——伦理红线不变。

## 评测规范

1. **改动触发**：改模型/provider/路由 → `eval:counsel --online`；改提示词/检索 → `eval:ragas`；改危机分支 → `eval:safety`。
2. **盲评要求**：A/B 顺序随机、judge 用与被评模型不同的模型、输出 JSON 可解析。
3. **确定性安全检查不能省**：LLM judge 的 safety 分可能虚高，必须额外跑 regex/规则检查（热线 `400-161-9995`、无诊断、无停药建议）。
4. **报告字段**：样本数、逐维均分、胜/平/负、子集（普通/时效/危机）、延迟、失败率、安全违规清单。
5. **采集注意**：每题新会话；注意登录态失效和验证码；超时要重试并记录。

## 红线

- 危机路径永远用最强可用模型 + 安全模板，不做成本路由。
- 微调语料不得包含诊断、用药指导、真实用户隐私原文。
- 不用单次评测分数宣称"提升"，样本量 <30 时只说趋势。
