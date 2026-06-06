import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchSchoolStudents, getErrorMessage, SchoolStudentItem } from '../api';
import { formatEmotion, formatRisk, riskClass } from './schoolLabels';

const SchoolStudents: React.FC = () => {
  const [students, setStudents] = useState<SchoolStudentItem[]>([]);
  const [riskOnly, setRiskOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSchoolStudents();
      setStudents(data.students);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    if (!riskOnly) return students;
    return students.filter(
      (s) =>
        s.pendingAlerts > 0 ||
        s.lastRisk === 'high' ||
        s.lastRisk === 'critical'
    );
  }, [students, riskOnly]);

  if (error && students.length === 0) {
    return (
      <div className="school-card school-error-block">
        <p>{error}</p>
        <button type="button" className="save-care-btn" onClick={load}>
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="school-students">
      <div className="school-toolbar">
        <h2>学生列表</h2>
        <label className="school-filter-check">
          <input type="checkbox" checked={riskOnly} onChange={(e) => setRiskOnly(e.target.checked)} />
          仅显示有风险提示
        </label>
        <button type="button" className="save-care-btn school-refresh-btn" onClick={load} disabled={loading}>
          {loading ? '加载中…' : '刷新'}
        </button>
      </div>
      <p className="muted school-readonly-hint">
        管理人可查看学生姓名、学号、心理指标与完整对话记录。点击「查看详情」进入档案页。
      </p>

      {error && (
        <div className="school-card school-error-inline">
          <p>{error}</p>
        </div>
      )}

      <div className="school-card school-student-table-wrap">
        {loading && students.length === 0 ? (
          <p className="muted">加载中…</p>
        ) : (
          <>
            <table className="school-table school-table-wide">
              <thead>
                <tr>
                  <th>姓名</th>
                  <th>学号</th>
                  <th>院系</th>
                  <th>班级</th>
                  <th>咨询</th>
                  <th>最近时间</th>
                  <th>情绪</th>
                  <th>问题</th>
                  <th>压力</th>
                  <th>风险</th>
                  <th>告警</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span className="school-student-name">
                        {s.avatar && <span>{s.avatar}</span>}
                        {s.displayName || s.maskName}
                      </span>
                      {(s.pendingAlerts > 0 || s.lastRisk === 'high' || s.lastRisk === 'critical') && (
                        <span className="risk-dot" title="存在风险关注" />
                      )}
                    </td>
                    <td>{s.studentNo || '—'}</td>
                    <td>{s.orgName || s.orgId}</td>
                    <td>{s.className || '—'}</td>
                    <td>{s.consultCount}</td>
                    <td className="school-cell-time">{s.lastConsultTime || '—'}</td>
                    <td>{s.lastEmotionLabel || formatEmotion(s.lastEmotion)}</td>
                    <td>{s.lastProblemLabel || '—'}</td>
                    <td>{s.lastStressLevel ?? '—'}</td>
                    <td className={riskClass(s.lastRisk)}>
                      {s.lastRiskLabel || formatRisk(s.lastRisk)}
                    </td>
                    <td>{s.pendingAlerts > 0 ? s.pendingAlerts : '—'}</td>
                    <td>
                      <Link to={`/school/students/${s.id}`} className="school-detail-link">
                        查看详情
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visible.length === 0 && <p className="muted">暂无符合条件的学生数据</p>}
          </>
        )}
      </div>
    </div>
  );
};

export default SchoolStudents;
