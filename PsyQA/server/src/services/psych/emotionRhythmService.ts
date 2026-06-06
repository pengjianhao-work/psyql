import { getUserHistory } from '../common/historyManager';
import type { PsychSnapshot } from '../../types/psychHistory';

export type MoodLevel = 'green' | 'yellow' | 'red' | 'none';

export interface EmotionCalendarDay {
  date: string;
  level: MoodLevel;
  score: number;
  ewma: number;
  sessions: number;
}

export interface PeriodicDip {
  pattern: 'weekday' | 'month_phase' | 'season';
  label: string;
  description: string;
  carePlan: string;
}

export interface EmotionRhythmPayload {
  month: string;
  days: EmotionCalendarDay[];
  ewmaTrend: number[];
  periodicDips: PeriodicDip[];
  summary: string;
}

const EWMA_ALPHA = 0.35;

function riskPenalty(level: string): number {
  if (level === 'critical') return 35;
  if (level === 'high') return 22;
  if (level === 'medium') return 10;
  return 0;
}

function snapshotScore(p: PsychSnapshot): number {
  const stress = p.stressLevel ?? 50;
  const anxiety = p.anxietyLevel ?? 50;
  const stability = p.moodStability ?? 50;
  const raw = stability * 0.45 + (100 - stress) * 0.3 + (100 - anxiety) * 0.25 - riskPenalty(p.risk);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function levelFromScore(score: number): MoodLevel {
  if (score >= 62) return 'green';
  if (score >= 42) return 'yellow';
  return 'red';
}

function parseDateKey(dialogTime: string): string {
  const normalized = dialogTime.replace(/\//g, '-');
  const d = new Date(normalized);
  if (!Number.isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return normalized.slice(0, 10);
}

function ewma(values: number[]): number[] {
  if (!values.length) return [];
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i += 1) {
    out.push(EWMA_ALPHA * values[i] + (1 - EWMA_ALPHA) * out[i - 1]);
  }
  return out;
}

function detectPeriodicDips(days: EmotionCalendarDay[]): PeriodicDip[] {
  const dips: PeriodicDip[] = [];
  const withData = days.filter((d) => d.sessions > 0);
  if (withData.length < 5) return dips;

  const weekdayScores: Record<number, number[]> = {};
  for (const d of withData) {
    const wd = new Date(d.date).getDay();
    if (!weekdayScores[wd]) weekdayScores[wd] = [];
    weekdayScores[wd].push(d.ewma);
  }
  const weekdayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  for (const [wd, scores] of Object.entries(weekdayScores)) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const overall = withData.reduce((a, b) => a + b.ewma, 0) / withData.length;
    if (scores.length >= 2 && avg < overall - 8) {
      dips.push({
        pattern: 'weekday',
        label: `${weekdayNames[Number(wd)]}情绪低谷`,
        description: `近月在该时段平均情绪分 ${avg.toFixed(0)}，低于整体 ${overall.toFixed(0)}`,
        carePlan: `建议在${weekdayNames[Number(wd)]}前预留放松时间，提前做 5 分钟呼吸练习或轻度运动。`
      });
    }
  }

  const month = withData[0]?.date.slice(0, 7) ?? '';
  const examMonths = ['01', '06', '12'];
  const m = month.slice(5, 7);
  if (examMonths.includes(m)) {
    dips.push({
      pattern: 'month_phase',
      label: '考试/期末周期',
      description: '当前月份处于常见学业压力高峰期',
      carePlan: '拆分复习任务、保证睡眠、用「完成一小步」替代完美主义自我要求。'
    });
  }

  const seasonMonths = ['03', '04', '10', '11'];
  if (seasonMonths.includes(m)) {
    dips.push({
      pattern: 'season',
      label: '换季情绪波动',
      description: '换季期日照与作息变化可能放大情绪波动',
      carePlan: '规律作息、适度户外活动；若持续两周以上低落，建议预约校内心理中心。'
    });
  }

  return dips.slice(0, 3);
}

export function buildEmotionRhythmCalendar(userId: string, month?: string): EmotionRhythmPayload {
  const targetMonth = month || new Date().toISOString().slice(0, 7);
  const dialogs = getUserHistory(userId)?.dialogs || [];

  const byDay = new Map<string, PsychSnapshot[]>();
  for (const d of dialogs) {
    if (!d.psych) continue;
    const key = parseDateKey(d.time);
    if (!key.startsWith(targetMonth)) continue;
    const list = byDay.get(key) || [];
    list.push(d.psych);
    byDay.set(key, list);
  }

  const [y, m] = targetMonth.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const dailyScores: number[] = [];
  const days: EmotionCalendarDay[] = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${targetMonth}-${String(day).padStart(2, '0')}`;
    const snaps = byDay.get(date) || [];
    if (!snaps.length) {
      days.push({ date, level: 'none', score: 0, ewma: 0, sessions: 0 });
      dailyScores.push(0);
      continue;
    }
    const avg = snaps.reduce((a, s) => a + snapshotScore(s), 0) / snaps.length;
    dailyScores.push(avg);
    days.push({
      date,
      level: levelFromScore(avg),
      score: Math.round(avg),
      ewma: 0,
      sessions: snaps.length
    });
  }

  const filledScores = dailyScores.map((s, i) => (s === 0 && i > 0 ? dailyScores[i - 1] || 50 : s || 50));
  const ewmaSeries = ewma(filledScores);
  for (let i = 0; i < days.length; i += 1) {
    days[i].ewma = Math.round(ewmaSeries[i] * 10) / 10;
    if (days[i].sessions > 0) {
      days[i].level = levelFromScore(days[i].ewma);
    }
  }

  const periodicDips = detectPeriodicDips(days);
  const activeDays = days.filter((d) => d.sessions > 0);
  const avgEwma =
    activeDays.length > 0
      ? activeDays.reduce((a, d) => a + d.ewma, 0) / activeDays.length
      : 0;

  let summary = `${targetMonth} 暂无足够咨询记录生成节律分析。`;
  if (activeDays.length >= 2) {
    summary = `${targetMonth} 共 ${activeDays.length} 天有咨询记录，EWMA 均值 ${avgEwma.toFixed(0)}。`;
    if (periodicDips.length) {
      summary += ` 识别到 ${periodicDips.length} 个周期性关注窗口。`;
    }
  }

  return { month: targetMonth, days, ewmaTrend: ewmaSeries, periodicDips, summary };
}
