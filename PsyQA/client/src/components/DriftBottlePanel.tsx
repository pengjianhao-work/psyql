import React, { useState } from 'react';
import {
  BottleThrowResult,
  getErrorMessage,
  pickBottle,
  PickedBottle,
  throwBottle
} from '../api';
import { MOOD_OPTIONS } from './MoodCheckinCard';

interface DriftBottlePanelProps {
  userId: string;
}

type ReceivedCard =
  | { kind: 'bottle'; bottle: PickedBottle }
  | { kind: 'seed'; text: string };

/**
 * 匿名漂流瓶：扔 / 捞两个动作。
 * - 被安全拦截时展示温和的照护卡片（含热线），不展示错误口吻
 * - 限次与联系方式拦截用轻提示处理，不当报错
 */
export const DriftBottlePanel: React.FC<DriftBottlePanelProps> = ({ userId }) => {
  const [body, setBody] = useState('');
  const [moodTag, setMoodTag] = useState('');
  const [busy, setBusy] = useState<'throw' | 'pick' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [care, setCare] = useState<{ message: string; hotline: string } | null>(null);
  const [received, setReceived] = useState<ReceivedCard | null>(null);

  const handleThrow = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setBusy('throw');
    setNotice(null);
    setCare(null);
    try {
      const res: BottleThrowResult = await throwBottle(userId, {
        body: trimmed,
        moodTag: moodTag || null
      });
      if (res.ok && res.intercepted && res.care) {
        setCare(res.care);
        setBody('');
      } else if (res.ok) {
        setNotice('瓶子已经丢进海里了，愿它遇见温柔的人。');
        setBody('');
        setMoodTag('');
      } else if (res.reason === 'rate_limited') {
        setNotice('今天的瓶子已经扔满啦，明天再来吧。');
      } else if (res.reason === 'contact_info') {
        setNotice('瓶子里好像有联系方式或链接，匿名之海不接受这些哦。');
      }
    } catch (e) {
      setNotice(getErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const handlePick = async () => {
    setBusy('pick');
    setNotice(null);
    try {
      const res = await pickBottle(userId);
      if (res.ok && res.bottle) {
        setReceived({ kind: 'bottle', bottle: res.bottle });
      } else if (res.ok && res.seed) {
        setReceived({ kind: 'seed', text: res.seed.text });
      } else if (!res.ok && res.reason === 'rate_limited') {
        setNotice('今天已经捞够啦，把海风留给明天吧。');
      }
    } catch (e) {
      setNotice(getErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="bottle-panel">
      <div className="bottle-throw">
        <textarea
          className="bottle-body-input"
          rows={3}
          maxLength={500}
          placeholder="写一句想丢进海里的话（5–500 字，保持匿名哦）…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="bottle-actions">
          <select
            className="bottle-mood-select"
            value={moodTag}
            onChange={(e) => setMoodTag(e.target.value)}
          >
            <option value="">心情（可选）</option>
            {MOOD_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="agent-profile-btn small"
            disabled={busy !== null || !body.trim()}
            onClick={() => void handleThrow()}
          >
            {busy === 'throw' ? '扔出中…' : '扔一个瓶子'}
          </button>
          <button
            type="button"
            className="agent-profile-btn small"
            disabled={busy !== null}
            onClick={() => void handlePick()}
          >
            {busy === 'pick' ? '打捞中…' : '捞一个瓶子'}
          </button>
        </div>
      </div>

      {care && (
        <div className="bottle-care">
          <p className="bottle-care-message">{care.message}</p>
          <p className="bottle-care-hotline">{care.hotline}</p>
        </div>
      )}

      {received && (
        <div className="bottle-card">
          {received.kind === 'seed' ? (
            <>
              <span className="bottle-card-label">来自海里的祝福</span>
              <p className="bottle-card-body">{received.text}</p>
            </>
          ) : (
            <>
              <div className="bottle-card-head">
                <span className="bottle-card-label">捞到一只瓶子</span>
                {received.bottle.mood_tag && (
                  <span className="group-tag">{received.bottle.mood_tag}</span>
                )}
                <span className="bottle-card-date">
                  {received.bottle.created_at.slice(5, 16).replace('T', ' ')}
                </span>
              </div>
              <p className="bottle-card-body">{received.bottle.body}</p>
            </>
          )}
        </div>
      )}

      {notice && <p className="bottle-note">{notice}</p>}
    </div>
  );
};
