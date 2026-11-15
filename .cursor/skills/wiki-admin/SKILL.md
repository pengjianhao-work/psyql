---
name: wiki-admin
description: 操作心理港湾 LLM Wiki 知识层时使用：离线生成/重建 wiki 页、审核 draft、发布/归档页面、跑 wiki 检索评测、排查 wiki 不生效。涉及 wiki_documents、wiki:build、trends:build、/admin/wiki、wikiService/wikiStore/wikiValidator 时必读。
---

# wiki-admin — LLM Wiki 运维

## 边界

- Wiki 是**离线生成 + 在线检索**的静态知识层，不是向量库的一部分，不进 `knowledgeSources`。
- 在线回答时 wiki 只作「主题背景」注入提示词（`wikiService.ts`），不调用 LLM、不拖慢首字；高风险/危机路径一律不注入（守卫在 `counselSkills.ts`）。
- 本 skill 只管 Wiki 数据生产与审核；改检索/注入逻辑走 `counsel-agent`，跑评测走 `rag-eval`。

## 关键文件

| 文件 | 职责 |
|---|---|
| `server/src/services/wiki/wikiStore.ts` | `wiki_documents` 表读写；published 页内存缓存 5 分钟 |
| `server/src/services/wiki/wikiService.ts` | 在线检索：关键词 n-gram 打分，`PSYQA_WIKI_SEMANTIC=1` 时语义分（120ms 预算，失败退回关键词） |
| `server/src/services/wiki/wikiValidator.ts` | 生成质量校验：标题个案化、诊断/药物/污名化词、危机要素 |
| `server/src/services/wiki/wikiSeeds.ts` | 种子页定义；校验失败的页留在 draft 且 `sections` 只有「校验错误」 |
| `server/src/services/wiki/trendWikiBuilder.ts` | 热点词蒸馏成 wiki draft 页 |
| `server/scripts/build-llm-wiki.ts` | 离线生成器（默认 Qwen2.5-72B via SiliconFlow） |
| `server/src/routes/question.ts:129-132` | 管理端 API（仅 admin）：`GET /admin/wiki`、`GET /admin/wiki/:slug`、`PATCH /admin/wiki/:slug`（改 status）、`POST /admin/wiki/rebuild` |

## 状态机

`wiki_documents.status`：`draft | published | archived`

- `published`：进入内存缓存参与检索。
- `draft`：不参与检索，等人工审核（管理端 Wiki tab 或 PATCH API）。
- `archived`：下线但保留记录。

## 常用命令（在 `PsyQA/` 下）

```powershell
npm run wiki:build          # 全量重建（会覆盖同 slug 页）
npm run wiki:build:dry      # 试运行，每类 2 页，不写库
npm run trends:build        # 热点摘要 + 蒸馏 draft 页
npm run wiki:health         # python ../scripts/eval_wiki.py 检索评测
npx ts-node server/scripts/eval-wiki-semantic.ts   # 语义 vs 关键词召回对比
```

## 流程

### 生成/重建

1. `npm run wiki:build:dry` 先试跑确认模型与输出正常。
2. `npm run wiki:build` 全量跑；生成报告在 `server/data/llm_wiki_build_report.json`。
3. validator 失败的页会留在 draft 且内容是「校验错误」——**这类页不能发布**，应改 `wikiSeeds.ts` 种子后重建，或直接 archive。

### 审核 draft → 发布

1. 管理端「LLM Wiki」tab 或 `PATCH /api/questions/admin/wiki/:slug` 改 `status`。
2. 发布前人工读一遍：四段结构（常见表现/可能成因/可以尝试的做法/什么时候该求助）齐全；「什么时候该求助」段应指向学校心理中心或正规医疗机构。
3. trend 蒸馏页 `sources: 0` 是设计使然（无文档来源），不算缺陷。
4. published 缓存 5 分钟，改完立即生效有延迟；急用可重启服务或等缓存过期。

## 红线

- 不给诊断、不写药物/处方内容、不污名化——validator 拦截的页不要手工绕过发布。
- 危机类页面的求助段必须保留热线 `400-161-9995`（以 `emotionService.ts` 的 `CRISIS_HOTLINE` 为准）。
- 不要把 wiki 原文当医疗建议注入；它只是内部背景。
- 不提交 `wiki_documents` 对应的运行时 db 文件；wiki 内容在 db 里，代码只改生成器/检索逻辑。

## 异常处理

- 生成失败/校验失败 → 留 draft 不发布，记录原因。
- 检索返回 `[]` 是设计行为（无命中或高风险守卫），不要当错误修。
- 语义检索超时/embedding 失败 → 自动退回关键词，不需要人工干预；频繁失败检查 SiliconFlow key 与 `PSYQA_WIKI_SEMANTIC`。
- 管理端看不到新页 → 检查 `status` 是否 draft、published 缓存是否过期。
