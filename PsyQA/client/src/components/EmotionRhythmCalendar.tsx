import React, { useEffect, useState } from 'react';
import { fetchEmotionRhythm, EmotionRhythmPayload } from '../api';

const LEVEL_CLASS: Record<string, string> = {
  green: 'mood-green',
  yellow: 'mood-yellow',
  red: 'mood-red',
  none: 'mood-none'
};

interface Props {
  userId: string;
}

export const EmotionRhythmCalendar: React.FC<Props> = ({ userId }) => {
  const [data, setData] = useState<EmotionRhythmPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void fetchEmotionRhythm(userId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) return <p className="muted">加载情绪节律…</p>;
  if (!data) return <p className="muted">暂无节律数据</p>;

  const weekdayHeaders = ['日', '一', '二', '三', '四', '五', '六'];
  const firstWd = new Date(`${data.month}-01`).getDay();
  const padded = [...Array(firstWd).fill(null), ...data.days];

  return (
    <div className="emotion-rhythm-calendar">
      <p className="emotion-rhythm-summary">{data.summary}</p>
      <div className="emotion-rhythm-grid">
        {weekdayHeaders.map((w) => (
          <span key={w} className="emotion-rhythm-wd">
            {w}
          </span>
        ))}
        {padded.map((d, i) =>
          d ? (
            <div
              key={d.date}
              className={`emotion-rhythm-day ${LEVEL_CLASS[d.level]}`}
              title={`${d.date} · 分 ${d.score || '-'} · EWMA ${d.ewma || '-'} · ${d.sessions} 次`}
            >
              {Number(d.date.slice(-2))}
            </div>
          ) : (
            <div key={`pad-${i}`} className="emotion-rhythm-day mood-none empty" />
          )
        )}
      </div>
      <div className="emotion-rhythm-legend">
        <span className="mood-green">绿·良好</span>
        <span className="mood-yellow">黄·关注</span>
        <span className="mood-red">红·预警</span>
      </div>
      {data.periodicDips.length > 0 && (
        <ul className="emotion-rhythm-dips">
          {data.periodicDips.map((d) => (
            <li key={d.label}>
              <strong>{d.label}</strong>
              <p>{d.description}</p>
              <em>{d.carePlan}</em>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
