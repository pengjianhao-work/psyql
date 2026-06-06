import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchSchoolHeatmap, HeatmapCell, getErrorMessage } from '../api';

export const SchoolHeatmapPage: React.FC = () => {
  const [cells, setCells] = useState<HeatmapCell[]>([]);
  const [insight, setInsight] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchSchoolHeatmap(month)
      .then((d) => {
        setCells(d.cells);
        setInsight(d.groupInsight);
      })
      .catch((e) => setError(getErrorMessage(e)));
  }, [month]);

  const heatClass = (level: HeatmapCell['heatLevel']) => `heat-${level}`;

  return (
    <div className="school-heatmap">
      <div className="school-page-head">
        <h2>院系心理预警热力图</h2>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>
      {error && <p className="school-error-inline">{error}</p>}
      <p className="muted">{insight}</p>
      <div className="school-heatmap-grid">
        {cells.map((c) => (
          <Link
            key={`${c.orgId}-${c.className}`}
            to={`/school/students?class=${encodeURIComponent(c.className)}`}
            className={`school-heatmap-cell ${heatClass(c.heatLevel)}`}
          >
            <strong>{c.className}</strong>
            <span>{c.studentCount} 人 · {c.consultCount} 次咨询</span>
            <span>高危 {c.highRiskCount} · 待处理 {c.pendingAlerts}</span>
            <span>均压 {c.avgStress || '—'}</span>
            {c.topIssue && <em>共性：{c.topIssue}</em>}
          </Link>
        ))}
      </div>
    </div>
  );
};

export default SchoolHeatmapPage;
