import React, { useState } from 'react';
import { submitSessionFeedback, getErrorMessage, UserProfilePayload } from '../api';

interface SessionFeedbackPanelProps {
  userId: string;
  dialogTime?: string;
  onSaved?: (profile: UserProfilePayload) => void;
  onSkip?: () => void;
}

export const SessionFeedbackPanel: React.FC<SessionFeedbackPanelProps> = ({
  userId,
  dialogTime,
  onSaved,
  onSkip
}) => {
  const [rating, setRating] = useState(0);
  const [helpful, setHelpful] = useState<boolean | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!dialogTime) return;
    if (rating === 0 && helpful === null && !comment.trim()) {
      setError('请选择评分、是否有帮助，或填写简短反馈');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await submitSessionFeedback({
        userId,
        dialogTime,
        rating: rating > 0 ? rating : undefined,
        helpful: helpful === null ? undefined : helpful,
        comment: comment.trim() || undefined
      });
      setDone(true);
      onSaved?.(result.profile);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="session-feedback-panel done">
        <p>感谢你的反馈，将帮助我们更好地陪伴你。</p>
      </div>
    );
  }

  return (
    <div className="session-feedback-panel">
      <h4>本次咨询反馈</h4>
      <p className="session-feedback-hint">可选填写，用于改进回复质量（约 10 秒）</p>

      <div className="session-feedback-stars">
        <span className="session-feedback-label">整体满意度</span>
        <div className="star-row">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={`star-btn${rating >= n ? ' active' : ''}`}
              onClick={() => setRating(n)}
              aria-label={`${n} 星`}
            >
              ★
            </button>
          ))}
        </div>
      </div>

      <div className="session-feedback-helpful">
        <span className="session-feedback-label">这次回复有帮助吗？</span>
        <div className="helpful-row">
          <button
            type="button"
            className={`helpful-btn${helpful === true ? ' active' : ''}`}
            onClick={() => setHelpful(true)}
          >
            有帮助
          </button>
          <button
            type="button"
            className={`helpful-btn${helpful === false ? ' active' : ''}`}
            onClick={() => setHelpful(false)}
          >
            帮助不大
          </button>
        </div>
      </div>

      <label className="session-feedback-comment">
        补充说明（可选）
        <textarea
          rows={2}
          maxLength={200}
          placeholder="例如：希望多给一些具体做法"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </label>

      {error && <p className="session-feedback-error">{error}</p>}

      <div className="session-feedback-actions">
        <button type="button" className="save-care-btn" disabled={submitting} onClick={handleSubmit}>
          {submitting ? '提交中…' : '提交反馈'}
        </button>
        {onSkip && (
          <button type="button" className="session-feedback-skip" disabled={submitting} onClick={onSkip}>
            跳过
          </button>
        )}
      </div>
    </div>
  );
};
