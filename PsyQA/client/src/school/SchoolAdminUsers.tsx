import React, { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  AdminUserItem,
  CollegeOption,
  createAdminUser,
  fetchAdminUsers,
  fetchCollegeOptions,
  getErrorMessage,
  patchAdminUser,
  UserRole
} from '../api';
import { useSchoolSession } from './useSchoolSession';

const ROLE_LABELS: Record<UserRole, string> = {
  student: '学生',
  counselor: '辅导员',
  admin: '管理员'
};

const SchoolAdminUsers: React.FC = () => {
  const { sessionUser } = useSchoolSession();
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [colleges, setColleges] = useState<CollegeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('student');
  const [formOrgId, setFormOrgId] = useState('');
  const [formNewPassword, setFormNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ users: list }, col] = await Promise.all([
        fetchAdminUsers(),
        fetchCollegeOptions()
      ]);
      setUsers(list);
      setColleges(col.colleges);
      if (!formOrgId && col.colleges[0]) setFormOrgId(col.colleges[0].id);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [formOrgId]);

  useEffect(() => {
    load();
  }, [load]);

  if (sessionUser.role !== 'admin') {
    return <Navigate to="/school/dashboard" replace />;
  }

  const resetForm = () => {
    setFormUsername('');
    setFormPassword('');
    setFormDisplayName('');
    setFormRole('student');
    setFormNewPassword('');
    setEditId(null);
    setShowCreate(false);
  };

  const startEdit = (u: AdminUserItem) => {
    setEditId(u.id);
    setFormDisplayName(u.displayName);
    setFormRole(u.role);
    setFormOrgId(u.orgId || formOrgId);
    setShowCreate(false);
  };

  const handleCreate = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await createAdminUser({
        username: formUsername,
        password: formPassword,
        displayName: formDisplayName || undefined,
        role: formRole,
        orgId: formOrgId || undefined
      });
      resetForm();
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editId) return;
    setSubmitting(true);
    setError(null);
    try {
      await patchAdminUser(editId, {
        displayName: formDisplayName,
        role: formRole,
        orgId: formOrgId,
        newPassword: formNewPassword || undefined
      });
      resetForm();
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="school-admin-users">
      <div className="school-page-head">
        <div>
          <h2>用户管理</h2>
          <p className="muted school-page-sub">管理员专属 · 创建账号、调整角色与院系</p>
        </div>
        <button type="button" className="save-care-btn" onClick={() => { resetForm(); setShowCreate(true); }}>
          + 新建用户
        </button>
      </div>

      {error && <div className="school-card school-error-block">{error}</div>}

      {(showCreate || editId) && (
        <div className="school-card school-admin-form">
          <h3>{editId ? '编辑用户' : '新建用户'}</h3>
          {!editId && (
            <>
              <label className="school-admin-field">
                用户名
                <input value={formUsername} onChange={(e) => setFormUsername(e.target.value)} />
              </label>
              <label className="school-admin-field">
                初始密码
                <input type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} />
              </label>
            </>
          )}
          <label className="school-admin-field">
            显示名称
            <input value={formDisplayName} onChange={(e) => setFormDisplayName(e.target.value)} />
          </label>
          <label className="school-admin-field">
            角色
            <select value={formRole} onChange={(e) => setFormRole(e.target.value as UserRole)}>
              <option value="student">学生</option>
              <option value="counselor">辅导员</option>
              <option value="admin">管理员</option>
            </select>
          </label>
          <label className="school-admin-field">
            院系
            <select value={formOrgId} onChange={(e) => setFormOrgId(e.target.value)}>
              {colleges.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          {editId && (
            <label className="school-admin-field">
              重置密码（留空则不修改）
              <input type="password" value={formNewPassword} onChange={(e) => setFormNewPassword(e.target.value)} />
            </label>
          )}
          <div className="school-admin-form-actions">
            <button
              type="button"
              className="save-care-btn"
              disabled={submitting}
              onClick={editId ? handleUpdate : handleCreate}
            >
              {submitting ? '保存中…' : '保存'}
            </button>
            <button type="button" className="school-btn-secondary" onClick={resetForm}>
              取消
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="muted">加载用户列表…</p>
      ) : (
        <div className="school-card school-admin-table-wrap">
          <table className="school-admin-table">
            <thead>
              <tr>
                <th>用户</th>
                <th>角色</th>
                <th>院系</th>
                <th>班级/学号</th>
                <th>创建时间</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <span className="school-admin-user-cell">
                      {u.avatar} {u.displayName}
                      <small>@{u.username}</small>
                    </span>
                  </td>
                  <td>{ROLE_LABELS[u.role]}</td>
                  <td>{u.orgName || u.orgId || '—'}</td>
                  <td>
                    {u.className || '—'}
                    {u.studentNo ? ` · ${u.studentNo}` : ''}
                  </td>
                  <td>{new Date(u.createdAt).toLocaleDateString('zh-CN')}</td>
                  <td>
                    <button type="button" className="school-link-btn" onClick={() => startEdit(u)}>
                      编辑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default SchoolAdminUsers;
