import * as fs from 'fs';
import { writeJsonFileSync, readJsonFileSync } from '../../utils/jsonFileStore';
import { userHistoryJsonPath } from '../../config/paths';
import {
  getUserHistoryFromDb,
  saveDialogToDb,
  clearUserHistoryInDb,
  updateDialogPsychInDb,
  updateDialogPortraitInDb,
  type UserData
} from '../../db/historyStore';
import {
  EmotionType,
  ProblemCategory,
  RiskLevel,
  getCategoryName,
  formatEmotionReport,
  EmotionAnalysis,
  RiskAssessment,
  ProblemAnalysis
} from '../psych/emotionService';
import { blendMetricsWithSelfRating } from '../psych/psychStatsService';

export type { ConversationPortrait, PsychSnapshot } from '../../types/psychHistory';
import type { ConversationPortrait, PsychSnapshot } from '../../types/psychHistory';

export interface GroupedHistoryItem extends Dialog {
  tags: string[];
  group: string;
}

interface Dialog {
  time: string;
  user: string;
  bot: string;
  summary: string;
  report?: string;
  psych?: PsychSnapshot;
  portrait?: ConversationPortrait;
}

interface Summary {
  time: string;
  summary: string;
}

export type { UserData };

const HISTORY_FILE = userHistoryJsonPath();
const USE_SQLITE = process.env.PSYQA_USE_JSON_STORAGE !== '1';

const EMOTION_LABELS: Record<string, string> = {
  happy: '开心',
  sad: '低落',
  anxious: '焦虑',
  angry: '愤怒',
  lonely: '孤独',
  neutral: '平稳',
  hopeful: '希望',
  confused: '迷茫',
  frustrated: '挫败',
  guilty: '内疚',
  shameful: '羞愧',
  proud: '自豪'
};

function loadHistoryJson(): { users: Record<string, UserData> } {
  if (!fs.existsSync(HISTORY_FILE)) {
    writeJsonFileSync(HISTORY_FILE, { users: {} });
  }
  return readJsonFileSync(HISTORY_FILE, { users: {} });
}

function saveHistoryJson(data: { users: Record<string, UserData> }): void {
  writeJsonFileSync(HISTORY_FILE, data);
}

function getUserData(user_id: string): UserData | null {
  if (USE_SQLITE) return getUserHistoryFromDb(user_id);
  const data = loadHistoryJson();
  return data.users[user_id] || null;
}

function persistUserData(user_id: string, userData: UserData): void {
  if (USE_SQLITE) return;
  const data = loadHistoryJson();
  data.users[user_id] = userData;
  saveHistoryJson(data);
}

const GROUP_RULES: Record<string, string[]> = {
  学业: ['学习', '考试', '考研', '作业', '绩点', '论文'],
  人际: ['人际', '朋友', '室友', '同学', '社交', '孤独'],
  情绪: ['焦虑', '抑郁', '烦躁', '紧张', '情绪', '压力'],
  家庭: ['家庭', '父母', '家人'],
  恋爱: ['恋爱', '失恋', '感情', '分手'],
  未来: ['就业', '未来', '方向', '迷茫', '职业']
};

export function generateSummary(query: string, reply: string, psych?: PsychSnapshot): string {
  if (psych) {
    const emo = EMOTION_LABELS[psych.emotion] || psych.emotion;
    const prob = getCategoryName(psych.problem);
    const riskNote = psych.risk === 'low' ? '' : `，风险关注：${psych.risk}`;
    return `情绪：${emo}（置信${Math.round(psych.confidence * 100)}%）；问题领域：${prob}${riskNote}`;
  }
  const KEYWORDS = ['压力', '焦虑', '失眠', '抑郁', '孤独', '自卑', '紧张', '烦躁', '失恋', '考试', '学习'];
  const emotions: string[] = [];
  for (const k of KEYWORDS) {
    if (query.includes(k)) emotions.push(k);
  }
  if (emotions.length === 0) return '情绪平稳，咨询日常问题';
  return `当前存在：${emotions.join('、')} 相关困扰，正在寻求疏导。`;
}

export function getLastPsychSnapshot(user_id: string): PsychSnapshot | null {
  const dialogs = getUserData(user_id)?.dialogs;
  if (!dialogs?.length) return null;
  for (let i = dialogs.length - 1; i >= 0; i--) {
    if (dialogs[i].psych) return dialogs[i].psych!;
  }
  return null;
}

export function getUserPsychSnapshots(user_id: string): PsychSnapshot[] {
  const dialogs = getUserData(user_id)?.dialogs;
  if (!dialogs?.length) return [];
  return dialogs.filter((d) => d.psych).map((d) => d.psych!);
}

export function getStructuredPsychTimeline(user_id: string, limit = 5): string {
  const dialogs = getUserData(user_id)?.dialogs;
  if (!dialogs?.length) return '暂无结构化心理状态记录。';

  const recent = dialogs.filter((d) => d.psych).slice(-limit);
  if (recent.length === 0) return '暂无结构化心理状态记录。';

  let text = '近几次咨询心理状态（结构化）：\n';
  recent.forEach((d, i) => {
    const p = d.psych!;
    text += `${i + 1}. ${d.time} | 情绪=${EMOTION_LABELS[p.emotion] || p.emotion} | 问题=${getCategoryName(p.problem)} | 风险=${p.risk} | 压力指数≈${p.stressLevel}\n`;
  });
  return text;
}

export function rebuildReportFromPsych(psych: PsychSnapshot): string {
  const emotion: EmotionAnalysis = {
    emotion: psych.emotion,
    confidence: psych.confidence,
    keywords: [],
    secondaryEmotions: []
  };
  const risk: RiskAssessment = {
    level: psych.risk,
    keywords: [],
    warningMessage:
      psych.risk === 'high' || psych.risk === 'critical' ? '请关注当前风险等级，必要时寻求专业支持。' : '',
    hotline: '全国心理援助热线：400-161-9995'
  };
  const problem: ProblemAnalysis = {
    category: psych.problem,
    confidence: 0.75,
    keywords: [],
    subcategories: []
  };
  return formatEmotionReport(emotion, risk, problem, undefined);
}

export function saveDialog(
  user_id: string,
  user_query: string,
  assistant_reply: string,
  summary: string,
  psych?: PsychSnapshot,
  report?: string
): string {
  if (USE_SQLITE) {
    return saveDialogToDb(user_id, user_query, assistant_reply, summary, psych, report);
  }

  const data = loadHistoryJson();
  const now = new Date().toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  if (!data.users[user_id]) {
    data.users[user_id] = { dialogs: [], summaries: [], total_times: 0 };
  }

  data.users[user_id].dialogs.push({
    time: now,
    user: user_query,
    bot: assistant_reply,
    summary,
    report,
    psych
  });
  data.users[user_id].summaries.push({ time: now, summary });
  data.users[user_id].total_times += 1;
  saveHistoryJson(data);
  return now;
}

export function getUserSummaries(user_id: string): string {
  const user = getUserData(user_id);
  if (!user) return '无历史对话。';

  let text = '用户历史心理状态变化：\n';
  user.summaries.forEach((s, i) => {
    text += `${i + 1}. ${s.time}：${s.summary}\n`;
  });
  return text;
}

export function getUserProgress(user_id: string): string {
  const user = getUserData(user_id);
  if (!user) return '暂无记录';

  let res = '';
  user.dialogs.forEach((item, i) => {
    res += `【第${i + 1}次咨询】${item.time}\n`;
    res += `问题：${item.user}\n`;
    res += `状态总结：${item.summary}\n\n`;
  });
  return res;
}

export function getUserHistory(user_id: string): UserData | null {
  return getUserData(user_id);
}

export function clearUserHistory(user_id: string): void {
  if (USE_SQLITE) {
    clearUserHistoryInDb(user_id);
    return;
  }
  const data = loadHistoryJson();
  if (data.users[user_id]) {
    delete data.users[user_id];
    saveHistoryJson(data);
  }
}

export function updateDialogSelfRating(
  user_id: string,
  dialogTime: string | undefined,
  ratings: {
    userSelfRating?: number;
    selfRatedStress?: number;
    selfRatedAnxiety?: number;
  }
): PsychSnapshot | null {
  if (USE_SQLITE) {
    const user = getUserData(user_id);
    if (!user?.dialogs.length) return null;
    let target = user.dialogs[user.dialogs.length - 1];
    if (dialogTime) {
      const found = user.dialogs.find((d) => d.time === dialogTime);
      if (found) target = found;
    }
    if (!target.psych) return null;
    applySelfRatingToPsych(target.psych, ratings);
    updateDialogPsychInDb(user_id, target.time, target.psych);
    return target.psych;
  }

  const data = loadHistoryJson();
  const user = data.users[user_id];
  if (!user?.dialogs.length) return null;

  let target = user.dialogs[user.dialogs.length - 1];
  if (dialogTime) {
    const found = user.dialogs.find((d) => d.time === dialogTime);
    if (found) target = found;
  }
  if (!target.psych) return null;
  applySelfRatingToPsych(target.psych, ratings);
  saveHistoryJson(data);
  return target.psych;
}

function applySelfRatingToPsych(
  psych: PsychSnapshot,
  ratings: {
    userSelfRating?: number;
    selfRatedStress?: number;
    selfRatedAnxiety?: number;
  }
): void {
  const modelMetrics = {
    stressLevel: psych.modelStressLevel ?? psych.stressLevel,
    anxietyLevel: psych.modelAnxietyLevel ?? psych.anxietyLevel,
    moodStability: psych.modelMoodStability ?? psych.moodStability
  };

  if (psych.modelStressLevel === undefined) {
    psych.modelStressLevel = modelMetrics.stressLevel;
    psych.modelAnxietyLevel = modelMetrics.anxietyLevel;
    psych.modelMoodStability = modelMetrics.moodStability;
  }

  if (ratings.userSelfRating !== undefined) psych.userSelfRating = ratings.userSelfRating;
  if (ratings.selfRatedStress !== undefined) psych.selfRatedStress = ratings.selfRatedStress;
  if (ratings.selfRatedAnxiety !== undefined) psych.selfRatedAnxiety = ratings.selfRatedAnxiety;

  const blended = blendMetricsWithSelfRating(modelMetrics, {
    mood: psych.userSelfRating,
    stress: psych.selfRatedStress,
    anxiety: psych.selfRatedAnxiety
  });
  psych.stressLevel = blended.stressLevel;
  psych.anxietyLevel = blended.anxietyLevel;
  psych.moodStability = blended.moodStability;
}

export function updateDialogReport(user_id: string, dialogTime: string, report: string): boolean {
  const data = loadHistoryJson();
  const user = data.users[user_id];
  if (!user?.dialogs.length) return false;
  const target = user.dialogs.find((d) => d.time === dialogTime) ?? user.dialogs[user.dialogs.length - 1];
  target.report = report;
  saveHistoryJson(data);
  return true;
}

export function updateDialogPsych(user_id: string, dialogTime: string, psych: PsychSnapshot): boolean {
  if (USE_SQLITE) {
    return updateDialogPsychInDb(user_id, dialogTime, psych);
  }
  const data = loadHistoryJson();
  const user = data.users[user_id];
  if (!user?.dialogs.length) return false;
  const target = user.dialogs.find((d) => d.time === dialogTime) ?? user.dialogs[user.dialogs.length - 1];
  target.psych = psych;
  saveHistoryJson(data);
  return true;
}

export function updateDialogPortrait(
  user_id: string,
  dialogTime: string,
  portrait: ConversationPortrait
): boolean {
  if (USE_SQLITE) {
    return updateDialogPortraitInDb(user_id, dialogTime, portrait);
  }

  const data = loadHistoryJson();
  const user = data.users[user_id];
  if (!user?.dialogs.length) return false;

  const target = user.dialogs.find((d) => d.time === dialogTime) ?? user.dialogs[user.dialogs.length - 1];
  target.portrait = portrait;
  saveHistoryJson(data);
  return true;
}

function inferTagsFromDialog(dialog: Dialog): { tags: string[]; group: string } {
  const text = `${dialog.user} ${dialog.summary} ${dialog.psych?.problem || ''}`.toLowerCase();
  const tags: string[] = [];
  let selectedGroup = '其他';
  let maxHits = 0;

  if (dialog.psych) {
    const prob = getCategoryName(dialog.psych.problem);
    if (prob) tags.push(prob);
  }

  for (const [group, words] of Object.entries(GROUP_RULES)) {
    let hits = 0;
    for (const word of words) {
      if (text.includes(word.toLowerCase())) {
        hits += 1;
        tags.push(word);
      }
    }
    if (hits > maxHits) {
      maxHits = hits;
      selectedGroup = group;
    }
  }

  return {
    tags: Array.from(new Set(tags)).slice(0, 5),
    group: selectedGroup
  };
}

export function getRecentPortraits(user_id: string, limit = 8): Array<{ time: string; portrait: ConversationPortrait }> {
  const dialogs = getUserData(user_id)?.dialogs;
  if (!dialogs?.length) return [];
  return dialogs
    .filter((d) => d.portrait)
    .slice(-limit)
    .map((d) => ({ time: d.time, portrait: d.portrait! }));
}

export function getGroupedUserHistory(user_id: string): Record<string, GroupedHistoryItem[]> {
  const history = getUserHistory(user_id);
  if (!history) return {};

  return history.dialogs.reduce<Record<string, GroupedHistoryItem[]>>((acc, dialog) => {
    const { tags, group } = inferTagsFromDialog(dialog);
    if (!acc[group]) acc[group] = [];
    acc[group].push({ ...dialog, tags, group });
    return acc;
  }, {});
}
