import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchSchoolDashboard, getErrorMessage, SchoolDashboardStats } from '../api';
import { DonutChart, paletteColor } from '../components/charts';
import { stressLevelClass } from './schoolLabels';

const EMPTY_STATS: SchoolDashboardStats = {
  totalConsultations: 0,
  activeStudents: 0,
  highRiskCount: 0,
  pendingAlerts: 0,
  problemTop3: [],
  emotionTop3: [],
  avgStress: 0
};

function DashboardSkeleton() {
  return (
    <div className="school-dashboard">
      <div className="school-page-head">
        <div className="school-skeleton school-skeleton-title" />
        <div className="school-skeleton school-skeleton-btn" />
      </div>
      <div className="school-stat-grid">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="school-stat-card school-skeleton-card">
            <div className="school-skeleton school-skeleton-label" />
            <div className="school-skeleton school-skeleton-value" />
          </div>
        ))}
      </div>
      <div className="school-two-col">
        <div className="school-card school-skeleton-panel" />
        <div className="school-card school-skeleton-panel" />
      </div>
    </div>
  );
}

function RankBarList({
  items,
  nameKey,
  emptyText
}: {
  items: Array<{ count: number; share: number; category?: string; emotion?: string }>;
  nameKey: 'category' | 'emotion';
  emptyText: string;
}) {
  if (items.length === 0) {
    return <p className="school-empty-inline">{emptyText}</p>;
  }
  const maxShare = Math.max(...items.map((i) => i.share), 1);
  return (
    <ul className="school-rank-list school-rank-bars">
      {items.map((item, idx) => {
        const name = (item[nameKey] as string) || '—';
        return (
          <li key={`${name}-${idx}`}>
            <div className="school-rank-row">
              <span className="school-rank-name">
                <span className="school-rank-index">{idx + 1}</span>
                {name}
              </span>
              <span className="school-rank-meta">
                {item.count} 次 · {item.share}%
              </span>
            </div>
            <div className="school-rank-track">
              <span
                className="school-rank-fill"
                style={{ width: `${Math.round((item.share / maxShare) * 100)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const SchoolDashboard: React.FC = () => {
  const [stats, setStats] = useState<SchoolDashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setError(null);
    setRefreshing(true);
    try {
      const data = await fetchSchoolDashboard();
      setStats({
        ...EMPTY_STATS,
        ...data,
        problemTop3: Array.isArray(data.problemTop3) ? data.problemTop3 : [],
        emotionTop3: Array.isArray(data.emotionTop3) ? data.emotionTop3 : []
      });
      setUpdatedAt(new Date().toLocaleString('zh-CN'));
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  if (error && !stats) {
    return (
      <div className="school-card school-error-block">
        <p>{error}</p>
        <button type="button" className="save-care-btn" onClick={() => load()}>
          重试
        </button>
      </div>
    );
  }

  if (!stats) {
    return <DashboardSkeleton />;
  }

  const hasData = stats.totalConsultations > 0 || stats.activeStudents > 0;

  return (
    <div className="school-dashboard">
      <div className="school-page-head">
        <div>
          <h2>数据看板</h2>
          <p className="muted school-page-sub">
            院系心理态势概览 · 数据已脱敏
            {updatedAt ? ` · 更新于 ${updatedAt}` : ''}
          </p>
        </div>
        <button
          type="button"
          className="save-care-btn school-refresh-btn"
          onClick={() => load()}
          disabled={refreshing}
        >
          {refreshing ? '刷新中…' : '刷新数据'}
        </button>
      </div>

      {!hasData && (
        <div className="school-card school-empty-banner">
          <strong>暂无咨询统计数据</strong>
          <p className="muted">
            学生端产生咨询记录后，看板将自动汇总院系心理态势。可使用演示账号 <code>demo</code> 在学生端发起咨询后再刷新。
          </p>
        </div>
      )}

      <div className="school-stat-grid">
        <div className="school-stat-card">
          <span className="label">累计咨询</span>
          <strong>{stats.totalConsultations}</strong>
          <span className="school-stat-hint">次对话记录</span>
        </div>
        <div className="school-stat-card">
          <span className="label">活跃学生</span>
          <strong>{stats.activeStudents}</strong>
          <span className="school-stat-hint">有咨询行为</span>
        </div>
        <div className="school-stat-card warn">
          <span className="label">高危记录</span>
          <strong>{stats.highRiskCount}</strong>
          <span className="school-stat-hint">高/危急等级</span>
        </div>
        <Link to="/school/alerts" className="school-stat-card alert school-stat-link">
          <span className="label">待处理告警</span>
          <strong>{stats.pendingAlerts}</strong>
          <span className="school-stat-hint">点击查看 →</span>
        </Link>
        <div className={`school-stat-card stress ${stressLevelClass(stats.avgStress)}`}>
          <span className="label">平均压力指数</span>
          <strong>{stats.avgStress}</strong>
          <div className="school-stress-meter">
            <span style={{ width: `${Math.min(100, stats.avgStress)}%` }} />
          </div>
        </div>
      </div>

      <div className="school-quick-links">
        <Link to="/school/alerts" className="school-quick-link">
          风险告警工作台
          {stats.pendingAlerts > 0 && (
            <span className="school-nav-badge">{stats.pendingAlerts}</span>
          )}
        </Link>
        <Link to="/school/students" className="school-quick-link">
          脱敏学生列表
        </Link>
      </div>

      <div className="school-two-col">
        <div className="school-card">
          <h3>问题类型 Top3</h3>
          <div className="school-viz-split">
            <DonutChart
              segments={stats.problemTop3.map((p, i) => ({
                label: p.category || '—',
                value: p.count,
                color: paletteColor(i)
              }))}
              size={180}
              emptyText="暂无问题类型统计"
            />
            <RankBarList
              items={stats.problemTop3}
              nameKey="category"
              emptyText="暂无问题类型统计"
            />
          </div>
        </div>
        <div className="school-card">
          <h3>情绪分布 Top3</h3>
          <div className="school-viz-split">
            <DonutChart
              segments={stats.emotionTop3.map((e, i) => ({
                label: e.emotion || '—',
                value: e.count,
                color: paletteColor(i + 3)
              }))}
              size={180}
              emptyText="暂无情绪分布统计"
            />
            <RankBarList
              items={stats.emotionTop3}
              nameKey="emotion"
              emptyText="暂无情绪分布统计"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SchoolDashboard;
