// 从备份恢复 SQLite。安全要求：恢复前必须停止后端进程（脚本会校验无 WAL 锁）。
// 用法：npm run db:restore -- backups/psyqa-<stamp>.db
const fs = require('fs');
const path = require('path');

const src = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!src || !fs.existsSync(src)) {
  console.error('用法: node scripts/restore-db.js <备份文件>');
  process.exit(1);
}

const dest = process.env.PSYQA_DB_PATH
  ? path.resolve(process.env.PSYQA_DB_PATH)
  : path.join(__dirname, '..', 'server', 'data', 'psyqa.db');

// WAL 残留文件存在说明可能有进程还连着库，拒绝覆盖
const wal = `${dest}-wal`;
const shm = `${dest}-shm`;
if (fs.existsSync(wal) && fs.statSync(wal).size > 0) {
  console.error(`检测到活动 WAL (${wal})，请先停止后端再恢复`);
  process.exit(1);
}

const backupCopy = `${dest}.pre-restore-${Date.now()}`;
if (fs.existsSync(dest)) {
  fs.copyFileSync(dest, backupCopy);
  console.log(`当前库已留副本: ${backupCopy}`);
}

fs.copyFileSync(src, dest);
for (const f of [wal, shm]) {
  if (fs.existsSync(f)) fs.rmSync(f);
}
console.log(`恢复完成: ${src} -> ${dest}`);
