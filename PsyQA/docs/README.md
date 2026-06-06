# 心理港湾 · 文档索引

> 建议阅读顺序：**快捷安装** → **系统说明** → **演示说明** → 按需查阅专题文档。

## 入门

| 文档 | 说明 |
|------|------|
| [快捷安装.md](./快捷安装.md) | 3 步上手（推荐先看） |
| [一键安装说明.md](./一键安装说明.md) | Windows 双击安装与启动 |
| [安装与运行.md](./安装与运行.md) | 环境、智谱/Ollama、Chroma、演示账号 |
| [../README.md](../README.md) | 项目总览与一键脚本 |

## 系统与设计

| 文档 | 说明 |
|------|------|
| [系统说明文档.md](./系统说明文档.md) | **主文档**：功能、权限、架构、API |
| [系统架构图.txt](./系统架构图.txt) | 架构 ASCII 图 |
| [07_个性化Agent落地方案.md](./07_个性化Agent落地方案.md) | 两年专属 Agent、动态 RAG、档案 API |
| [05_Chroma向量库.md](./05_Chroma向量库.md) | Chroma 部署与同步 |
| [06_数据处理指南.md](./06_数据处理指南.md) | 知识库与 RAG 管道 |
| [../DEPLOYMENT.md](../DEPLOYMENT.md) | 生产部署 |
| [生产部署.md](./生产部署.md) | 中文部署补充 |

## 演示与提交

| 文档 | 说明 |
|------|------|
| [作品使用与演示说明.md](./作品使用与演示说明.md) | 演示流程、报告导出 |
| [03_演示汇报脚本.md](./03_演示汇报脚本.md) | 约 6 分钟答辩口播 |
| [01_作品材料清单.md](./01_作品材料清单.md) | 大赛/毕设提交清单 |
| [02_作品报告撰写指南.md](./02_作品报告撰写指南.md) | 作品报告结构 |
| [04_算法训练数据集清单.md](./04_算法训练数据集清单.md) | 训练数据说明 |

## 常用命令

```bash
cd PsyQA
npm run install:all    # 安装依赖
npm run dev            # 开发模式（前后端）
npm run test:server    # 服务端测试
npm run start:chroma   # 启动 Chroma（可选）
npm run sync:chroma:stored   # 同步公共向量库
npm run chat:save_emb        # 补全用户对话向量
npm run user:feature_summary # 月度心理摘要
```

生成 Word：`python docs/scripts/generate_system_doc.py` · `generate_work_doc.py`
