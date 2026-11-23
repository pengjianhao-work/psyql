import React, { useEffect, useMemo, useState } from 'react';
import { CollegeOption, fetchCollegeOptions } from '../api';
import { useSchoolSession } from './useSchoolSession';
import {
  formatCapabilityValue,
  getScopeDescription,
  SCHOOL_CAPABILITIES
} from './schoolPermissions';

export const SchoolPermissionsCard: React.FC = () => {
  const { sessionUser } = useSchoolSession();
  const [open, setOpen] = useState(false);
  const [colleges, setColleges] = useState<CollegeOption[]>([]);

  const isAdmin = sessionUser.role === 'admin';
  const isTeacher = sessionUser.role === 'teacher';
  const roleLabel = isAdmin ? '管理员' : isTeacher ? '教师' : '辅导员';

  useEffect(() => {
    fetchCollegeOptions()
      .then((d) => setColleges(d.colleges))
      .catch(() => setColleges([]));
  }, []);

  const managedOrgNames = useMemo(() => {
    if (!sessionUser.managedOrgIds?.length) return [];
    return sessionUser.managedOrgIds.map(
      (id) => colleges.find((c) => c.id === id)?.name || id
    );
  }, [sessionUser.managedOrgIds, colleges]);

  const scopeText = getScopeDescription(sessionUser, managedOrgNames);

  return (
    <div className="school-card school-permissions-card">
      <button
        type="button"
        className="school-permissions-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>
          {roleLabel}权限说明
          <small className="muted"> · {scopeText}</small>
        </span>
        <span aria-hidden="true">{open ? '▼' : '▶'}</span>
      </button>

      {open && (
        <div className="school-permissions-body">
          <p className="muted school-permissions-intro">
            {isAdmin
              ? '您可访问全校学生数据，并管理用户与导出报表。'
              : isTeacher
                ? '您仅可查看本院系的聚合数据（看板、情绪气象、热力图），无法定位到个人。'
                : '您仅可访问管辖院系内的学生与告警；对话原文需学生授权。'}
          </p>
          <table className="school-permissions-table">
            <thead>
              <tr>
                <th>能力</th>
                <th>{isAdmin ? '管理员' : `您的权限（${roleLabel}）`}</th>
              </tr>
            </thead>
            <tbody>
              {SCHOOL_CAPABILITIES.map((cap) => (
                <tr key={cap.id}>
                  <td>
                    {cap.label}
                    {cap.note && <small className="muted school-perm-note">{cap.note}</small>}
                  </td>
                  <td>{formatCapabilityValue(cap, sessionUser.role)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sessionUser.permissions && sessionUser.permissions.length > 0 && (
            <p className="muted school-perm-flags">
              系统权限标识：
              {sessionUser.permissions.map((p) => (
                <code key={p} className="school-perm-code">
                  {p}
                </code>
              ))}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
