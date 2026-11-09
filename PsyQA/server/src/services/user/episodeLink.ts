import axios from 'axios';
import { localBgeReady, localBgeUrl } from '../knowledge/localBgeClient';

/** 近一周内的事可以进入检索。更早的要对方这轮明显又提起。 */
export const EPISODE_LINK_AT = 0.72;
export const EPISODE_PARAPHRASE_AT = 0.82;
export const EPISODE_ACTIVE_MS = 7 * 24 * 60 * 60 * 1000;

export type EpisodeTopic = '学业' | '人际' | '职场' | '情绪' | '身体';
export type EpisodeMode = 'single' | 'split' | 'woven' | 'joined';
export type EpisodePlan = { mode: EpisodeMode; clauses: string[] };

const TOPIC_RULES: Array<{ topic: EpisodeTopic; pattern: RegExp }> = [
  { topic: '职场', pattern: /老板|同事|上班|公司|实习|加班/ },
  { topic: '学业', pattern: /导师|作业|考试|挂科|论文|复习|上课|题目|成绩|数学题/ },
  { topic: '人际', pattern: /室友|朋友|父母|爸|妈|同学|吵架|分手|恋人/ },
  { topic: '身体', pattern: /失眠|头疼|头痛|睡不着|食欲|生病/ },
  { topic: '情绪', pattern: /焦虑|难过|崩溃|心情|抑郁|想哭/ }
];

const PROTOTYPE_TEXT: Record<EpisodeTopic, string> = {
  学业: '作业考试成绩导师论文复习上课',
  人际: '室友朋友父母家人同学吵架分手',
  职场: '老板同事上班公司实习工作',
  情绪: '心情焦虑难过压力崩溃',
  身体: '失眠头疼睡不着身体食欲'
};

const EMOTION_ONLY = /^(?:我)?(?:烦死了|好烦|好累|想哭|难受|崩溃了|心态崩了)$/;
const CAUSAL = /因为|所以|结果|导致|于是/;
const WOVEN = /怎么都|是不是|倒霉|事事不顺|烦死了|一切都|好崩溃|心态崩/;

let prototypeVectors: Record<string, number[]> | null = null;
let warming: Promise<void> | null = null;

export function topicOfText(text: string): EpisodeTopic | undefined {
  for (const rule of TOPIC_RULES) {
    if (rule.pattern.test(text)) return rule.topic;
  }
  return undefined;
}

export function cosineSimilarity(left: number[], right: number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

/** 聚类优势不明显时不贴标签。数学练习曾被本机向量贴到「身体」，这种结果丢掉。 */
export function topicFromVector(
  vector: number[],
  prototypes: Record<string, number[]> | null = prototypeVectors
): EpisodeTopic | undefined {
  if (!prototypes) return undefined;
  let bestName = '';
  let best = 0;
  let second = 0;
  for (const [name, proto] of Object.entries(prototypes)) {
    const score = cosineSimilarity(vector, proto);
    if (score > best) {
      second = best;
      best = score;
      bestName = name;
    } else if (score > second) {
      second = score;
    }
  }
  if (best < 0.62 || best - second < 0.08) return undefined;
  return bestName as EpisodeTopic;
}

async function loadPrototypeVectors(): Promise<void> {
  if (!(await localBgeReady())) return;
  const names = Object.keys(PROTOTYPE_TEXT) as EpisodeTopic[];
  const { data } = await axios.post(
    `${localBgeUrl()}/embed`,
    { texts: names.map((name) => PROTOTYPE_TEXT[name]), max_length: 64, colbert_k: 1 },
    { timeout: 20_000 }
  );
  const items = data?.items as Array<{ dense?: number[] }> | undefined;
  if (!Array.isArray(items) || items.length !== names.length) return;
  const next: Record<string, number[]> = {};
  names.forEach((name, index) => {
    const dense = items[index]?.dense;
    if (Array.isArray(dense) && dense.length >= 8) next[name] = dense;
  });
  if (Object.keys(next).length === names.length) prototypeVectors = next;
}

/** 后台准备五个粗主题的向量。不在首字路径上等待。 */
export function warmEpisodeTopics(): Promise<void> {
  if (prototypeVectors) return Promise.resolve();
  if (!warming) {
    warming = loadPrototypeVectors().catch(() => undefined).finally(() => {
      warming = null;
    });
  }
  return warming;
}

export function splitEpisodeClauses(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').replace(/\.{3,}|…+/g, '，').trim();
  if (!normalized) return [];
  const parts = normalized
    .split(/[，,、。！？；;\n]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3 && !EMOTION_ONLY.test(part) && !WOVEN.test(part));
  if (parts.length <= 1) return [normalized];
  return parts.slice(0, 3);
}

/** 纯规则。同一轮不用向量决定拆还是并，所以首字不用等第二次编码。 */
export function planEpisode(text: string): EpisodePlan {
  const clauses = splitEpisodeClauses(text);
  if (clauses.length <= 1) {
    return { mode: 'single', clauses: clauses.length ? clauses : [text.trim()].filter(Boolean) };
  }
  const topics = clauses.map((clause) => topicOfText(clause));
  if (topics.every((topic) => topic && topic === topics[0])) return { mode: 'joined', clauses };
  if (CAUSAL.test(text)) return { mode: 'joined', clauses };
  if (WOVEN.test(text)) return { mode: 'woven', clauses };
  return { mode: 'split', clauses };
}

export function formatEpisodeInstruction(plan: EpisodePlan): string {
  if (plan.clauses.length < 2 || plan.mode === 'single' || plan.mode === 'joined') return '';
  const lines = plan.clauses.map((clause, index) => `${index + 1}. ${clause}`);
  const lead =
    plan.mode === 'woven'
      ? '对方把这些事放在同一种感受里。先接住这股感受，再点到每件事。不要说它们互不相干，也不要另编因果。'
      : '这轮有几件分开的事。逐件回应，不要自己编一个共同原因。';
  return [lead, ...lines].join('\n');
}

export function episodeIsActive(dialogTime?: string, now = Date.now()): boolean {
  if (!dialogTime) return true;
  const digits = dialogTime.match(/\d+/g);
  if (!digits || digits.length < 3) return true;
  const [year, month, day, hour = '0', minute = '0', second = '0'] = digits;
  const stamp = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  ).getTime();
  if (Number.isNaN(stamp)) return true;
  return now - stamp <= EPISODE_ACTIVE_MS;
}

export function nextPreferenceCount(
  counts: Record<string, number> | undefined,
  tone: string
): { counts: Record<string, number>; ready: boolean } {
  const next = { ...(counts ?? {}), [tone]: (counts?.[tone] ?? 0) + 1 };
  return { counts: next, ready: next[tone] >= 3 };
}
