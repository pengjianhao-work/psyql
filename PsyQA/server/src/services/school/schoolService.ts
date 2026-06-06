import { getUserHistory, getLastPsychSnapshot } from '../common/historyManager';
import {
  loadAccounts,
  PublicAccount,
  AccountRecord,
  maskStudentDisplay,
  enrichPublicAccount
} from '../user/accountService';
import { listAlerts, SchoolAlert } from './schoolAlertService';
import { hasApprovedTranscriptAccess } from './transcriptRequestService';
import {
  getCategoryName,
  getEmotionLabel,
  getRiskLabel,
  ProblemCategory,
  EmotionType,
  RiskLevel
} from '../psych/emotionService';

export interface DashboardStats {
  totalConsultations: number;
  activeStudents: number;
  highRiskCount: number;
  pendingAlerts: number;
  problemTop3: Array<{ category: string; count: number; share: number }>;
  emotionTop3: Array<{ emotion: string; count: number; share: number }>;
  avgStress: number;
}

export interface StudentListItem {
  id: string;
  maskName: string;
  orgId: string;
  className?: string;
  lastConsultTime?: string;
  lastEmotion?: string;
  lastRisk?: string;
  lastProblem?: string;
  lastStressLevel?: number;
  lastAnxietyLevel?: number;
  lastMoodStability?: number;
  consultCount: number;
  pendingAlerts: number;
}

export interface StudentSummary {
  id: string;
  maskName: string;
  orgId: string;
  timeline: Array<{
    time: string;
    emotion: string;
    risk: string;
    problem: string;
    summary: string;
    stressLevel?: number;
  }>;
  trend: Array<{ index: number; stress: number; anxiety: number; mood: number }>;
}

function canAccessOrg(user: PublicAccount, orgId: string): boolean {
  if (user.role === 'admin') return true;
  if (!user.managedOrgIds?.length) return orgId === user.orgId || orgId === 'default';
  return user.managedOrgIds.includes(orgId);
}

function canAccessStudent(user: PublicAccount, student: AccountRecord): boolean {
  if (!canAccessOrg(user, student.orgId || 'default')) return false;
  if (user.role === 'admin') return true;
  const classes = user.managedClassIds;
  if (!classes?.length) return true;
  if (!student.className) return false;
  return classes.some((c) => student.className === c || student.className?.includes(c));
}

/** 辅导员需学生授权且在本院系；管理员始终可看原文；已审批申请可临时开放 */
export function canViewFullTranscripts(viewer: PublicAccount, student: AccountRecord): boolean {
  if (viewer.role === 'admin') return true;
  if (viewer.role !== 'counselor') return false;
  if (!canAccessStudent(viewer, student)) return false;
  if (hasApprovedTranscriptAccess(student.id, viewer.id)) return true;
  return student.allowSchoolTranscriptView !== false;
}

export async function getDashboardForUser(user: PublicAccount): Promise<DashboardStats> {
  const accounts = (await loadAccounts()).users.filter((a) => a.role === 'student');
  const visibleStudents = accounts.filter((a) => canAccessStudent(user, a));

  let totalConsultations = 0;
  const activeSet = new Set<string>();
  let highRiskCount = 0;
  const problemCounts = new Map<string, number>();
  const emotionCounts = new Map<string, number>();
  let stressSum = 0;
  let stressN = 0;

  for (const st of visibleStudents) {
    const hist = getUserHistory(st.id);
    if (!hist?.dialogs.length) continue;
    activeSet.add(st.id);
    totalConsultations += hist.dialogs.length;
    for (const d of hist.dialogs) {
      if (!d.psych) continue;
      if (d.psych.risk === 'high' || d.psych.risk === 'critical') highRiskCount++;
      const prob = getCategoryName(d.psych.problem as ProblemCategory);
      problemCounts.set(prob, (problemCounts.get(prob) || 0) + 1);
      emotionCounts.set(d.psych.emotion, (emotionCounts.get(d.psych.emotion) || 0) + 1);
      stressSum += d.psych.stressLevel;
      stressN++;
    }
  }

  const orgFilter = user.role === 'admin' ? undefined : user.managedOrgIds?.length ? user.managedOrgIds : user.orgId ? [user.orgId] : undefined;
  const pendingAlerts = listAlerts({ status: 'pending', orgIds: orgFilter }).length;

  const toTop3Category = (m: Map<string, number>) => {
    const total = [...m.values()].reduce((a, b) => a + b, 0) || 1;
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([category, count]) => ({ category, count, share: Math.round((count / total) * 100) }));
  };

  const toTop3Emotion = (m: Map<string, number>) => {
    const total = [...m.values()].reduce((a, b) => a + b, 0) || 1;
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([emotion, count]) => ({ emotion, count, share: Math.round((count / total) * 100) }));
  };

  return {
    totalConsultations,
    activeStudents: activeSet.size,
    highRiskCount,
    pendingAlerts,
    problemTop3: toTop3Category(problemCounts),
    emotionTop3: toTop3Emotion(emotionCounts),
    avgStress: stressN ? Math.round(stressSum / stressN) : 0
  };
}

export async function listStudentsForUser(user: PublicAccount): Promise<StudentListItem[]> {
  const accounts = (await loadAccounts()).users.filter((a) => a.role === 'student');
  const orgFilter = user.role === 'admin' ? undefined : user.managedOrgIds?.length ? user.managedOrgIds : user.orgId ? [user.orgId] : undefined;
  const pendingByStudent = new Map<string, number>();
  listAlerts({ status: 'pending', orgIds: orgFilter }).forEach((a) => {
    pendingByStudent.set(a.studentId, (pendingByStudent.get(a.studentId) || 0) + 1);
  });

  return accounts
    .filter((a) => canAccessStudent(user, a))
    .map((st) => {
      const hist = getUserHistory(st.id);
      const last = hist?.dialogs.filter((d) => d.psych).slice(-1)[0];
      const pub = enrichPublicAccount(st);
      const canTranscript = canViewFullTranscripts(user, st);
      return {
        id: st.id,
        maskName: maskStudentDisplay(st.displayName, st.studentNo),
        displayName: st.displayName,
        username: st.username,
        studentNo: st.studentNo,
        avatar: st.avatar,
        orgId: st.orgId || 'default',
        orgName: pub.orgName,
        schoolName: pub.schoolName,
        className: st.className,
        lastConsultTime: last?.time,
        lastEmotion: last?.psych?.emotion,
        lastEmotionLabel: last?.psych?.emotion ? getEmotionLabel(last.psych.emotion) : undefined,
        lastRisk: last?.psych?.risk,
        lastRiskLabel: last?.psych?.risk ? getRiskLabel(last.psych.risk) : undefined,
        lastProblem: last?.psych?.problem,
        lastProblemLabel: last?.psych?.problem
          ? getCategoryName(last.psych.problem as ProblemCategory)
          : undefined,
        lastStressLevel: last?.psych?.stressLevel,
        lastAnxietyLevel: last?.psych?.anxietyLevel,
        lastMoodStability: last?.psych?.moodStability,
        consultCount: hist?.dialogs.length ?? 0,
        pendingAlerts: pendingByStudent.get(st.id) || 0,
        allowSchoolTranscriptView: st.allowSchoolTranscriptView !== false,
        transcriptMasked: !canTranscript
      };
    })
    .sort((a, b) => (b.lastConsultTime || '').localeCompare(a.lastConsultTime || ''));
}

export async function getStudentSummaryForUser(
  user: PublicAccount,
  studentId: string
): Promise<StudentSummary | null> {
  const accounts = (await loadAccounts()).users;
  const st = accounts.find((a) => a.id === studentId && a.role === 'student');
  if (!st || !canAccessStudent(user, st)) return null;

  const hist = getUserHistory(studentId);
  if (!hist) {
    return {
      id: studentId,
      maskName: maskStudentDisplay(st.displayName, st.studentNo),
      orgId: st.orgId || 'default',
      timeline: [],
      trend: []
    };
  }

  const recent = hist.dialogs.filter((d) => d.psych).slice(-5);
  return {
    id: studentId,
    maskName: maskStudentDisplay(st.displayName, st.studentNo),
    orgId: st.orgId || 'default',
    timeline: recent.map((d) => ({
      time: d.time,
      emotion: d.psych!.emotion,
      risk: d.psych!.risk,
      problem: getCategoryName(d.psych!.problem as ProblemCategory),
      summary: d.summary,
      stressLevel: d.psych!.stressLevel
    })),
    trend: hist.dialogs
      .filter((d) => d.psych)
      .slice(-8)
      .map((d, i) => ({
        index: i + 1,
        stress: d.psych!.stressLevel,
        anxiety: d.psych!.anxietyLevel,
        mood: d.psych!.moodStability
      }))
  };
}

export async function getStudentDetailForUser(
  user: PublicAccount,
  studentId: string
): Promise<{
  profile: Record<string, unknown>;
  dialogs: Array<Record<string, unknown>>;
  alerts: SchoolAlert[];
} | null> {
  const accounts = (await loadAccounts()).users;
  const st = accounts.find((a) => a.id === studentId && a.role === 'student');
  if (!st || !canAccessStudent(user, st)) return null;

  const pub = enrichPublicAccount(st);
  const canTranscript = canViewFullTranscripts(user, st);
  const hist = getUserHistory(studentId);
  const orgFilter =
    user.role === 'admin'
      ? undefined
      : user.managedOrgIds?.length
        ? user.managedOrgIds
        : user.orgId
          ? [user.orgId]
          : undefined;

  const alerts = listAlerts({ orgIds: orgFilter }).filter((a) => a.studentId === studentId);

  const pendingCount = alerts.filter((a) => a.status === 'pending').length;

  const profile = {
    id: st.id,
    maskName: maskStudentDisplay(st.displayName, st.studentNo),
    displayName: st.displayName,
    username: st.username,
    studentNo: st.studentNo,
    avatar: st.avatar,
    orgId: st.orgId || 'default',
    orgName: pub.orgName,
    schoolName: pub.schoolName,
    className: st.className,
    consultCount: hist?.dialogs.length ?? 0,
    pendingAlerts: pendingCount,
    allowSchoolTranscriptView: st.allowSchoolTranscriptView !== false,
    transcriptMasked: !canTranscript
  };

  const dialogs = (hist?.dialogs ?? []).map((d) => ({
    time: d.time,
    user: canTranscript ? d.user : '（学生未授权或已关闭对话原文，仅展示摘要与指标）',
    bot: canTranscript ? d.bot : '—',
    summary: d.summary,
    report: canTranscript ? d.report : undefined,
    psych: d.psych
      ? {
          emotion: d.psych.emotion,
          emotionLabel: getEmotionLabel(d.psych.emotion as EmotionType),
          risk: d.psych.risk,
          riskLabel: getRiskLabel(d.psych.risk as RiskLevel),
          problem: d.psych.problem,
          problemLabel: getCategoryName(d.psych.problem as ProblemCategory),
          confidence: d.psych.confidence,
          stressLevel: d.psych.stressLevel,
          anxietyLevel: d.psych.anxietyLevel,
          moodStability: d.psych.moodStability
        }
      : undefined,
    portrait: canTranscript ? d.portrait : d.portrait ? { summary: d.portrait.summary } : undefined
  }));

  return { profile, dialogs, alerts };
}

export function getAlertsForUser(user: PublicAccount, status?: string): SchoolAlert[] {
  const orgIds =
    user.role === 'admin'
      ? undefined
      : user.managedOrgIds?.length
        ? user.managedOrgIds
        : user.orgId
          ? [user.orgId]
          : undefined;
  return listAlerts({
    status: status as SchoolAlert['status'] | undefined,
    orgIds
  });
}
