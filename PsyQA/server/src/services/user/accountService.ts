import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { promisify } from 'util';
import { getCollegeById, resolveOrgDisplay } from './orgService';
import { resolveDataFile } from '../../config/paths';
import { readAllAccountsFromDb, writeAllAccountsToDb } from '../../db/accountStore';

const scryptAsync = promisify(crypto.scrypt);

export type UserRole = 'student' | 'counselor' | 'admin';

export interface AccountRecord {
  id: string;
  username: string;
  passwordHash: string;
  displayName: string;
  avatar: string;
  role: UserRole;
  orgId?: string;
  studentNo?: string;
  className?: string;
  realName?: string;
  gender?: string;
  managedOrgIds?: string[];
  /** 辅导员管辖班级（与 className 匹配） */
  managedClassIds?: string[];
  allowSchoolTranscriptView?: boolean;
  createdAt: string;
}

export type PublicAccount = Omit<AccountRecord, 'passwordHash'> & {
  orgName?: string;
  schoolName?: string;
  permissions?: Permission[];
};

export { getCollegeById };

interface AccountFile {
  users: AccountRecord[];
}

const resolveDataPath = (): string => resolveDataFile('accounts.json');

const dataPath = resolveDataPath();
const USE_JSON_ONLY = process.env.PSYQA_USE_JSON_STORAGE === '1';

function readFile(): AccountFile {
  try {
    const raw = fs.readFileSync(dataPath, 'utf8');
    const data = JSON.parse(raw) as AccountFile;
    if (!Array.isArray(data.users)) return { users: [] };
    return data;
  } catch {
    return { users: [] };
  }
}

function writeFile(data: AccountFile): void {
  const dir = path.dirname(dataPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
}

function persistAccounts(data: AccountFile): void {
  if (USE_JSON_ONLY) {
    writeFile(data);
    return;
  }
  writeAllAccountsToDb(data.users);
  try {
    writeFile(data);
  } catch {
    /* JSON backup is best-effort */
  }
}

export function saveAllAccounts(users: AccountRecord[]): void {
  persistAccounts({ users });
}

function readAccountsRaw(): AccountFile {
  if (USE_JSON_ONLY) {
    return readFile();
  }
  const fromDb = readAllAccountsFromDb();
  if (fromDb.length > 0) {
    return { users: fromDb };
  }
  return readFile();
}

function mergeJsonOnlyUsers(data: AccountFile): AccountFile {
  if (USE_JSON_ONLY) return data;
  const jsonData = readFile();
  if (jsonData.users.length === 0) return data;
  const known = new Set(data.users.map((u) => u.username));
  const merged = [...data.users];
  let added = false;
  for (const u of jsonData.users) {
    if (!known.has(u.username)) {
      merged.push(normalizeAccount(u));
      known.add(u.username);
      added = true;
    }
  }
  return added ? { users: merged } : data;
}

async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const buf = (await scryptAsync(plain, salt, 64)) as Buffer;
  return `${salt}:${buf.toString('hex')}`;
}

export type Permission = string;

export function getPermissionsForRole(role: UserRole): Permission[] {
  if (role === 'admin') {
    return ['admin:*', 'school:manage', 'school:read', 'school:write', 'school:dashboard', 'school:transcripts:full'];
  }
  if (role === 'counselor') {
    return ['school:read', 'school:write', 'school:dashboard', 'school:alerts:read', 'school:students:masked'];
  }
  return ['student:self', 'consult:own', 'report:own', 'trend:own'];
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [salt, keyHex] = stored.split(':');
  if (!salt || !keyHex) return false;
  const buf = (await scryptAsync(plain, salt, 64)) as Buffer;
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== buf.length) return false;
  return crypto.timingSafeEqual(key, buf);
}

const normalizeUsername = (u: string): string => u.trim().toLowerCase();

function isValidUsername(username: string): boolean {
  const t = username.trim();
  if (t.length < 3 || t.length > 24) return false;
  return /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(t);
}

function isValidPassword(password: string): boolean {
  return password.length >= 6 && password.length <= 128;
}

function normalizeAccount(record: AccountRecord): AccountRecord {
  return {
    ...record,
    role: record.role || 'student',
    orgId: record.orgId || 'cs-demo'
  };
}

export function maskStudentDisplay(displayName?: string, studentNo?: string): string {
  if (displayName && displayName.length >= 2) {
    return `${displayName[0]}**`;
  }
  if (studentNo && studentNo.length >= 4) {
    return `${studentNo.slice(0, 2)}****`;
  }
  return '学生**';
}

export function enrichPublicAccount(record: Omit<AccountRecord, 'passwordHash'>): PublicAccount {
  const org = resolveOrgDisplay(record.orgId);
  return {
    ...record,
    orgName: org.collegeName,
    schoolName: org.schoolName,
    permissions: getPermissionsForRole(record.role)
  };
}

async function ensureSeedUsers(data: AccountFile): Promise<{ data: AccountFile; changed: boolean }> {
  let changed = false;
  const nextUsers = data.users.map((u) => {
    const normalized = normalizeAccount(u);
    if (normalized.role !== u.role || normalized.orgId !== u.orgId) changed = true;
    return normalized;
  });

  const ensure = async (
    username: string,
    password: string,
    fields: Omit<AccountRecord, 'username' | 'passwordHash' | 'createdAt'>
  ) => {
    const u = normalizeUsername(username);
    const existing = nextUsers.find((x) => x.username === u);
    if (existing) return;
    nextUsers.push({
      ...fields,
      username: u,
      passwordHash: await hashPassword(password),
      createdAt: new Date().toISOString()
    });
    changed = true;
  };

  await ensure('demo', 'demo123', {
    id: 'acc_demo',
    displayName: '演示学生',
    avatar: '👤',
    role: 'student',
    orgId: 'cs-demo',
    studentNo: '20240001'
  });
  await ensure('counselor', 'counselor123', {
    id: 'acc_counselor',
    displayName: '张老师',
    avatar: '🧑‍🏫',
    role: 'counselor',
    orgId: 'cs-demo',
    managedOrgIds: ['cs-demo']
  });
  await ensure('admin', 'admin123', {
    id: 'acc_admin',
    displayName: '系统管理员',
    avatar: '🛡️',
    role: 'admin',
    orgId: 'cs-demo',
    managedOrgIds: ['cs-demo']
  });

  return {
    data: { users: nextUsers },
    changed: changed || nextUsers.length !== data.users.length
  };
}

export async function loadAccounts(): Promise<AccountFile> {
  const dbWasEmpty = !USE_JSON_ONLY && readAllAccountsFromDb().length === 0;
  let data = readAccountsRaw();
  const beforeMerge = data.users.length;
  data = mergeJsonOnlyUsers(data);
  const merged = data.users.length !== beforeMerge;

  const seeded = await ensureSeedUsers(data);
  data = seeded.data;

  if (dbWasEmpty && data.users.length > 0) {
    persistAccounts(data);
  } else if (merged || seeded.changed) {
    persistAccounts(data);
  }
  return data;
}

export async function registerAccount(
  username: string,
  password: string,
  displayName?: string
): Promise<{ ok: true; user: PublicAccount } | { ok: false; error: string }> {
  const u = normalizeUsername(username);
  if (!isValidUsername(u)) {
    return { ok: false, error: '用户名需 3～24 位，仅含字母、数字、下划线或中文' };
  }
  if (!isValidPassword(password)) {
    return { ok: false, error: '密码长度为 6～128 个字符' };
  }
  let data = await loadAccounts();
  if (data.users.some((x) => x.username === u)) {
    return { ok: false, error: '该用户名已被注册' };
  }
  const id = `acc_${crypto.randomBytes(8).toString('hex')}`;
  const name = (displayName || username).trim().slice(0, 32) || username;
  const record: AccountRecord = normalizeAccount({
    id,
    username: u,
    passwordHash: await hashPassword(password),
    displayName: name,
    avatar: '🙂',
    role: 'student',
    orgId: 'cs-demo',
    createdAt: new Date().toISOString()
  });
  data.users.push(record);
  persistAccounts(data);
  const { passwordHash, ...rest } = record;
  return { ok: true, user: enrichPublicAccount(rest) };
}

export async function updateStudentProfile(
  userId: string,
  updates: {
    className?: string;
    orgId?: string;
    displayName?: string;
    avatar?: string;
    studentNo?: string;
    realName?: string;
    gender?: string;
    allowSchoolTranscriptView?: boolean;
  }
): Promise<{ ok: true; user: PublicAccount } | { ok: false; error: string }> {
  const data = await loadAccounts();
  const idx = data.users.findIndex((x) => x.id === userId);
  if (idx < 0) return { ok: false, error: '账号不存在' };

  const record = data.users[idx];
  if (record.role !== 'student') {
    return { ok: false, error: '仅学生可修改个人资料' };
  }

  if (updates.displayName !== undefined) {
    const name = updates.displayName.trim();
    if (name.length < 1 || name.length > 32) {
      return { ok: false, error: '昵称 1–32 字' };
    }
    record.displayName = name;
  }

  if (updates.avatar !== undefined) {
    const avatar = updates.avatar.trim();
    if (avatar.length < 1 || avatar.length > 8) {
      return { ok: false, error: '头像无效' };
    }
    record.avatar = avatar;
  }

  if (updates.orgId !== undefined) {
    const orgId = updates.orgId.trim();
    if (orgId && !getCollegeById(orgId)) {
      return { ok: false, error: '院系无效' };
    }
    record.orgId = orgId || record.orgId;
  }

  if (updates.className !== undefined) {
    record.className = updates.className.trim() || undefined;
  }
  if (updates.studentNo !== undefined) {
    record.studentNo = updates.studentNo.trim() || undefined;
  }
  if (updates.realName !== undefined) {
    record.realName = updates.realName.trim() || undefined;
  }
  if (updates.gender !== undefined) {
    record.gender = updates.gender.trim() || undefined;
  }
  if (updates.allowSchoolTranscriptView !== undefined) {
    record.allowSchoolTranscriptView = updates.allowSchoolTranscriptView;
  }

  data.users[idx] = record;
  persistAccounts(data);
  const { passwordHash, ...rest } = record;
  return { ok: true, user: enrichPublicAccount(rest) };
}

export async function verifyLogin(
  username: string,
  password: string
): Promise<{ ok: true; user: PublicAccount } | { ok: false; error: string }> {
  const u = normalizeUsername(username);
  const data = await loadAccounts();
  const found = data.users.find((x) => x.username === u);
  if (!found) {
    return { ok: false, error: '用户名或密码错误' };
  }
  const match = await verifyPassword(password, found.passwordHash);
  if (!match) {
    return { ok: false, error: '用户名或密码错误' };
  }
  const { passwordHash, ...rest } = normalizeAccount(found);
  return { ok: true, user: enrichPublicAccount(rest) };
}

export async function getUserById(userId: string): Promise<PublicAccount | null> {
  const data = await loadAccounts();
  const found = data.users.find((x) => x.id === userId);
  if (!found) {
    return null;
  }
  const { passwordHash, ...rest } = normalizeAccount(found);
  return enrichPublicAccount(rest);
}
