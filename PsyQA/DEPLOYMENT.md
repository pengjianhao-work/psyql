# 心理港湾 · 部署指南

> 详细安装见 [docs/安装与运行.md](docs/安装与运行.md) · 生产见 [docs/生产部署.md](docs/生产部署.md)

## 环境要求

- Node.js >= 18（推荐 20+）
- npm >= 10
- **智谱 AI**（推荐，对话生成）或 **Ollama**（本地备选 + 向量嵌入）
- **Chroma**（可选，混合 RAG 与专属 Agent 私有记忆）

## 快速本地部署

```bash
cd PsyQA
npm run install:all
copy .env.example .env
# 编辑 .env：ZHIPU_API_KEY、AUTH_SECRET 等
npm run dev
```

- 前端：http://localhost:3000/login  
- 健康检查：http://localhost:3001/health  

### 大模型（二选一或并存）

**智谱（推荐，无需 GPU）**

```env
ZHIPU_API_KEY=your_key
ZHIPU_MODEL=glm-4-flash
PSYQA_LLM_PROVIDER=zhipu
```

**Ollama（本地）**

```bash
ollama pull qwen:7b
ollama pull nomic-embed-text
ollama serve
```

### Chroma（可选）

```bash
npm run start:chroma
npm run sync:chroma:stored
```

## Docker

```bash
docker-compose up -d
```

Chroma 服务在 `profiles: ["chroma"]` 下，需：`docker-compose --profile chroma up -d`

## 环境变量

| 变量 | 说明 | 默认 |
|------|------|------|
| `PORT` | 后端端口 | 3001 |
| `AUTH_SECRET` | 会话密钥（生产必填 ≥16 字符） | — |
| `ZHIPU_API_KEY` | 智谱 API Key | — |
| `PSYQA_LLM_PROVIDER` | `zhipu` / `ollama` / `auto` | auto |
| `PSYQA_CHROMA_ENABLED` | 启用 Chroma | 0 |
| `CHROMA_URL` | Chroma 地址 | http://localhost:8000 |
| `OLLAMA_API_URL` | Ollama 地址 | http://localhost:11434 |
| `OLLAMA_MODEL` | 对话模型 | qwen:7b |
| `OLLAMA_EMBED_MODEL` | 嵌入模型 | nomic-embed-text |
| `PSYQA_FAST_ANSWER` | `1` = 不调用大模型 | — |
| `CORS_ORIGIN` | 生产前端域名 | — |

完整模板：`.env.example`

## 构建与运行

```bash
npm run build          # 编译 server + client
npm start              # 运行 dist/server.js
npm run test:server    # 测试
```

## 数据持久化

| 数据 | 位置 |
|------|------|
| 账号、对话、Agent 画像 | `server/data/psyqa.db`（默认 SQLite） |
| 知识库 | `server/data/mental_dataset.json` |
| 向量索引 | `vector_db/documents.json` |
| Chroma | 本地 chroma 数据目录或 Docker volume |

清空学生历史会同步删除 Agent 画像与 Chroma 用户集合。

## 健康检查

```
GET http://localhost:3001/health
```

返回 `llmMode`（zhipu/ollama/fallback/fast）、`chroma` 状态等。

## 注意事项

1. 生产环境务必修改 `AUTH_SECRET`，配置 `CORS_ORIGIN`
2. 智谱 Key 勿提交到 Git（已在 `.gitignore` 忽略 `.env`）
3. Ollama 首次拉取模型耗时较长；无 GPU 可仅用智谱对话 + Ollama 仅做 embed
4. 建议 HTTPS 反向代理（Nginx 等）

更多 API 与权限见 [docs/系统说明文档.md](docs/系统说明文档.md)。
