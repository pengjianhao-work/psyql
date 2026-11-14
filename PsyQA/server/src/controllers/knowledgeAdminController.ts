import { spawn } from 'child_process';
import path from 'path';
import { Response } from 'express';
import { AuthRequest, requireAuth, requireRole } from '../middleware/authMiddleware';
import {
  readSchedulerState,
  triggerKnowledgeUpdate
} from '../services/knowledge/knowledgeScheduler';
import { getKnowledgeBaseCount } from '../services/knowledge/ragService';
import { vectorDb } from '../services/knowledge/vectorDBService';
import {
  appendKnowledgeEntry,
  listKnowledgeCatalog,
  KnowledgeCategoryFilter
} from '../services/knowledge/knowledgeCatalogService';
import { countWikiPages, getWikiPage, listWikiPages, updateWikiStatus } from '../services/wiki/wikiStore';
import { WikiStatus } from '../services/wiki/wikiTypes';

export const getKnowledgeItems = (req: AuthRequest, res: Response): void => {
  const category = (req.query.category as KnowledgeCategoryFilter) || 'all';
  const q = req.query.q ? String(req.query.q) : undefined;
  const page = req.query.page ? Number(req.query.page) : 1;
  const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 20;
  res.json(listKnowledgeCatalog({ category, q, page, pageSize }));
};

export const postKnowledgeItem = (req: AuthRequest, res: Response): void => {
  try {
    const item = appendKnowledgeEntry({
      question: String(req.body?.question || ''),
      answer: String(req.body?.answer || ''),
      category: (req.body?.category as KnowledgeCategoryFilter) || 'academic_stress',
      emotions: req.body?.emotions
    });
    res.status(201).json({ message: '已添加知识条目并热重载', item });
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : '添加失败' });
  }
};

export const getKnowledgeUpdateStatus = (_req: AuthRequest, res: Response): void => {
  const state = readSchedulerState();
  res.json({
    state,
    live: {
      knowledgeBaseCount: getKnowledgeBaseCount(),
      vectorDbCount: vectorDb.getDocumentCount()
    },
    autoUpdateEnabled: process.env.KNOWLEDGE_AUTO_UPDATE === '1'
  });
};

export const postKnowledgeUpdate = async (req: AuthRequest, res: Response): Promise<void> => {
  const force = req.body?.force === true;
  const result = await triggerKnowledgeUpdate(force);
  res.status(result.ok ? 200 : 500).json(result);
};

// ── LLM Wiki 管理端 ─────────────────────────────────────────────

interface WikiBuildState {
  running: boolean;
  startedAt?: string;
  finishedAt?: string;
  ok?: boolean;
  summary?: string;
  outputTail?: string;
}

const wikiBuildState: WikiBuildState = { running: false };
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const WIKI_BUILD_SCRIPT = path.join(REPO_ROOT, 'server', 'scripts', 'build-llm-wiki.ts');
const TS_NODE_BIN = path.join(REPO_ROOT, 'node_modules', 'ts-node', 'dist', 'bin.js');

function isWikiStatus(value: unknown): value is WikiStatus {
  return value === 'draft' || value === 'published' || value === 'archived';
}

export const getWikiPages = (req: AuthRequest, res: Response): void => {
  const result = listWikiPages({
    category: req.query.category ? String(req.query.category) : undefined,
    status: req.query.status ? (String(req.query.status) as WikiStatus | 'all') : 'all',
    q: req.query.q ? String(req.query.q) : undefined,
    page: req.query.page ? Number(req.query.page) : 1,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : 20
  });
  res.json({
    ...result,
    totals: {
      total: countWikiPages(),
      published: countWikiPages('published'),
      draft: countWikiPages('draft'),
      archived: countWikiPages('archived')
    },
    build: wikiBuildState
  });
};

export const getWikiPageDetail = (req: AuthRequest, res: Response): void => {
  const page = getWikiPage(String(req.params.slug || ''));
  if (!page) {
    res.status(404).json({ error: 'wiki 页不存在' });
    return;
  }
  res.json(page);
};

export const patchWikiPageStatus = (req: AuthRequest, res: Response): void => {
  const status = req.body?.status;
  if (!isWikiStatus(status)) {
    res.status(400).json({ error: 'status 只能是 draft / published / archived' });
    return;
  }
  const ok = updateWikiStatus(String(req.params.slug || ''), status);
  if (!ok) {
    res.status(404).json({ error: 'wiki 页不存在' });
    return;
  }
  res.json({ ok: true, slug: req.params.slug, status });
};

export const postWikiRebuild = (req: AuthRequest, res: Response): void => {
  if (wikiBuildState.running) {
    res.status(409).json({ error: '已有重建任务在执行', build: wikiBuildState });
    return;
  }
  const category = req.body?.category ? String(req.body.category) : 'all';
  const perCategory = Math.min(20, Math.max(1, Number(req.body?.perCategory) || 8));
  const force = req.body?.force === true;
  const args = [
    WIKI_BUILD_SCRIPT,
    '--category=' + category,
    '--per-category=' + perCategory,
    '--sleep-ms=400',
    '--model=' + (process.env.WIKI_LLM_MODEL || 'Qwen/Qwen2.5-72B-Instruct')
  ];
  if (force) args.push('--force=true');

  wikiBuildState.running = true;
  wikiBuildState.startedAt = new Date().toISOString();
  wikiBuildState.finishedAt = undefined;
  wikiBuildState.ok = undefined;
  wikiBuildState.summary = '重建中，可稍后刷新列表';
  wikiBuildState.outputTail = '';

  try {
    const child = spawn(process.execPath, [TS_NODE_BIN, ...args], {
      cwd: REPO_ROOT,
      env: process.env,
      shell: false,
      windowsHide: true
    });
    const collect = (chunk: Buffer) => {
      const tail = (wikiBuildState.outputTail || '') + chunk.toString('utf-8');
      wikiBuildState.outputTail = tail.slice(-4000);
    };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    child.on('error', (err) => {
      wikiBuildState.running = false;
      wikiBuildState.finishedAt = new Date().toISOString();
      wikiBuildState.ok = false;
      wikiBuildState.summary = '重建进程启动失败：' + err.message;
    });
    child.on('close', (code) => {
      wikiBuildState.running = false;
      wikiBuildState.finishedAt = new Date().toISOString();
      wikiBuildState.ok = code === 0;
      wikiBuildState.summary = code === 0 ? '重建完成' : '重建退出码 ' + code;
    });
    res.json({ started: true, category, perCategory, build: wikiBuildState });
  } catch (err) {
    wikiBuildState.running = false;
    wikiBuildState.finishedAt = new Date().toISOString();
    wikiBuildState.ok = false;
    wikiBuildState.summary = err instanceof Error ? err.message : '重建启动失败';
    res.status(500).json({ error: wikiBuildState.summary, build: wikiBuildState });
  }
};

export const knowledgeAdminMiddleware = [requireAuth, requireRole('admin')] as const;
