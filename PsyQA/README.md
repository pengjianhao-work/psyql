# 心理港湾（PsyQA）

面向高校的 **智能心理咨询 + 院系管理平台**（学生端 / 学校端 / 登录三端分离）。

## 快速开始

```bash
cd PsyQA
npm run install:all
copy .env.example .env    # Windows；配置 ZHIPU_API_KEY 等
npm run dev
```

- 前端：http://localhost:3000/login  
- 后端：http://localhost:3001/health  

**演示账号**：`demo/demo123` · `counselor/counselor123` · `admin/admin123`

## 一键安装（Windows）

| 文件 | 作用 |
|------|------|
| **一键安装.bat** | 配置 `.env` + 安装依赖 |
| **一键安装-快速模式.bat** | 无大模型，规则+知识库演示 |
| **一键启动.bat** | 启动前后端（智谱/Ollama + 可选 Chroma） |
| **一键启动-快捷模式.bat** | 不调用大模型 |
| **创建桌面快捷方式.bat** | 桌面图标 |

说明：[docs/快捷安装.md](docs/快捷安装.md) · [docs/一键安装说明.md](docs/一键安装说明.md)

## 核心能力

| 模块 | 说明 |
|------|------|
| 智能咨询 | 智谱 GLM（优先）/ Ollama + RAG 知识库 + 规则心理分析 |
| 心理报告 | 量化模型、可视化图表、PDF/分享/导出 |
| 专属 Agent | 24 月长效画像、动态 RAG 权重、私有 Chroma 记忆 |
| 学校端 | 看板、告警、学生档案、权限与隐私控制 |
| 管理端 | 用户管理、全校报表、知识库维护 |

> 教学展示原型，不能替代专业心理咨询或医疗诊断。

## 文档

完整索引：[docs/README.md](docs/README.md)

| 文档 | 说明 |
|------|------|
| [docs/系统说明文档.md](docs/系统说明文档.md) | 功能、权限、API（**主文档**） |
| [docs/07_个性化Agent落地方案.md](docs/07_个性化Agent落地方案.md) | 专属 Agent 与动态权重 |
| [docs/安装与运行.md](docs/安装与运行.md) | 环境、智谱、Chroma |
| [docs/作品使用与演示说明.md](docs/作品使用与演示说明.md) | 演示与报告导出 |
| [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) | 目录与脚本说明 |
| [DEPLOYMENT.md](DEPLOYMENT.md) | 生产部署 |

## 常用命令

```bash
npm run dev                  # 开发
npm run test:server          # 测试
npm run start:chroma         # 向量库（可选）
npm run sync:chroma:stored   # 同步公共知识向量
npm run chat:save_emb        # 补全用户对话向量
npm run user:feature_summary # 月度心理摘要
```

## 技术栈

React 19 · Express · TypeScript · SQLite · Chroma · 智谱 AI · Ollama（嵌入/备选）
