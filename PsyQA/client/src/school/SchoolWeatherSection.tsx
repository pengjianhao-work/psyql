import React, { useEffect, useState } from 'react';
import {
  fetchSchoolWeather,
  getErrorMessage,
  SchoolWeather,
  SchoolWeatherGroup
} from '../api';

/** 心情 → 次数的横向条形图（纯 div，无新依赖） */
function MoodBars({ dist }: { dist: Record<string, number> }) {
  const entries = Object.entries(dist).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    return <p className="muted school-weather-empty">近 7 天暂无打卡</p>;
  }
  const max = Math.max(...entries.map(([, c]) => c), 1);
  return (
    <ul className="school-weather-moods">
      {entries.map(([mood, count]) => (
        <li key={mood}>
          <span className="school-weather-mood">{mood}</span>
          <span className="school-weather-track">
            <span
              className="school-weather-fill"
              style={{ width: `${Math.round((count / max) * 100)}%` }}
            />
          </span>
          <span className="school-weather-count">{count}</span>
        </li>
      ))}
    </ul>
  );
}

/** 近 7 天每日打卡数的迷你柱状图 */
function TrendSpark({ trend }: { trend: SchoolWeatherGroup['trend7d'] }) {
  if (!trend.length) return null;
  const max = Math.max(...trend.map((t) => t.count), 1);
  return (
    <div className="school-weather-trend" role="img" aria-label="近 7 天每日打卡数">
      {trend.map((t) => (
        <div
          key={t.day}
          className="school-weather-trend-col"
          title={`${t.day} · ${t.count} 次${
            t.avgMoodScore !== undefined ? ` · 心情均值 ${t.avgMoodScore}` : ''
          }`}
        >
          <span
            className="school-weather-trend-bar"
            style={{ height: `${Math.max(6, Math.round((t.count / max) * 44))}px` }}
          />
          <span className="school-weather-trend-day">{t.day.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

function WeatherGroupCard({ group }: { group: SchoolWeatherGroup }) {
  return (
    <div className={`school-weather-group${group.kOk ? '' : ' suppressed'}`}>
      <div className="school-weather-group-head">
        <strong>{group.label}</strong>
        <span className="muted">
          活跃 {group.activeUsers} 人 · 待处理告警 {group.alerts.pending} · 30 天告警{' '}
          {group.alerts.total30d}
        </span>
      </div>
      {group.kOk ? (
        <div className="school-weather-group-body">
          <MoodBars dist={group.moodDistribution} />
          <TrendSpark trend={group.trend7d} />
        </div>
      ) : (
        <p className="muted school-weather-empty">
          样本不足（少于 5 名学生或 5 名打卡用户），已隐藏分布以保护隐私
        </p>
      )}
    </div>
  );
}

export const SchoolWeatherSection: React.FC = () => {
  const [weather, setWeather] = useState<SchoolWeather | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSchoolWeather()
      .then(setWeather)
      .catch((e) => setError(getErrorMessage(e)));
  }, []);

  if (error) {
    return (
      <div className="school-card">
        <h3>情绪气象</h3>
        <p className="school-error">{error}</p>
      </div>
    );
  }
  if (!weather) {
    return (
      <div className="school-card">
        <h3>情绪气象</h3>
        <p className="muted">加载中…</p>
      </div>
    );
  }

  const groups = weather.mergedSmallGroups
    ? [...weather.groups, weather.mergedSmallGroups]
    : weather.groups;

  return (
    <div className="school-card school-weather">
      <div className="school-weather-head">
        <h3>情绪气象 · {weather.scope}</h3>
        <span className="muted">
          生成于 {new Date(weather.generatedAt).toLocaleString('zh-CN')}
        </span>
      </div>
      <p className="school-weather-total muted">
        近 30 天活跃 {weather.total.activeUsers} 人 · 打卡 {weather.total.checkins30d} 次（近 7
        天 {weather.total.checkins7d} 次） · 待处理告警 {weather.total.alertsPending} · 30 天告警{' '}
        {weather.total.alerts30d}
      </p>
      {groups.map((g) => (
        <WeatherGroupCard key={g.groupKey} group={g} />
      ))}
      <p className="muted school-weather-caption">仅显示聚合数据，无法定位到个人</p>
    </div>
  );
};
