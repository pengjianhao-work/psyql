/**
 * npm run eval:ragas 的入口。
 * Windows 上若存在 D:\Anaconda\python.exe 就用它，和原来的命令一致。
 * 其他环境用 python3，再由 eval_ragas.py 检查密钥、bge-m3 和 Qdrant。
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const winPython = 'D:\\Anaconda\\python.exe';
const python =
  process.platform === 'win32' && fs.existsSync(winPython)
    ? winPython
    : process.platform === 'win32'
      ? 'python'
      : 'python3';
const script = path.join(__dirname, 'eval_ragas.py');
const result = spawnSync(python, [script, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(result.status === null ? 1 : result.status);
