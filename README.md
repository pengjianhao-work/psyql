# 心理港湾 · 大学生作品

高校双端智能心理健康服务平台（毕业设计 / 创新训练 / 课程设计）

## 快速开始

```bash
cd PsyQA
npm run install:all
npm run dev
```

浏览器打开 http://localhost:3000/login

## 目录结构

```
PsyQA1/
├── README.md                 # 本文件
├── PsyQA/                    # Web 应用（前端 + 后端）
│   ├── client/               # React 学生端 & 学校端
│   ├── server/               # Express API
│   └── docs/                 # 全部文档
├── scripts/                  # 模型训练与向量库脚本（可选）
├── vector_db/                # 向量检索数据
└── data/                     # 原始数据集
```

## 文档（均在 PsyQA/docs/）

| 文档 | 说明 |
|------|------|
| [安装与运行.md](PsyQA/docs/安装与运行.md) | 环境配置 |
| [作品使用与演示说明.md](PsyQA/docs/作品使用与演示说明.md) | 演示流程 |
| [01_作品材料清单.md](PsyQA/docs/01_作品材料清单.md) | 提交打包 |
| [03_演示汇报脚本.md](PsyQA/docs/03_演示汇报脚本.md) | 汇报口播 |

## 演示账号

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 学生 | demo | demo123 |
| 辅导员 | counselor | counselor123 |
| 管理员 | admin | admin123 |

## 声明

本系统为教学展示原型，提供心理支持参考，不能替代专业心理咨询或医疗诊断。
