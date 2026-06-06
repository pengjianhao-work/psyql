import { AuthUserPublic, UserRole } from '../api';

export type SchoolCapability = {
  id: string;
  label: string;
  counselor: boolean | 'scope' | 'conditional';
  admin: boolean | 'all';
  note?: string;
};

/** 学校端能力对照（与后端 requireRole / requirePermission 一致） */
export const SCHOOL_CAPABILITIES: SchoolCapability[] = [
  {
    id: 'dashboard',
    label: '数据看板（咨询量、风险、情绪分布等）',
    counselor: 'scope',
    admin: 'all'
  },
  {
    id: 'alerts',
    label: '风险告警（查看、指派、备注、状态流转）',
    counselor: 'scope',
    admin: 'all'
  },
  {
    id: 'students',
    label: '学生列表与档案详情',
    counselor: 'scope',
    admin: 'all'
  },
  {
    id: 'transcript',
    label: '咨询对话原文',
    counselor: 'conditional',
    admin: 'all',
    note: '学生已授权且属于您管辖院系时可查看；未授权仅见摘要与指标'
  },
  {
    id: 'export',
    label: '导出全校报表（CSV / JSON）',
    counselor: false,
    admin: true
  },
  {
    id: 'users',
    label: '用户管理（新建/编辑账号、角色、院系）',
    counselor: false,
    admin: true
  },
  {
    id: 'knowledge',
    label: '知识库更新与系统统计',
    counselor: false,
    admin: true,
    note: '管理员在后台 API 触发，界面入口以实际部署为准'
  }
];

export function getScopeDescription(user: AuthUserPublic, managedOrgNames: string[]): string {
  if (user.role === 'admin') {
    return user.schoolName ? `${user.schoolName} · 全校数据` : '全校数据';
  }
  if (managedOrgNames.length > 0) {
    return `管辖院系：${managedOrgNames.join('、')}`;
  }
  if (user.orgName) {
    return `数据范围：${user.orgName}`;
  }
  return '数据范围：本院系（默认）';
}

export function formatCapabilityValue(
  cap: SchoolCapability,
  role: UserRole
): string {
  const v = role === 'admin' ? cap.admin : cap.counselor;
  if (v === true || v === 'all') return '允许';
  if (v === false) return '不允许';
  if (v === 'scope') return '仅管辖范围';
  if (v === 'conditional') return '条件允许';
  return '—';
}
