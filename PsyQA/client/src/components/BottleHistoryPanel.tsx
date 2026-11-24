import React, { useEffect, useState } from 'react';
import { fetchMyBottles } from '../api';
import type { MyBottle } from '../api';

interface BottleHistoryPanelProps {
  userId: string;
  /** 扔瓶成功后自增，触发历史刷新 */
  refreshKey?: number;
}

const STATUS_LABELS: Record<MyBottle['status'], string> = {
  pooled: '漂流中',
  picked: '被捞起了'
};

/** 「我扔过的瓶子」列表——只展示已入池/被捞的，拦截瓶不回显 */
export const BottleHistoryPanel: React.FC<BottleHistoryPanelProps> = ({ userId, refreshKey = 0 }) => {
  const [bottles, setBottles] = useState<MyBottle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMyBottles(userId)
      .then((list) => {
        if (!cancelled) setBottles(list);
      })
      .catch(() => {
        if (!cancelled) setBottles([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey]);

  if (loading) return <p className="bottle-history-empty">加载中…</p>;
  if (bottles.length === 0) {
    return <p className="bottle-history-empty">还没有扔过瓶子，把此刻的心情装进瓶子里吧。</p>;
  }

  return (
    <ul className="bottle-history-list">
      {bottles.map((b) => (
        <li key={b.id} className="bottle-history-item">
          <p className="bottle-history-body">
            {b.body.length > 60 ? `${b.body.slice(0, 60)}…` : b.body}
          </p>
          <div className="bottle-history-meta">
            <span className="bottle-history-date">{b.createdAt.slice(0, 10)}</span>
            {b.moodTag && <span className="group-tag">{b.moodTag}</span>}
            <span className={`bottle-history-status${b.status === 'picked' ? ' picked' : ''}`}>
              {STATUS_LABELS[b.status]}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
};
