import type { PsychSnapshot } from '../../types/psychHistory';
import type { EmotionTimelineEntry, InterventionProfile } from '../../types/userAgent';
import {
  ensureUserAgentProfile,
  getUserAgentProfile,
  listUserIdsWithDialogs,
  updateUserAgentProfile,
  getDialogsForMonth,
  getDialogsForYear
} from '../../db/userAgentStore';
import { callLlmGenerate } from '../llm/llmClient';
import { resolveAgentPhase } from './userMemoryService';

function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function previousMonthKey(d = new Date()): string {
  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return monthKey(prev);
}

function yearKey(d = new Date()): string {
  return String(d.getFullYear());
}

function previousYearKey(d = new Date()): string {
  return String(d.getFullYear() - 1);
}

function monthLikePattern(ym: string): string {
  return `${ym.replace('-', '/').slice(0, 7)}/%`;
}

function buildDialogDigest(
  rows: Array<{ userText: string; botText: string; summary: string; psychJson: string | null }>
): string {
  return rows
    .slice(-40)
    .map((r, i) => {
      let psych = '';
      if (r.psychJson) {
        try {
          const p = JSON.parse(r.psychJson) as PsychSnapshot;
          psych = ` [情绪:${p.emotion ?? '-'} 主题:${p.problem ?? '-'}]`;
        } catch {
          /* ignore */
        }
      }
      return `${i + 1}. 用户：${r.userText.slice(0, 200)}${psych}\n   摘要：${r.summary.slice(0, 120)}`;
    })
    .join('\n');
}

function parseSummarySections(text: string): {
  summary: string;
  emotions: string[];
  triggers: string[];
  tone?: string;
  sensitive: string[];
  effective: string[];
} {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const pick = (prefix: string): string[] => {
    const line = lines.find((l) => l.startsWith(prefix));
    if (!line) return [];
    return line
      .slice(prefix.length)
      .split(/[、,，;；]/)
      .map((s) => s.trim())
      .filter(Boolean);
  };
  const summaryLine = lines.find((l) => l.startsWith('总结：'))?.slice(3) ?? text.slice(0, 400);
  return {
    summary: summaryLine,
    emotions: pick('高频情绪：'),
    triggers: pick('触发诱因：'),
    tone: lines.find((l) => l.startsWith('沟通偏好：'))?.slice(5),
    sensitive: pick('敏感话题：'),
    effective: pick('有效疏导：')
  };
}

export async function summarizeUserMonth(
  userId: string,
  targetMonth?: string
): Promise<{ userId: string; month: string; summary: string; skipped?: boolean }> {
  const month = targetMonth || previousMonthKey();
  const profile = ensureUserAgentProfile(userId);
  if (profile.monthlySummariesJson.some((m) => m.month === month)) {
    return { userId, month, summary: '', skipped: true };
  }

  const rows = getDbDialogsForMonth(userId, month);
  if (!rows.length) {
    return { userId, month, summary: '', skipped: true };
  }

  const digest = buildDialogDigest(rows);
  const prompt = `你是心理档案分析师。根据以下用户当月咨询记录，输出结构化中文摘要（不要 markdown）：
总结：（100字内当月心理特征）
高频情绪：（焦虑/内耗/抑郁/易怒等，顿号分隔，最多4项）
触发诱因：（工作/感情/睡眠等，顿号分隔）
沟通偏好：（温和共情/理性分析/简短开导 等一句话）
敏感话题：（用户反感或需避开的话题，无则写「无」）
有效疏导：（用户反馈有效或反复接受的疏导方式，无则写「待观察」）

【${month} 咨询记录】
${digest}`;

  const raw = await callLlmGenerate(prompt, { temperature: 0.3, maxTokens: 512, timeoutMs: 120000 });
  if (!raw?.trim()) {
    return { userId, month, summary: '', skipped: true };
  }

  const parsed = parseSummarySections(raw.trim());
  const now = new Date().toISOString();
  const monthlySummaries = [
    ...profile.monthlySummariesJson.filter((m) => m.month !== month),
    { month, summary: parsed.summary, createdAt: now }
  ];

  const timelineEntry: EmotionTimelineEntry = {
    month,
    dominantEmotions: parsed.emotions,
    triggers: parsed.triggers,
    notes: parsed.summary
  };
  const emotionTimeline = [
    ...profile.emotionTimelineJson.filter((e) => e.month !== month),
    timelineEntry
  ].sort((a, b) => a.month.localeCompare(b.month));

  const intervention: InterventionProfile = {
    effectiveApproaches: [
      ...(profile.interventionJson?.effectiveApproaches ?? []),
      ...parsed.effective.filter(
        (x) => x !== '待观察' && !(profile.interventionJson?.effectiveApproaches ?? []).includes(x)
      )
    ].slice(-12),
    avoidPhrases: profile.interventionJson?.avoidPhrases ?? [],
    sensitiveTopics: [
      ...(profile.interventionJson?.sensitiveTopics ?? []),
      ...parsed.sensitive.filter(
        (x) => x !== '无' && !(profile.interventionJson?.sensitiveTopics ?? []).includes(x)
      )
    ].slice(-20),
    preferredTone: parsed.tone || profile.interventionJson?.preferredTone
  };

  updateUserAgentProfile(userId, {
    monthlySummariesJson: monthlySummaries,
    emotionTimelineJson: emotionTimeline,
    interventionJson: intervention,
    agentPhase: resolveAgentPhase(userId)
  });

  return { userId, month, summary: parsed.summary };
}

function getDbDialogsForMonth(userId: string, month: string) {
  return getDialogsForMonth(userId, month);
}

export async function runMonthlyFeatureSummary(options?: {
  month?: string;
  userId?: string;
}): Promise<Array<{ userId: string; month: string; summary: string; skipped?: boolean }>> {
  const month = options?.month || previousMonthKey();
  const userIds = options?.userId ? [options.userId] : listUserIdsWithDialogs();
  const results: Array<{ userId: string; month: string; summary: string; skipped?: boolean }> = [];
  for (const uid of userIds) {
    if (!uid || uid === 'default_user') continue;
    results.push(await summarizeUserMonth(uid, month));
  }
  return results;
}

export async function generateUserAnnualReport(
  userId: string,
  targetYear?: string
): Promise<{ userId: string; year: string; report: string; skipped?: boolean }> {
  const year = targetYear || previousYearKey();
  const profile = ensureUserAgentProfile(userId);
  if (profile.annualReportsJson.some((r) => r.year === year)) {
    return { userId, year, report: '', skipped: true };
  }

  const rows = getDialogsForYear(userId, year);
  const monthlyInYear = profile.monthlySummariesJson.filter((m) => m.month.startsWith(`${year}-`));
  if (!rows.length && !monthlyInYear.length) {
    return { userId, year, report: '', skipped: true };
  }

  const digest = buildDialogDigest(rows);
  const monthlyBlock = monthlyInYear.map((m) => `${m.month}：${m.summary}`).join('\n');
  const prompt = `你是资深心理咨询师，请基于用户 ${year} 年全部咨询记录，撰写年度心理档案（300-500字）：
1. 长期性格与情绪模式
2. 反复出现的触发因素与应对方式
3. 有效干预与需避雷的沟通方式
4. 下一年陪伴建议

最后单独一行输出：
【专属Agent人设】（150字内，第二人称「你」描述如何陪伴该用户）

【月度摘要】
${monthlyBlock || '（无月度摘要）'}

【部分对话摘录】
${digest || '（无对话）'}`;

  const raw = await callLlmGenerate(prompt, { temperature: 0.35, maxTokens: 900, timeoutMs: 180000 });
  if (!raw?.trim()) {
    return { userId, year, report: '', skipped: true };
  }

  const agentMatch = raw.match(/【专属Agent人设】([\s\S]*?)(?:\n\n|$)/);
  const agentPrompt = agentMatch?.[1]?.trim();
  const reportBody = raw.replace(/【专属Agent人设】[\s\S]*$/, '').trim();
  const now = new Date().toISOString();

  const annualReports = [
    ...profile.annualReportsJson.filter((r) => r.year !== year),
    { year, report: reportBody, createdAt: now }
  ];

  const patch: Parameters<typeof updateUserAgentProfile>[1] = {
    annualReportsJson: annualReports,
    agentPhase: resolveAgentPhase(userId)
  };
  if (agentPrompt && resolveAgentPhase(userId) === 'mature') {
    patch.agentSystemPrompt = agentPrompt;
  }

  updateUserAgentProfile(userId, patch);
  return { userId, year, report: reportBody };
}

export async function runAnnualReports(options?: {
  year?: string;
  userId?: string;
}): Promise<Array<{ userId: string; year: string; report: string; skipped?: boolean }>> {
  const year = options?.year || previousYearKey();
  const userIds = options?.userId ? [options.userId] : listUserIdsWithDialogs();
  const results: Array<{ userId: string; year: string; report: string; skipped?: boolean }> = [];
  for (const uid of userIds) {
    if (!uid || uid === 'default_user') continue;
    results.push(await generateUserAnnualReport(uid, year));
  }
  return results;
}

export { monthKey, previousMonthKey, yearKey, previousYearKey };
