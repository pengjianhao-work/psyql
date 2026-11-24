import { getUserHistoryFromDb } from '../../db/historyStore';
import { listMoodCheckins } from './moodCheckinService';
import { listAllDiaries } from './diaryService';

export interface UserDataExport {
  userId: string;
  exportedAt: string;
  totalTimes: number;
  dialogs: Array<{
    time: string;
    user: string;
    bot: string;
    summary: string;
    report?: string;
  }>;
  summaries: Array<{ time: string; summary: string }>;
  moodCheckins: Array<{ mood: string; note: string | null; createdAt: string }>;
  diaries: Array<{ date: string; content: string; updatedAt: string }>;
}

export function buildUserDataExport(userId: string): UserDataExport {
  const history = getUserHistoryFromDb(userId);
  return {
    userId,
    exportedAt: new Date().toISOString(),
    totalTimes: history?.total_times ?? 0,
    dialogs: (history?.dialogs ?? []).map((d) => ({
      time: d.time,
      user: d.user,
      bot: d.bot,
      summary: d.summary,
      report: d.report
    })),
    summaries: history?.summaries ?? [],
    moodCheckins: listMoodCheckins(userId, 100).map((c) => ({
      mood: c.mood,
      note: c.note,
      createdAt: c.createdAt
    })),
    diaries: listAllDiaries(userId).map((d) => ({
      date: d.date,
      content: d.content,
      updatedAt: d.updatedAt
    }))
  };
}

export function exportToMarkdown(data: UserDataExport): string {
  const lines: string[] = [
    '# 心理港湾 · 我的咨询记录导出',
    '',
    `导出时间：${data.exportedAt}`,
    `共 ${data.totalTimes} 次对话`,
    ''
  ];
  for (const d of data.dialogs) {
    lines.push(`## ${d.time}`, '', `**我：** ${d.user}`, '', `**心理港湾：** ${d.bot}`, '');
    if (d.summary) lines.push(`> 小结：${d.summary}`, '');
  }
  if (data.moodCheckins.length) {
    lines.push('## 情绪打卡', '');
    for (const c of data.moodCheckins) {
      lines.push(`- ${c.createdAt}：${c.mood}${c.note ? `（${c.note}）` : ''}`);
    }
    lines.push('');
  }
  if (data.diaries.length) {
    lines.push('## 我的日记', '');
    for (const d of data.diaries) {
      lines.push(`### ${d.date}`, '', d.content, '');
    }
  }
  return lines.join('\n');
}
