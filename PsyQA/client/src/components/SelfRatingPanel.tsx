import React, { useState } from 'react';
import { submitSelfRating, getErrorMessage } from '../api';

interface SelfRatingPanelProps {
  userId: string;
  dialogTime?: string;
  onSaved?: (payload: Partial<import('../types').QuestionResponse>) => void;
}

export const SelfRatingPanel: React.FC<SelfRatingPanelProps> = ({
  userId,
  dialogTime,
  onSaved
}) => {
  const [mood, setMood] = useState(5);
  const [stress, setStress] = useState(5);
  const [anxiety, setAnxiety] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await submitSelfRating({
        userId,
        dialogTime,
        moodRating: mood,
        stressRating: stress,
        anxietyRating: anxiety
      });
      setDone(true);
      onSaved?.({});
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="self-rating-panel done">
        <p>感谢你的自评，已纳入心理状态趋势图。</p>
      </div>
    );
  }

  return (
    <div className="self-rating-panel">
      <h4>本次咨询后自评（1-10）</h4>
      <p className="self-rating-hint">帮助系统更准确地记录你的状态变化（可选）</p>
      <label>
        整体心情
        <input type="range" min={1} max={10} value={mood} onChange={(e) => setMood(Number(e.target.value))} />
        <span>{mood}</span>
      </label>
      <label>
        压力感受
        <input type="range" min={1} max={10} value={stress} onChange={(e) => setStress(Number(e.target.value))} />
        <span>{stress}</span>
      </label>
      <label>
        焦虑程度
        <input type="range" min={1} max={10} value={anxiety} onChange={(e) => setAnxiety(Number(e.target.value))} />
        <span>{anxiety}</span>
      </label>
      {error && <p className="self-rating-error">{error}</p>}
      <button type="button" className="save-care-btn" disabled={submitting} onClick={handleSubmit}>
        {submitting ? '保存中…' : '提交自评'}
      </button>
    </div>
  );
};
