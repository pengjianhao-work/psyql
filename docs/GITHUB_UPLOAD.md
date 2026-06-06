# 导入 GitHub 仓库

## 1. 在 GitHub 创建空仓库

1. 打开 https://github.com/new
2. 仓库名建议：`PsyQA` 或 `psyqa-mental-health`
3. **不要**勾选 “Add a README”（本地已有代码）
4. 创建后记下仓库地址，例如：`https://github.com/你的用户名/PsyQA.git`

## 2. 本地已完成的步骤

项目根目录 `PsyQA1` 已执行：

```bash
git init
git add .
git commit -m "Initial commit: PsyQA campus mental health platform"
```

## 3. 关联远程并推送

在 **PowerShell** 中（将 URL 换成你的仓库）：

```powershell
cd C:\Users\lenovo\Desktop\PsyQA1
git branch -M main
git remote add origin https://github.com/你的用户名/PsyQA.git
git push -u origin main
```

若使用 SSH：

```powershell
git remote add origin git@github.com:你的用户名/PsyQA.git
git push -u origin main
```

## 4. 不会上传的内容（已在 .gitignore）

| 类型 | 说明 |
|------|------|
| `.env` | 含 API Key，切勿提交 |
| `node_modules/` | 依赖 |
| `*.db` / `chroma_data/` | 本地数据库与向量库 |
| `training_data/`、`data/` | 大体积训练数据 |
| `PsyQA_full.json` 等 | 数据集 |

克隆后在新机器执行：

```bash
cd PsyQA
cp .env.example .env
npm run install:all
```

## 5. 安装 GitHub CLI（可选）

安装 [GitHub CLI](https://cli.github.com/) 后可一键创建并推送：

```powershell
gh auth login
gh repo create PsyQA --public --source=. --remote=origin --push
```
