import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchSchoolAlerts,
  getErrorMessage,
  patchSchoolAlert,
  SchoolAlertItem
} from '../api';

const levelOptions = [
  { value: '', label: '全部等级' },
  { value: 'critical', label: '危急' },
  { value: 'high', label: '高危' },
  { value: 'medium', label: '关注' }
];

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'pending', label: '待处理' },
  { value: 'contacted', label: '已联系' },
  { value: 'referred', label: '已转介' },
  { value: 'closed', label: '已关闭' },
  { value: 'false_positive', label: '误报' }
];

const statusLabel: Record<string, string> = {
  pending: '待处理',
  contacted: '已联系',
  referred: '已转介',
  closed: '已关闭',
  false_positive: '误报'
};

const SchoolAlerts: React.FC = () => {
  const [alerts, setAlerts] = useState<SchoolAlertItem[]>([]);
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [draftAssignee, setDraftAssignee] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSchoolAlerts({
        level: level || undefined,
        status: status || undefined,
        from: fromDate ? `${fromDate}T00:00:00.000Z` : undefined
      });
      setAlerts(data.alerts);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [level, status, fromDate]);

  useEffect(() => {
    load();
  }, [load]);

  const handleStatus = async (alertId: string, nextStatus: string) => {
    setSavingId(alertId);
    try {
      await patchSchoolAlert(alertId, {
        status: nextStatus,
        assignee: draftAssignee[alertId],
        notes: draftNotes[alertId],
        isFalsePositive: nextStatus === 'false_positive'
      });
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="school-alerts">
      <div className="school-toolbar">
        <h2>风险告警工作台</h2>
        <select value={level} onChange={(e) => setLevel(e.target.value)}>
          {levelOptions.map((o) => (
            <option key={o.value || 'all'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {statusOptions.map((o) => (
            <option key={o.value || 'all'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <label className="school-date-filter">
          起始日期
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <button type="button" className="save-care-btn" onClick={load} disabled={loading}>
          刷新
        </button>
      </div>
      <p className="muted school-readonly-hint">
        可更新处理状态、填写负责人与备注，并跳转学生档案查看完整对话。
      </p>

      {error && (
        <div className="school-card school-error-inline">
          <p>{error}</p>
        </div>
      )}

      {loading && <p className="muted">加载中…</p>}
      {!loading && alerts.length === 0 && <p className="muted">暂无告警记录</p>}

      <div className="school-alert-list">
        {alerts.map((a) => (
          <article key={a.id} className={`school-alert-card level-${a.level}`}>
            <div className="school-alert-head">
              <div className="school-alert-student">
                <strong>{a.studentDisplayName || a.studentMask}</strong>
                {a.studentNo && <span className="muted">学号 {a.studentNo}</span>}
                {a.className && <span className="muted">{a.className}</span>}
                <Link to={`/school/students/${a.studentId}`} className="school-detail-link">
                  查看档案
                </Link>
              </div>
              <span className={`badge ${a.level}`}>
                {a.level === 'critical' ? '危急' : a.level === 'high' ? '高危' : '关注'}
              </span>
              <span className="badge status">{statusLabel[a.status] || a.status}</span>
            </div>
            <p>{a.summary}</p>
            {a.riskKeywords.length > 0 && (
              <div className="school-tags">
                {a.riskKeywords.map((k) => (
                  <span key={k} className="group-tag">
                    {k}
                  </span>
                ))}
              </div>
            )}
            <small className="muted">
              {new Date(a.dialogTime).toLocaleString('zh-CN')} · {a.orgName || a.orgId}
            </small>

            <div className="school-alert-actions">
              <label>
                负责人
                <input
                  type="text"
                  placeholder="辅导员姓名"
                  value={draftAssignee[a.id] ?? a.assignee ?? ''}
                  onChange={(e) =>
                    setDraftAssignee((prev) => ({ ...prev, [a.id]: e.target.value }))
                  }
                />
              </label>
              <label className="school-alert-notes">
                备注
                <textarea
                  rows={2}
                  placeholder="处理记录…"
                  value={draftNotes[a.id] ?? a.notes ?? ''}
                  onChange={(e) => setDraftNotes((prev) => ({ ...prev, [a.id]: e.target.value }))}
                />
              </label>
              <div className="school-alert-btns">
                {a.status === 'pending' && (
                  <>
                    <button
                      type="button"
                      className="save-care-btn small"
                      disabled={savingId === a.id}
                      onClick={() => handleStatus(a.id, 'contacted')}
                    >
                      标记已联系
                    </button>
                    <button
                      type="button"
                      className="school-btn-secondary small"
                      disabled={savingId === a.id}
                      onClick={() => handleStatus(a.id, 'referred')}
                    >
                      已转介
                    </button>
                  </>
                )}
                {a.status !== 'closed' && a.status !== 'false_positive' && (
                  <button
                    type="button"
                    className="school-btn-secondary small"
                    disabled={savingId === a.id}
                    onClick={() => handleStatus(a.id, 'closed')}
                  >
                    关闭
                  </button>
                )}
                {a.status === 'pending' && (
                  <button
                    type="button"
                    className="school-btn-muted small"
                    disabled={savingId === a.id}
                    onClick={() => handleStatus(a.id, 'false_positive')}
                  >
                    误报
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

export default SchoolAlerts;
