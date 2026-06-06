import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { reloadKnowledgeBase } from './ragService';
import { reloadVectorDatabase } from './vectorDBService';

export interface KnowledgeSchedulerState {
  lastRun?: string;
  lastSuccessMonth?: string;
  lastStatus?: string;
  lastLog?: string;
  knowledgeTotal?: number;
  vectorTotal?: number;
  nextScheduledHint?: string;
}

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');
const STATE_FILE = path.join(REPO_ROOT, 'server', 'data', 'knowledge_scheduler_state.json');
const UPDATE_SCRIPT = path.join(REPO_ROOT, '..', 'scripts', 'monthly_knowledge_update.py');

let running = false;

function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function readSchedulerState(): KnowledgeSchedulerState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')) as KnowledgeSchedulerState;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function resolvePython(): string {
  return process.env.PYTHON_PATH || 'python';
}

function runPythonUpdate(force = false): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const args = [UPDATE_SCRIPT];
    if (force) args.push('--force');

    const proc = spawn(resolvePython(), args, {
      cwd: path.join(REPO_ROOT, '..'),
      shell: process.platform === 'win32',
      env: process.env
    });

    let output = '';
    proc.stdout?.on('data', (d) => {
      output += d.toString();
    });
    proc.stderr?.on('data', (d) => {
      output += d.toString();
    });
    proc.on('close', (code) => resolve({ code: code ?? 1, output }));
  });
}

export async function triggerKnowledgeUpdate(force = false): Promise<{
  ok: boolean;
  message: string;
  state: KnowledgeSchedulerState;
  output?: string;
}> {
  if (running) {
    return { ok: false, message: '更新任务正在执行中', state: readSchedulerState() };
  }

  if (!fs.existsSync(UPDATE_SCRIPT)) {
    return { ok: false, message: `未找到更新脚本: ${UPDATE_SCRIPT}`, state: readSchedulerState() };
  }

  running = true;
  try {
    const { code, output } = await runPythonUpdate(force);
    if (code === 0) {
      const kb = reloadKnowledgeBase();
      const vec = reloadVectorDatabase();
      const state = readSchedulerState();
      return {
        ok: true,
        message: `更新成功，知识库 ${kb} 条，向量 ${vec} 条`,
        state,
        output: output.slice(-2000)
      };
    }
    return {
      ok: false,
      message: `更新脚本退出码 ${code}`,
      state: readSchedulerState(),
      output: output.slice(-2000)
    };
  } finally {
    running = false;
  }
}

function shouldAutoRun(): boolean {
  const day = parseInt(process.env.KNOWLEDGE_UPDATE_DAY || '1', 10);
  const hour = parseInt(process.env.KNOWLEDGE_UPDATE_HOUR || '3', 10);
  const now = new Date();
  if (now.getDate() !== day || now.getHours() !== hour) {
    return false;
  }
  const state = readSchedulerState();
  return state.lastSuccessMonth !== monthKey(now);
}

/** 后端常驻时每月自动检查（需 KNOWLEDGE_AUTO_UPDATE=1） */
export function startKnowledgeScheduler(): void {
  if (process.env.KNOWLEDGE_AUTO_UPDATE !== '1') {
    return;
  }

  const day = process.env.KNOWLEDGE_UPDATE_DAY || '1';
  const hour = process.env.KNOWLEDGE_UPDATE_HOUR || '3';
  console.log(`Knowledge scheduler enabled: monthly day ${day} at ${hour}:00`);

  const tick = async () => {
    if (!shouldAutoRun() || running) return;
    console.log('Running scheduled monthly knowledge update...');
    const result = await triggerKnowledgeUpdate(false);
    console.log(result.ok ? result.message : `Knowledge update failed: ${result.message}`);
  };

  setInterval(() => {
    tick().catch((e) => console.error('Knowledge scheduler error:', e));
  }, 60 * 60 * 1000);

  setTimeout(() => {
    tick().catch((e) => console.error('Knowledge scheduler error:', e));
  }, 15000);
}
