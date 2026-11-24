// 备份 SQLite 数据库到 backups/，使用 better-sqlite3 的在线 backup API（WAL 安全）
// 用法：npm run db:backup   （可选环境变量 PSYQA_DB_PATH 指定源库）
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.PSYQA_DB_PATH
  ? path.resolve(process.env.PSYQA_DB_PATH)
  : path.join(__dirname, '..', 'server', 'data', 'psyqa.db');

const backupDir = path.join(__dirname, '..', 'backups');
fs.mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dest = path.join(backupDir, `psyqa-${stamp}.db`);

if (!fs.existsSync(dbPath)) {
  console.error(`源库不存在: ${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath, { readonly: true });
db.backup(dest)
  .then(() => {
    const mb = (fs.statSync(dest).size / 1048576).toFixed(1);
    console.log(`备份完成: ${dest} (${mb} MB)`);
    db.close();
  })
  .catch((err) => {
    console.error('备份失败:', err.message);
    process.exit(1);
  });
