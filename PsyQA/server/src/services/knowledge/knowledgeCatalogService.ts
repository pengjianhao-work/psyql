import * as fs from 'fs';
import { resolveDataFile } from '../../config/paths';
import { ProblemCategory, EmotionType } from '../psych/emotionService';
import { KnowledgeItem, reloadKnowledgeBase } from './ragService';

export type KnowledgeCategoryFilter = 'all' | 'academic_stress' | 'interpersonal' | 'crisis' | 'emotion_regulation' | 'family_relationship';

const CATEGORY_LABEL: Record<string, string> = {
  academic_stress: '学业压力',
  interpersonal: '人际关系',
  trauma: '危机干预',
  emotion_regulation: '情绪调节',
  family_relationship: '家庭关系',
  romantic_relationship: '恋爱关系',
  other: '其他'
};

function resolveKnowledgePath(): string {
  return resolveDataFile('mental_dataset.json');
}

function readDataset(): { knowledge: KnowledgeItem[]; [key: string]: unknown } {
  const path = resolveKnowledgePath();
  if (!fs.existsSync(path)) {
    return { knowledge: [] };
  }
  const raw = JSON.parse(fs.readFileSync(path, 'utf-8')) as { knowledge?: KnowledgeItem[] };
  return { ...raw, knowledge: raw.knowledge || [] };
}

function writeDataset(data: { knowledge: KnowledgeItem[]; [key: string]: unknown }): void {
  fs.writeFileSync(resolveKnowledgePath(), JSON.stringify(data, null, 2), 'utf-8');
  reloadKnowledgeBase();
}

function matchesCategory(item: KnowledgeItem, category: KnowledgeCategoryFilter): boolean {
  if (category === 'all') return true;
  if (category === 'crisis') {
    const text = `${item.question} ${item.answer}`;
    return (
      item.tags?.problems?.includes('trauma') ||
      /自杀|自伤|危机|热线|安全计划/.test(text)
    );
  }
  return Boolean(item.tags?.problems?.includes(category as ProblemCategory));
}

export function listKnowledgeCatalog(params: {
  category?: KnowledgeCategoryFilter;
  q?: string;
  page?: number;
  pageSize?: number;
}): {
  total: number;
  page: number;
  pageSize: number;
  items: Array<KnowledgeItem & { index: number; categoryLabels: string[] }>;
} {
  const category = params.category || 'all';
  const q = (params.q || '').trim().toLowerCase();
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(50, Math.max(5, params.pageSize || 20));

  let items = readDataset().knowledge.map((item, index) => ({
    ...item,
    index,
    categoryLabels: (item.tags?.problems || ['other']).map((p) => CATEGORY_LABEL[p] || p)
  }));

  items = items.filter((item) => matchesCategory(item, category));
  if (q) {
    items = items.filter(
      (item) =>
        item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q)
    );
  }

  const total = items.length;
  const start = (page - 1) * pageSize;
  return {
    total,
    page,
    pageSize,
    items: items.slice(start, start + pageSize)
  };
}

export function appendKnowledgeEntry(input: {
  question: string;
  answer: string;
  category: KnowledgeCategoryFilter;
  emotions?: EmotionType[];
}): KnowledgeItem {
  const question = input.question.trim();
  const answer = input.answer.trim();
  if (!question || !answer) {
    throw new Error('问题与回答不能为空');
  }

  let problems: ProblemCategory[] = ['other'];
  if (input.category === 'academic_stress') problems = ['academic_stress'];
  else if (input.category === 'interpersonal') problems = ['interpersonal'];
  else if (input.category === 'family_relationship') problems = ['family_relationship'];
  else if (input.category === 'emotion_regulation') problems = ['emotion_regulation'];
  else if (input.category === 'crisis') problems = ['trauma', 'emotion_regulation'];

  const item: KnowledgeItem = {
    question,
    answer,
    tags: {
      problems,
      emotions: input.emotions?.length ? input.emotions : ['neutral'],
      interventionTypes: input.category === 'crisis' ? ['crisis', 'safety'] : ['support']
    }
  };

  const data = readDataset();
  data.knowledge.push(item);
  writeDataset(data);
  return item;
}

export { CATEGORY_LABEL };
