# Chroma 向量数据库

心理港湾 RAG 检索默认使用 **TF-IDF + SQLite 嵌入**（`vector_db/documents.json` + Ollama `nomic-embed-text`）。

启用 **Chroma** 后，语义检索走 Chroma HNSW 索引，适合 **5000+ 文档** 或需要独立向量服务的部署。

---

## 架构对比

| 方案 | 存储 | 检索 | 适用 |
|------|------|------|------|
| **默认** | `vector_db/documents.json` + SQLite `embedding_json` | TF-IDF 粗筛 + Ollama 向量精排 | 本地开发、单机部署 |
| **Chroma** | Chroma 持久化卷 | Ollama 嵌入 + Chroma 近邻搜索 | 生产、大规模知识库 |

未启用 Chroma 或 Chroma 不可用时，**自动回退**到默认方案，不影响咨询功能。

---

## 快速启用（本机 Python，无 Docker）

已安装 `chromadb` 时（`pip install chromadb`）：

```bash
cd PsyQA

# 1. 启动 Chroma 服务（数据目录 ./chroma_data）
npm run start:chroma
# 或: chroma run --path ./chroma_data --host localhost --port 8000

# 2. .env 已配置 PSYQA_CHROMA_ENABLED=1 等（见下方）

# 3. 拉取嵌入模型（首次）
ollama pull nomic-embed-text

# 4. 生成嵌入并同步（可先同步已有嵌入的子集）
npm run build:embeddings -- --limit=300
npm run sync:chroma:stored

# 全量：build:embeddings 多次提高 --limit，再 npm run sync:chroma

# 5. 重启后端
npm run dev
```

`一键启动.bat` 会在 Ollama 之后自动尝试启动 Chroma（当 `.env` 中 `PSYQA_CHROMA_ENABLED=1`）。

---

## 快速启用（Docker）

```bash
cd PsyQA

# 1. 启动 Chroma（可与 ollama / web 一起）
docker compose up -d chroma

# 2. .env 增加
# PSYQA_CHROMA_ENABLED=1
# CHROMA_URL=http://localhost:8000
# CHROMA_COLLECTION=psyqa_knowledge

# 3. 确保已有向量文档与嵌入
npm run rebuild:vector          # 生成 documents.json
npm run build:embeddings        # Ollama 生成 embedding（需 nomic-embed-text）

# 4. 同步到 Chroma
npm run sync:chroma

# 5. 重启后端
npm run dev
```

---

## 环境变量

```env
PSYQA_CHROMA_ENABLED=1
CHROMA_URL=http://localhost:8000
CHROMA_COLLECTION=psyqa_knowledge
OLLAMA_EMBED_MODEL=nomic-embed-text
```

Docker Compose 内 Web 服务使用 `CHROMA_URL=http://chroma:8000`。

---

## 验证

```bash
curl http://localhost:3001/health
# 含 chroma: { enabled, connected, count, ... }

# 管理员登录后
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/questions/admin/knowledge-status
```

---

## 与训练数据集的关系

算法训练语料见 [04_算法训练数据集清单.md](./04_算法训练数据集清单.md)。  
Chroma 仅用于 **在线 RAG 检索**，与离线训练流水线（`npm run pipeline:training`）相互独立。

知识库更新后建议：

```bash
npm run reload:knowledge
npm run build:embeddings
npm run sync:chroma   # 若已启用 Chroma，见 docs/05_Chroma向量库.md
```

---

## 相关代码

| 文件 | 说明 |
|------|------|
| `server/src/services/chromaVectorService.ts` | Chroma 客户端、检索、批量 upsert |
| `server/src/services/vectorDBService.ts` | 统一入口 `searchVectorDb`，Chroma 优先 |
| `server/scripts/sync-chroma.ts` | SQLite/JSON → Chroma 同步脚本 |
