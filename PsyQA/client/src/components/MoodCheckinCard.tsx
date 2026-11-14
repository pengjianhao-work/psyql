import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchMoodCheckins,
  getErrorMessage,
  MoodCheckin,
  submitMoodCheckin
} from '../api';

interface MoodCheckinCardProps {
  userId: string;
}

const MOOD_OPTIONS = ['还不错', '一般', '有点累', '烦躁', '低落'];

export const MoodCheckinCard: React.FC<MoodCheckinCardProps> = ({ userId }) => {
  const [mood, setMood] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<MoodCheckin[]>([]);

  const loadRecent = useCallback(async () => {
    try {
      const { checkins } = await fetchMoodCheckins(userId, 5);
      setRecent(checkins);
    } catch {
      /* 列表加载失败不阻塞打卡 */
    }
  }, [userId]);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  const handleSubmit = async () => {
    if (!mood) {
      setError('先选一个此刻的心情');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitMoodCheckin(userId, mood, note.trim() || undefined);
      setMood(null);
      setNote('');
      await loadRecent();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="session-feedback-panel mood-checkin-card">
      <h4>情绪打卡</h4>
      <p className="session-feedback-hint">不用写长文，点一下就好</p>

      <div className="helpful-row">
        {MOOD_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            className={`helpful-btn${mood === option ? ' active' : ''}`}
            onClick={() => setMood(option)}
          >
            {option}
          </button>
        ))}
      </div>

      <label className="session-feedback-comment">
        想记一句（可选）
        <input
          type="text"
          maxLength={60}
          placeholder="例如：今天和室友吵了一架"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>

      {error && <p className="session-feedback-error">{error}</p>}

      <div className="session-feedback-actions">
        <button
          type="button"
          className="save-care-btn"
          disabled={submitting}
          onClick={() => void handleSubmit()}
        >
          {submitting ? '记录中…' : '记一下'}
        </button>
      </div>

      {recent.length > 0 && (
        <ul className="mood-checkin-recent">
          {recent.map((c) => (
            <li key={c.id}>
              {c.createdAt.slice(5, 16).replace('T', ' ')} · {c.mood}
              {c.note ? `（${c.note}）` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
