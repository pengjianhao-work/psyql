/**
 * 创建 20 个学生 + 2 个管理账户，并按档位执行咨询压测：
 *   student01-05  → 3 轮
 *   student06-10  → 10 轮
 *   student11-15  → 15 轮
 *   student16-20  → 25 轮
 * 合计 265 轮
 *
 * 用法:
 *   npx ts-node server/scripts/seed_and_load_test.ts
 *   npx ts-node server/scripts/seed_and_load_test.ts --load-only
 *   npx ts-node server/scripts/seed_and_load_test.ts --load-only --resume --parallel=5
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { promisify } from 'util';
import axios from 'axios';

const scryptAsync = promisify(crypto.scrypt);

const API = process.env.PSYQA_API_URL || 'http://localhost:3001';
const STUDENT_PASSWORD = process.env.TEST_STUDENT_PASSWORD || 'Student123456';
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'Admin123456';

const accountsPath = path.join(__dirname, '..', 'data', 'accounts.json');
const progressPath = path.join(__dirname, '..', 'data', 'load_test_progress.json');

type UserRole = 'student' | 'counselor' | 'admin';

interface AccountRecord {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string;
  avatar: string;
  role: UserRole;
  orgId?: string;
  className?: string;
  studentNo?: string;
  managedOrgIds?: string[];
  createdAt: string;
}

interface AccountFile {
  users: AccountRecord[];
}

interface RoundTier {
  from: number;
  to: number;
  rounds: number;
  label: string;
}

const ROUND_TIERS: RoundTier[] = [
  { from: 1, to: 5, rounds: 3, label: '3轮组' },
  { from: 6, to: 10, rounds: 10, label: '10轮组' },
  { from: 11, to: 15, rounds: 15, label: '15轮组' },
  { from: 16, to: 20, rounds: 25, label: '25轮组' }
];

const TOTAL_ROUNDS = ROUND_TIERS.reduce((sum, t) => sum + (t.to - t.from + 1) * t.rounds, 0);

async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const buf = (await scryptAsync(plain, salt, 64)) as Buffer;
  return `${salt}:${buf.toString('hex')}`;
}

const TEST_STUDENTS: Omit<AccountRecord, 'passwordHash' | 'createdAt' | 'username'>[] = [
  { id: 'acc_stu_01', displayName: '李明', avatar: '👦', role: 'student', orgId: 'cs-demo', className: '软件2301', studentNo: '20240101' },
  { id: 'acc_stu_02', displayName: '王芳', avatar: '👧', role: 'student', orgId: 'cs-demo', className: '软件2301', studentNo: '20240102' },
  { id: 'acc_stu_03', displayName: '张伟', avatar: '👨', role: 'student', orgId: 'cs-demo', className: '软件2302', studentNo: '20240103' },
  { id: 'acc_stu_04', displayName: '刘静', avatar: '👩', role: 'student', orgId: 'cs-demo', className: '软件2302', studentNo: '20240104' },
  { id: 'acc_stu_05', displayName: '陈浩', avatar: '🧑', role: 'student', orgId: 'cs-demo', className: '计科2301', studentNo: '20240105' },
  { id: 'acc_stu_06', displayName: '赵敏', avatar: '👱‍♀️', role: 'student', orgId: 'cs-demo', className: '计科2301', studentNo: '20240106' },
  { id: 'acc_stu_07', displayName: '孙磊', avatar: '🧔', role: 'student', orgId: 'math-demo', className: '数学2301', studentNo: '20240107' },
  { id: 'acc_stu_08', displayName: '周婷', avatar: '👩‍🎓', role: 'student', orgId: 'math-demo', className: '数学2301', studentNo: '20240108' },
  { id: 'acc_stu_09', displayName: '吴强', avatar: '👨‍🎓', role: 'student', orgId: 'math-demo', className: '数学2302', studentNo: '20240109' },
  { id: 'acc_stu_10', displayName: '郑雪', avatar: '🙂', role: 'student', orgId: 'math-demo', className: '数学2302', studentNo: '20240110' },
  { id: 'acc_stu_11', displayName: '黄凯', avatar: '👦', role: 'student', orgId: 'cs-demo', className: '软件2303', studentNo: '20240111' },
  { id: 'acc_stu_12', displayName: '林娜', avatar: '👧', role: 'student', orgId: 'cs-demo', className: '软件2303', studentNo: '20240112' },
  { id: 'acc_stu_13', displayName: '何俊', avatar: '🧑', role: 'student', orgId: 'cs-demo', className: '计科2302', studentNo: '20240113' },
  { id: 'acc_stu_14', displayName: '高雅', avatar: '👩', role: 'student', orgId: 'cs-demo', className: '计科2302', studentNo: '20240114' },
  { id: 'acc_stu_15', displayName: '罗斌', avatar: '👨', role: 'student', orgId: 'math-demo', className: '数学2303', studentNo: '20240115' },
  { id: 'acc_stu_16', displayName: '梁悦', avatar: '👩‍🎓', role: 'student', orgId: 'math-demo', className: '数学2303', studentNo: '20240116' },
  { id: 'acc_stu_17', displayName: '宋哲', avatar: '🧔', role: 'student', orgId: 'cs-demo', className: '软件2304', studentNo: '20240117' },
  { id: 'acc_stu_18', displayName: '唐琳', avatar: '👱‍♀️', role: 'student', orgId: 'cs-demo', className: '软件2304', studentNo: '20240118' },
  { id: 'acc_stu_19', displayName: '冯刚', avatar: '👨‍🎓', role: 'student', orgId: 'math-demo', className: '数学2304', studentNo: '20240119' },
  { id: 'acc_stu_20', displayName: '曹慧', avatar: '🙂', role: 'student', orgId: 'math-demo', className: '数学2304', studentNo: '20240120' }
];

const TEST_ADMINS: Omit<AccountRecord, 'passwordHash' | 'createdAt' | 'username'>[] = [
  {
    id: 'acc_mgr_01',
    displayName: '王辅导员',
    avatar: '🧑‍🏫',
    role: 'counselor',
    orgId: 'cs-demo',
    managedOrgIds: ['cs-demo', 'math-demo']
  },
  {
    id: 'acc_mgr_02',
    displayName: '李管理员',
    avatar: '🛡️',
    role: 'admin',
    orgId: 'cs-demo',
    managedOrgIds: ['cs-demo', 'math-demo']
  }
];

const QUESTIONS = [
  '最近学习压力很大，总是学不进去怎么办？',
  '我感觉很孤独，在宿舍没有可以说话的朋友',
  '和室友关系不好，每天回宿舍都很压抑',
  '担心考研/就业失败，对未来很迷茫',
  '总是情绪低落，对什么都提不起兴趣',
  '考试前特别焦虑，晚上失眠',
  '和父母沟通困难，一说就吵架',
  '失恋了走不出来，影响上课',
  '觉得自己一无是处，很自卑',
  '最近注意力无法集中，效率很低',
  '经常莫名烦躁，容易对小事发火',
  '社团活动太多，平衡不了学业',
  '身体很累但脑子停不下来',
  '不敢拒绝别人，活得很累',
  '看到同学都比我优秀，很焦虑',
  '长时间刷手机后更加空虚',
  '对专业没兴趣，不知道要不要转专业',
  '家里经济压力让我很有负担',
  '社交场合紧张，害怕被评价',
  '最近噩梦多，白天精神很差',
  '总觉得自己是累赘，拖累别人',
  '小组作业被孤立，不知道怎么办',
  '实习面试失败，怀疑自己的能力',
  '每天起床都很困难，缺乏动力',
  '想找人倾诉但怕给别人添麻烦',
  '对未来完全没有方向感',
  '一遇到批评就崩溃',
  '经常回忆过去失败的经历',
  '觉得生活重复且没有意义',
  '最近食欲变化很大，体重波动'
];

function studentUsername(index1: number): string {
  return `student${String(index1).padStart(2, '0')}`;
}

function roundsForStudent(index1: number): number {
  const tier = ROUND_TIERS.find((t) => index1 >= t.from && index1 <= t.to);
  return tier?.rounds ?? 3;
}

function tierLabel(index1: number): string {
  const tier = ROUND_TIERS.find((t) => index1 >= t.from && index1 <= t.to);
  return tier?.label ?? '未知组';
}

async function upsertAccounts(): Promise<{ students: string[]; admins: string[] }> {
  let data: AccountFile = { users: [] };
  if (fs.existsSync(accountsPath)) {
    data = JSON.parse(fs.readFileSync(accountsPath, 'utf8')) as AccountFile;
  }
  if (!Array.isArray(data.users)) data.users = [];

  const studentUsernames: string[] = [];
  for (let i = 0; i < TEST_STUDENTS.length; i++) {
    const username = studentUsername(i + 1);
    studentUsernames.push(username);
    const spec = TEST_STUDENTS[i];
    const existing = data.users.find((u) => u.username === username || u.id === spec.id);
    if (existing) {
      Object.assign(existing, { ...spec, username });
      if (!existing.passwordHash) {
        existing.passwordHash = await hashPassword(STUDENT_PASSWORD);
      }
    } else {
      data.users.push({
        ...spec,
        username,
        passwordHash: await hashPassword(STUDENT_PASSWORD),
        createdAt: new Date().toISOString()
      });
    }
  }

  const adminUsernames: string[] = [];
  const adminNames = ['counselor_test', 'admin_test'];
  for (let i = 0; i < TEST_ADMINS.length; i++) {
    const username = adminNames[i];
    adminUsernames.push(username);
    const spec = TEST_ADMINS[i];
    const existing = data.users.find((u) => u.username === username || u.id === spec.id);
    if (existing) {
      Object.assign(existing, { ...spec, username });
      if (!existing.passwordHash) {
        existing.passwordHash = await hashPassword(ADMIN_PASSWORD);
      }
    } else {
      data.users.push({
        ...spec,
        username,
        passwordHash: await hashPassword(ADMIN_PASSWORD),
        createdAt: new Date().toISOString()
      });
    }
  }

  fs.mkdirSync(path.dirname(accountsPath), { recursive: true });
  fs.writeFileSync(accountsPath, JSON.stringify(data, null, 2), 'utf8');
  return { students: studentUsernames, admins: adminUsernames };
}

async function login(username: string, password: string): Promise<string> {
  const { data } = await axios.post(`${API}/api/auth/login`, { username, password }, { timeout: 15000 });
  if (!data?.token) throw new Error(`登录失败 ${username}: 无 token`);
  return data.token as string;
}

async function ask(
  token: string,
  userId: string,
  username: string,
  question: string,
  globalRound: number,
  studentRound: number,
  studentTotal: number
): Promise<{ risk: string; hasPortrait: boolean; ms: number }> {
  const maxAttempts = 5;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const start = Date.now();
    try {
      const { data } = await axios.post(
        `${API}/api/questions/ask`,
        { question, userId },
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 180000
        }
      );
      const ms = Date.now() - start;
      const hasPortrait = Boolean(data.portrait?.summary);
      const risk = data.risk?.level ?? '?';
      return { risk, hasPortrait, ms };
    } catch (err: unknown) {
      lastErr = err;
      const retryable =
        axios.isAxiosError(err) &&
        (err.code === 'ECONNRESET' ||
          err.code === 'ECONNABORTED' ||
          err.code === 'ETIMEDOUT' ||
          (err.response?.status !== undefined && [502, 503, 504].includes(err.response.status)) ||
          (err.response?.status === 429 &&
            String(err.response.data?.error || '').includes('still processing')));
      if (!retryable || attempt === maxAttempts) break;
      const waitMs =
        err.response?.status === 429
          ? 45000
          : err.response?.status === 503
            ? attempt * 4000
            : attempt * 2500;
      console.warn(`  [RETRY ${attempt}/${maxAttempts - 1}] ${username} 第 ${studentRound} 轮，${waitMs}ms 后重试…`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

interface ProgressState {
  completed: Record<string, number>;
  stats: { ok: number; fail: number; totalMs: number };
}

function loadProgress(): ProgressState {
  if (!fs.existsSync(progressPath)) {
    return { completed: {}, stats: { ok: 0, fail: 0, totalMs: 0 } };
  }
  try {
    return JSON.parse(fs.readFileSync(progressPath, 'utf8')) as ProgressState;
  } catch {
    return { completed: {}, stats: { ok: 0, fail: 0, totalMs: 0 } };
  }
}

function saveProgress(state: ProgressState): void {
  fs.writeFileSync(progressPath, JSON.stringify(state, null, 2), 'utf8');
}

function parseParallelArg(): number {
  const flag = process.argv.find((a) => a.startsWith('--parallel'));
  if (!flag) return 1;
  const raw = flag.includes('=') ? flag.split('=')[1] : process.argv[process.argv.indexOf(flag) + 1];
  const n = parseInt(String(raw || '1'), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 4);
}

let progressChain: Promise<void> = Promise.resolve();

async function withProgressLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = progressChain.then(fn, fn);
  progressChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function runStudentLoad(
  studentIndex: number,
  progress: ProgressState,
  continueOnError: boolean
): Promise<void> {
  const username = studentUsername(studentIndex);
  const planRounds = roundsForStudent(studentIndex);
  const done = progress.completed[username] ?? 0;
  if (done >= planRounds) {
    console.log(`\n>> ${username} (${tierLabel(studentIndex)}) 已完成 ${done}/${planRounds}，跳过`);
    return;
  }

  console.log(`\n>> ${username} (${tierLabel(studentIndex)}) 目标 ${planRounds} 轮，已完成 ${done} 轮`);
  const token = await login(username, STUDENT_PASSWORD);
  const me = await axios.get(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  const userId = me.data.user.id as string;

  for (let r = done; r < planRounds; r++) {
    const q = QUESTIONS[(studentIndex * 7 + r * 3) % QUESTIONS.length];
    try {
      const result = await ask(token, userId, username, q, 0, r + 1, planRounds);
      await withProgressLock(async () => {
        const totalDone = Object.values(progress.completed).reduce((a, b) => a + b, 0) + 1;
        progress.stats.ok += 1;
        progress.stats.totalMs += result.ms;
        progress.completed[username] = r + 1;
        saveProgress(progress);
        console.log(
          `  [${totalDone}/${TOTAL_ROUNDS}] ${username} (${r + 1}/${planRounds}) | ${result.ms}ms | 风险=${result.risk} | ${result.hasPortrait ? '有画像' : '无画像'} | ${q.slice(0, 20)}…`
        );
      });
    } catch (err: unknown) {
      await withProgressLock(async () => {
        progress.stats.fail += 1;
        saveProgress(progress);
      });
      const msg = axios.isAxiosError(err) ? err.message : String(err);
      console.error(`  [FAIL] ${username} 第 ${r + 1} 轮: ${msg}`);
      if (!continueOnError) throw err;
    }
  }
}

async function runLoadTest(resume: boolean, parallel: number): Promise<ProgressState> {
  const continueOnError = process.argv.includes('--continue-on-error');
  console.log(`\n=== 开始分档咨询测试（合计 ${TOTAL_ROUNDS} 轮${parallel > 1 ? `，并行 ${parallel} 人` : ''}） ===`);
  ROUND_TIERS.forEach((t) => {
    console.log(`  ${t.label}: student${String(t.from).padStart(2, '0')}-student${String(t.to).padStart(2, '0')} 各 ${t.rounds} 轮`);
  });

  const progress = resume ? loadProgress() : { completed: {}, stats: { ok: 0, fail: 0, totalMs: 0 } };
  if (!resume) {
    fs.writeFileSync(progressPath, JSON.stringify(progress, null, 2), 'utf8');
  }

  const pendingStudents: number[] = [];
  for (let s = 1; s <= TEST_STUDENTS.length; s++) {
    const username = studentUsername(s);
    const planRounds = roundsForStudent(s);
    const done = progress.completed[username] ?? 0;
    if (done < planRounds) pendingStudents.push(s);
  }

  if (parallel <= 1) {
    for (const s of pendingStudents) {
      await runStudentLoad(s, progress, continueOnError);
    }
  } else {
    let cursor = 0;
    const workers = Array.from({ length: parallel }, async () => {
      while (true) {
        const s = pendingStudents[cursor++];
        if (s === undefined) break;
        await runStudentLoad(s, progress, continueOnError);
      }
    });
    await Promise.all(workers);
  }

  return progress;
}

async function verifySchoolDashboard(adminToken: string): Promise<void> {
  const { data } = await axios.get(`${API}/api/school/dashboard`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    timeout: 15000
  });
  console.log('\n=== 学校端看板（管理账户验证） ===');
  console.log(`  累计咨询: ${data.totalConsultations}`);
  console.log(`  活跃学生: ${data.activeStudents}`);
  console.log(`  高危记录: ${data.highRiskCount}`);
  console.log(`  待处理告警: ${data.pendingAlerts}`);
}

async function waitForApi(maxWaitMs = 90000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const { data } = await axios.get(`${API}/health`, { timeout: 3000 });
      if (data?.status === 'ok') {
        await new Promise((r) => setTimeout(r, 1200));
        return;
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('API 在超时时间内未就绪');
}

async function main(): Promise<void> {
  const loadOnly = process.argv.includes('--load-only');
  const resume = process.argv.includes('--resume');

  if (!loadOnly) {
    console.log('=== 创建/更新测试账户（20 学生 + 2 管理） ===');
    const { students, admins } = await upsertAccounts();
    console.log(`  学生: ${students[0]} … ${students[students.length - 1]}  密码: ${STUDENT_PASSWORD}`);
    console.log(`  管理: ${admins.join(', ')}  密码: ${ADMIN_PASSWORD}`);
    console.log('等待 API 就绪…');
    await waitForApi();
  }

  await waitForApi();
  const parallel = parseParallelArg();
  const progress = await runLoadTest(resume, parallel);

  const counselorToken = await login('counselor_test', ADMIN_PASSWORD);
  await verifySchoolDashboard(counselorToken);

  const credPath = path.join(__dirname, '..', 'data', 'test_accounts_credentials.json');
  fs.writeFileSync(
    credPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        password: STUDENT_PASSWORD,
        adminPassword: ADMIN_PASSWORD,
        tiers: ROUND_TIERS,
        totalPlannedRounds: TOTAL_ROUNDS,
        students: TEST_STUDENTS.map((st, i) => ({
          username: studentUsername(i + 1),
          displayName: st.displayName,
          tier: tierLabel(i + 1),
          plannedRounds: roundsForStudent(i + 1),
          completedRounds: progress.completed[studentUsername(i + 1)] ?? 0
        })),
        management: [
          { username: 'counselor_test', password: ADMIN_PASSWORD, role: 'counselor', name: '王辅导员' },
          { username: 'admin_test', password: ADMIN_PASSWORD, role: 'admin', name: '李管理员' }
        ],
        lastRun: progress.stats
      },
      null,
      2
    ),
    'utf8'
  );

  console.log(`\n平均响应: ${progress.stats.ok ? Math.round(progress.stats.totalMs / progress.stats.ok) : 0}ms`);
  console.log(`成功 ${progress.stats.ok} 轮，失败 ${progress.stats.fail} 轮`);
  console.log(`凭证与进度: ${credPath}`);
  console.log(`进度文件: ${progressPath}`);
  console.log('=== 全部完成 ===');
}

main().catch((err) => {
  console.error('测试失败:', err.response?.data || err.message || err);
  process.exit(1);
});
