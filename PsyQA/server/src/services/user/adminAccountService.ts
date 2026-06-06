import crypto from 'crypto';
import { promisify } from 'util';
import {
  AccountRecord,
  PublicAccount,
  UserRole,
  enrichPublicAccount,
  loadAccounts,
  getCollegeById,
  saveAllAccounts
} from './accountService';
import { resolveOrgDisplay } from './orgService';

const scryptAsync = promisify(crypto.scrypt);

async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const buf = (await scryptAsync(plain, salt, 64)) as Buffer;
  return `${salt}:${buf.toString('hex')}`;
}

export interface AdminUserListItem {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  role: UserRole;
  orgId?: string;
  orgName?: string;
  className?: string;
  studentNo?: string;
  realName?: string;
  gender?: string;
  managedOrgIds?: string[];
  allowSchoolTranscriptView?: boolean;
  createdAt: string;
}

function toListItem(record: AccountRecord): AdminUserListItem {
  const { passwordHash: _, ...rest } = record;
  const pub = enrichPublicAccount(rest);
  return {
    id: pub.id,
    username: pub.username,
    displayName: pub.displayName,
    avatar: pub.avatar,
    role: pub.role,
    orgId: pub.orgId,
    orgName: pub.orgName,
    className: pub.className,
    studentNo: pub.studentNo,
    realName: pub.realName,
    gender: pub.gender,
    managedOrgIds: pub.managedOrgIds,
    allowSchoolTranscriptView: pub.allowSchoolTranscriptView,
    createdAt: pub.createdAt
  };
}

export async function listUsersForAdmin(): Promise<AdminUserListItem[]> {
  const data = await loadAccounts();
  return data.users.map(toListItem).sort((a, b) => a.username.localeCompare(b.username));
}

export async function createUserByAdmin(payload: {
  username: string;
  password: string;
  displayName?: string;
  role: UserRole;
  orgId?: string;
  managedOrgIds?: string[];
}): Promise<{ ok: true; user: AdminUserListItem } | { ok: false; error: string }> {
  const u = payload.username.trim().toLowerCase();
  if (u.length < 3 || u.length > 24) {
    return { ok: false, error: '用户名需 3～24 位' };
  }
  if (payload.password.length < 6) {
    return { ok: false, error: '密码至少 6 位' };
  }
  if (!['student', 'counselor', 'admin'].includes(payload.role)) {
    return { ok: false, error: '无效的角色' };
  }

  const data = await loadAccounts();
  if (data.users.some((x) => x.username === u)) {
    return { ok: false, error: '用户名已存在' };
  }

  const orgId = payload.orgId?.trim() || 'cs-demo';
  if (!getCollegeById(orgId)) {
    return { ok: false, error: '院系无效' };
  }

  const record: AccountRecord = {
    id: `acc_${crypto.randomBytes(8).toString('hex')}`,
    username: u,
    passwordHash: await hashPassword(payload.password),
    displayName: (payload.displayName || u).trim().slice(0, 32),
    avatar: payload.role === 'counselor' ? '🧑‍🏫' : payload.role === 'admin' ? '🛡️' : '🎓',
    role: payload.role,
    orgId,
    managedOrgIds:
      payload.role === 'counselor' || payload.role === 'admin'
        ? payload.managedOrgIds?.length
          ? payload.managedOrgIds
          : [orgId]
        : undefined,
    createdAt: new Date().toISOString()
  };

  data.users.push(record);
  saveAllAccounts(data.users);
  return { ok: true, user: toListItem(record) };
}

export async function updateUserByAdmin(
  adminId: string,
  targetId: string,
  updates: {
    displayName?: string;
    role?: UserRole;
    orgId?: string;
    className?: string;
    studentNo?: string;
    managedOrgIds?: string[];
    allowSchoolTranscriptView?: boolean;
    newPassword?: string;
  }
): Promise<{ ok: true; user: AdminUserListItem } | { ok: false; error: string }> {
  const data = await loadAccounts();
  const idx = data.users.findIndex((x) => x.id === targetId);
  if (idx < 0) return { ok: false, error: '用户不存在' };

  const record = data.users[idx];

  if (updates.role !== undefined) {
    if (!['student', 'counselor', 'admin'].includes(updates.role)) {
      return { ok: false, error: '无效的角色' };
    }
    if (targetId === adminId && updates.role !== 'admin') {
      return { ok: false, error: '不能修改自己的管理员角色' };
    }
    record.role = updates.role;
    if (updates.role === 'counselor' || updates.role === 'admin') {
      record.managedOrgIds = updates.managedOrgIds?.length
        ? updates.managedOrgIds
        : record.managedOrgIds?.length
          ? record.managedOrgIds
          : [record.orgId || 'cs-demo'];
    } else {
      record.managedOrgIds = undefined;
    }
  }

  if (updates.managedOrgIds !== undefined && (record.role === 'counselor' || record.role === 'admin')) {
    record.managedOrgIds = updates.managedOrgIds;
  }

  if (updates.orgId !== undefined) {
    const orgId = updates.orgId.trim();
    if (!getCollegeById(orgId)) return { ok: false, error: '院系无效' };
    record.orgId = orgId;
  }

  if (updates.displayName !== undefined) {
    const name = updates.displayName.trim();
    if (name.length < 1 || name.length > 20) return { ok: false, error: '昵称 1–20 字' };
    record.displayName = name;
  }

  if (updates.className !== undefined) record.className = updates.className.trim() || undefined;
  if (updates.studentNo !== undefined) record.studentNo = updates.studentNo.trim() || undefined;

  if (updates.allowSchoolTranscriptView !== undefined && record.role === 'student') {
    record.allowSchoolTranscriptView = updates.allowSchoolTranscriptView;
  }

  if (updates.newPassword !== undefined) {
    if (updates.newPassword.length < 6) return { ok: false, error: '新密码至少 6 位' };
    record.passwordHash = await hashPassword(updates.newPassword);
  }

  data.users[idx] = record;
  saveAllAccounts(data.users);
  return { ok: true, user: toListItem(record) };
}
