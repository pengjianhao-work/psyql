import { getUserHistoryFromDb } from '../../db/historyStore';
import { listMoodCheckins } from './moodCheckinService';

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
  return lines.join('\n');
}
