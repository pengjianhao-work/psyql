import * as fs from 'fs';
import { getUserHistory, PsychSnapshot } from './historyManager';
import { loadAccounts } from '../user/accountService';
import { listAlerts, recordRiskAlert } from '../school/schoolAlertService';
import { ensureOrganizations } from '../user/orgService';
import { userHistoryJsonPath } from '../../config/paths';

const DEMO_STUDENT_ID = 'acc_demo';
const HISTORY_FILE = userHistoryJsonPath();

interface HistoryData {
  users: Record<
    string,
    {
      dialogs: Array<{
        time: string;
        user: string;
        bot: string;
        summary: string;
        psych?: PsychSnapshot;
      }>;
      summaries: Array<{ time: string; summary: string }>;
      total_times: number;
    }
  >;
}

function loadRawHistory(): HistoryData {
  if (!fs.existsSync(HISTORY_FILE)) {
    return { users: {} };
  }
  return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')) as HistoryData;
}

function saveRawHistory(data: HistoryData): void {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function appendSeedDialog(
  userId: string,
  userQuery: string,
  botReply: string,
  summary: string,
  psych: PsychSnapshot,
  time: string
): void {
  const data = loadRawHistory();
  if (!data.users[userId]) {
    data.users[userId] = { dialogs: [], summaries: [], total_times: 0 };
  }
  data.users[userId].dialogs.push({ time, user: userQuery, bot: botReply, summary, psych });
  data.users[userId].summaries.push({ time, summary });
  data.users[userId].total_times += 1;
  saveRawHistory(data);
}

export async function seedP0DemoData(): Promise<void> {
  ensureOrganizations();
  await loadAccounts();

  const hist = getUserHistory(DEMO_STUDENT_ID);
  if (!hist || hist.dialogs.length === 0) {
    appendSeedDialog(
      DEMO_STUDENT_ID,
      '最近学习压力很大，学不进去怎么办？',
      '我理解你现在承受的学习压力，可以先从最小行动开始…',
      '情绪：焦虑；问题领域：学业压力',
      {
        emotion: 'anxious',
        risk: 'medium',
        problem: 'academic_stress',
        confidence: 0.82,
        stressLevel: 72,
        anxietyLevel: 68,
        moodStability: 55
      },
      '2026/05/18 14:30:00'
    );
    appendSeedDialog(
      DEMO_STUDENT_ID,
      '有时候觉得活着没意思，不知道该怎么办',
      '我非常重视你现在的状态，你的安全是第一位的…',
      '情绪：低落；问题领域：情绪困扰，风险关注：high',
      {
        emotion: 'sad',
        risk: 'high',
        problem: 'emotion_regulation',
        confidence: 0.88,
        stressLevel: 85,
        anxietyLevel: 78,
        moodStability: 40
      },
      '2026/05/19 20:15:00'
    );
  }

  const hasDemoAlert = listAlerts().some((a) => a.studentId === DEMO_STUDENT_ID);
  if (!hasDemoAlert) {
    recordRiskAlert({
      studentId: DEMO_STUDENT_ID,
      displayName: '演示学生',
      orgId: 'cs-demo',
      riskLevel: 'high',
      summary: '检测到高危情绪表达：活着没意思（演示预置数据）',
      riskKeywords: ['活着没意思'],
      dialogId: '2026/05/19 20:15:00',
      dialogTime: '2026-05-19T12:15:00.000Z'
    });
  }
}
