import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { batchTranscriptRequest, fetchSchoolStudents, getErrorMessage, SchoolStudentItem } from '../api';
import { formatEmotion, formatRisk, riskClass } from './schoolLabels';

const SchoolStudents: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [students, setStudents] = useState<SchoolStudentItem[]>([]);
  const [riskOnly, setRiskOnly] = useState(false);
  const [classFilter, setClassFilter] = useState(searchParams.get('class') || '');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchMsg, setBatchMsg] = useState<string | null>(null);
  const [batching, setBatching] = useState(false);
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

  const classOptions = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      if (s.className) set.add(s.className);
    });
    return Array.from(set).sort();
  }, [students]);

  const visible = useMemo(() => {
    let list = students;
    if (classFilter) {
      list = list.filter((s) => s.className === classFilter);
    }
    if (riskOnly) {
      list = list.filter(
        (s) => s.pendingAlerts > 0 || s.lastRisk === 'high' || s.lastRisk === 'critical'
      );
    }
    return list;
  }, [students, riskOnly, classFilter]);

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    if (selected.size >= visible.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visible.map((s) => s.id)));
    }
  };

  const handleBatchAuth = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setBatching(true);
    setBatchMsg(null);
    try {
      const r = await batchTranscriptRequest(
        ids,
        classFilter ? `${classFilter} 班级建档批量授权申请` : '批量查看对话授权申请'
      );
      setBatchMsg(r.message);
      setSelected(new Set());
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBatching(false);
    }
  };

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
        <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
          <option value="">全部班级</option>
          {classOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="school-filter-check">
          <input type="checkbox" checked={riskOnly} onChange={(e) => setRiskOnly(e.target.checked)} />
          仅显示有风险提示
        </label>
        {selected.size > 0 && (
          <button type="button" className="save-care-btn" disabled={batching} onClick={() => void handleBatchAuth()}>
            {batching ? '申请中…' : `批量申请授权（${selected.size}）`}
          </button>
        )}
        <button type="button" className="save-care-btn school-refresh-btn" onClick={load} disabled={loading}>
          {loading ? '加载中…' : '刷新'}
        </button>
      </div>
      {batchMsg && <p className="agent-profile-success">{batchMsg}</p>}
      <p className="muted school-readonly-hint">
        勾选同班学生后可批量发起对话查看授权；学生端可一次性同意或拒绝。
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
                  <th>
                    <input
                      type="checkbox"
                      checked={visible.length > 0 && selected.size === visible.length}
                      onChange={toggleAllVisible}
                      aria-label="全选当前列表"
                    />
                  </th>
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
                  <tr key={s.id} className={selected.has(s.id) ? 'school-row-selected' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggleOne(s.id)}
                        aria-label={`选择 ${s.displayName || s.maskName}`}
                      />
                    </td>
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
