import React, { useEffect, useState } from 'react';
import {
  AuthUserPublic,
  AVATAR_PRESETS,
  CollegeOption,
  fetchCollegeOptions,
  getErrorMessage,
  GENDER_OPTIONS,
  formatGender,
  updateStudentProfileRequest,
  type StudentGender
} from '../api';

interface StudentProfileCardProps {
  user: AuthUserPublic;
  onUserUpdate: (user: AuthUserPublic) => void;
  /** 弹窗模式（点击顶栏头像打开） */
  modal?: boolean;
  open?: boolean;
  onClose?: () => void;
}

export const StudentProfileCard: React.FC<StudentProfileCardProps> = ({
  user,
  onUserUpdate,
  modal = false,
  open = true,
  onClose
}) => {
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(user.displayName);
  const [avatarDraft, setAvatarDraft] = useState(user.avatar);
  const [studentNoDraft, setStudentNoDraft] = useState(user.studentNo ?? '');
  const [classDraft, setClassDraft] = useState(user.className ?? '');
  const [orgDraft, setOrgDraft] = useState(user.orgId ?? '');
  const [genderDraft, setGenderDraft] = useState<StudentGender | ''>(user.gender ?? '');
  const [allowTranscriptDraft, setAllowTranscriptDraft] = useState(
    user.allowSchoolTranscriptView !== false
  );
  const [colleges, setColleges] = useState<CollegeOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState(false);

  useEffect(() => {
    fetchCollegeOptions()
      .then((data) => setColleges(data.colleges))
      .catch(() => setColleges([]));
  }, []);

  const resetDrafts = () => {
    setNameDraft(user.displayName);
    setAvatarDraft(user.avatar);
    setStudentNoDraft(user.studentNo ?? '');
    setClassDraft(user.className ?? '');
    setOrgDraft(user.orgId ?? '');
    setGenderDraft(user.gender ?? '');
    setAllowTranscriptDraft(user.allowSchoolTranscriptView !== false);
  };

  useEffect(() => {
    if (!editing) resetDrafts();
  }, [user, editing]);

  useEffect(() => {
    if (modal && open) {
      setEditing(true);
      resetDrafts();
    }
  }, [modal, open]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const { user: updated } = await updateStudentProfileRequest({
        displayName: nameDraft,
        avatar: avatarDraft,
        studentNo: studentNoDraft,
        className: classDraft,
        orgId: orgDraft,
        gender: genderDraft || undefined,
        allowSchoolTranscriptView: allowTranscriptDraft
      });
      onUserUpdate(updated);
      setEditing(false);
      setSavedHint(true);
      window.setTimeout(() => setSavedHint(false), 2000);
      if (modal) onClose?.();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    resetDrafts();
    setEditing(false);
    setError(null);
    if (modal) onClose?.();
  };

  const startEdit = () => {
    resetDrafts();
    setEditing(true);
  };

  if (modal && !open) return null;

  const formContent = (
    <>
      <button
        type="button"
        className="student-profile-avatar-btn"
        onClick={startEdit}
        title="点击编辑个人信息"
        aria-label="编辑个人信息"
        disabled={editing}
      >
        <span className="account-user-avatar">{editing ? avatarDraft : user.avatar}</span>
        {!editing && <span className="student-profile-avatar-hint">点击编辑</span>}
      </button>

      <div className="student-profile-body">
        {editing ? (
          <div className="student-profile-edit-form">
            <h3 className="student-profile-form-title">补充个人信息</h3>

            <label className="student-profile-field">
              <span className="student-profile-label">昵称</span>
              <input
                type="text"
                className="student-profile-input"
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={20}
                disabled={saving}
              />
            </label>

            <div className="student-profile-field student-profile-avatar-pick">
              <span className="student-profile-label">头像</span>
              <div className="student-avatar-grid">
                {AVATAR_PRESETS.map((em) => (
                  <button
                    key={em}
                    type="button"
                    className={`student-avatar-option ${avatarDraft === em ? 'selected' : ''}`}
                    onClick={() => setAvatarDraft(em)}
                    disabled={saving}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>

            <label className="student-profile-field">
              <span className="student-profile-label">学号</span>
              <input
                type="text"
                className="student-profile-input"
                value={studentNoDraft}
                onChange={(e) => setStudentNoDraft(e.target.value)}
                placeholder="选填，便于学校端识别"
                maxLength={24}
                disabled={saving}
              />
            </label>

            <label className="student-profile-field">
              <span className="student-profile-label">院系</span>
              <select
                className="student-profile-input"
                value={orgDraft}
                onChange={(e) => setOrgDraft(e.target.value)}
                disabled={saving || colleges.length === 0}
              >
                {colleges.length === 0 && <option value="">加载中…</option>}
                {colleges.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="student-profile-field">
              <span className="student-profile-label">班级</span>
              <input
                type="text"
                className="student-profile-input"
                value={classDraft}
                onChange={(e) => setClassDraft(e.target.value)}
                placeholder="如：软件2301"
                maxLength={32}
                disabled={saving}
              />
            </label>

            <label className="student-profile-field">
              <span className="student-profile-label">性别</span>
              <select
                className="student-profile-input"
                value={genderDraft}
                onChange={(e) => setGenderDraft(e.target.value as StudentGender | '')}
                disabled={saving}
              >
                {GENDER_OPTIONS.map((opt) => (
                  <option key={opt.value || 'unset'} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="student-profile-field student-profile-checkbox">
              <input
                type="checkbox"
                checked={allowTranscriptDraft}
                onChange={(e) => setAllowTranscriptDraft(e.target.checked)}
                disabled={saving}
              />
              <span>允许学校端查看我的对话原文（辅导员需授权才可查看）</span>
            </label>

            <p className="student-profile-meta">账号 @{user.username} · 咨询记录已绑定</p>

            <div className="student-profile-actions">
              <button type="button" className="student-profile-save" onClick={handleSave} disabled={saving}>
                {saving ? '保存中…' : '保存'}
              </button>
              <button type="button" className="student-profile-cancel" onClick={handleCancel} disabled={saving}>
                取消
              </button>
            </div>
          </div>
        ) : (
          <>
            <strong>{user.displayName}</strong>
            <p className="student-profile-meta">@{user.username} · 咨询记录已绑定账号</p>
            <p className="student-profile-field">
              <span className="student-profile-label">学号</span>
              <span>{user.studentNo || '未填写'}</span>
            </p>
            <p className="student-profile-field">
              <span className="student-profile-label">院系</span>
              <span>{user.orgName || '未填写'}</span>
            </p>
            <p className="student-profile-field">
              <span className="student-profile-label">班级</span>
              <span>{user.className || '未填写'}</span>
            </p>
            <p className="student-profile-field">
              <span className="student-profile-label">性别</span>
              <span>{formatGender(user.gender)}</span>
            </p>
            <p className="student-profile-field">
              <span className="student-profile-label">对话原文</span>
              <span>{user.allowSchoolTranscriptView === false ? '未授权学校查看' : '已授权学校查看'}</span>
            </p>
            <button type="button" className="student-profile-edit-btn block" onClick={startEdit}>
              编辑资料
            </button>
          </>
        )}

        {error && <p className="student-profile-error">{error}</p>}
        {savedHint && <p className="student-profile-saved">资料已更新</p>}
      </div>
    </>
  );

  if (modal) {
    return (
      <div className="student-profile-modal-backdrop" role="presentation" onClick={handleCancel}>
        <div
          className="student-profile-modal"
          role="dialog"
          aria-labelledby="student-profile-modal-title"
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" className="student-profile-modal-close" onClick={handleCancel} aria-label="关闭">
            ×
          </button>
          <div className="account-user-card student-profile-card student-profile-card-modal">
            {formContent}
          </div>
        </div>
      </div>
    );
  }

  return <div className="account-user-card student-profile-card">{formContent}</div>;
};
