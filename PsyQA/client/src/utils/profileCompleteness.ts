import { AuthUserPublic } from '../api';

const PROFILE_FIELDS: Array<{ key: keyof AuthUserPublic; label: string; filled: (u: AuthUserPublic) => boolean }> = [
  { key: 'realName', label: '姓名', filled: (u) => Boolean(u.realName?.trim()) },
  { key: 'gender', label: '性别', filled: (u) => Boolean(u.gender) },
  { key: 'studentNo', label: '学号', filled: (u) => Boolean(u.studentNo?.trim()) },
  { key: 'orgId', label: '院系', filled: (u) => Boolean(u.orgId || u.orgName) },
  { key: 'className', label: '班级', filled: (u) => Boolean(u.className?.trim()) }
];

export function getStudentProfileCompleteness(user: AuthUserPublic): {
  percent: number;
  missing: string[];
  complete: boolean;
} {
  const missing = PROFILE_FIELDS.filter((f) => !f.filled(user)).map((f) => f.label);
  const percent = Math.round(((PROFILE_FIELDS.length - missing.length) / PROFILE_FIELDS.length) * 100);
  return { percent, missing, complete: missing.length === 0 };
}

export function formatStudentIdentityLine(user: AuthUserPublic): string {
  const parts: string[] = [];
  if (user.orgName) parts.push(user.orgName);
  if (user.className) parts.push(user.className);
  if (user.studentNo) parts.push(`学号 ${user.studentNo}`);
  return parts.join(' · ');
}
