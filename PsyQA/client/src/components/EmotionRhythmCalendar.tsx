import React, { useEffect, useState } from 'react';
import {
  DiaryEntry,
  fetchDiaryEntries,
  fetchEmotionRhythm,
  EmotionRhythmPayload,
  getErrorMessage,
  saveDiaryEntry
} from '../api';

const LEVEL_CLASS: Record<string, string> = {
  green: 'mood-green',
  yellow: 'mood-yellow',
  red: 'mood-red',
  none: 'mood-none'
};

const MAX_DIARY_LEN = 2000;

function todayKey(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

interface Props {
  userId: string;
}

export const EmotionRhythmCalendar: React.FC<Props> = ({ userId }) => {
  const [data, setData] = useState<EmotionRhythmPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [diaries, setDiaries] = useState<Record<string, DiaryEntry>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    void fetchEmotionRhythm(userId)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
    setSelectedDate(null);
    setDraft('');
    setError(null);
  }, [userId]);

  useEffect(() => {
    if (!data?.month) return;
    let cancelled = false;
    void fetchDiaryEntries(userId, data.month)
      .then(({ entries }) => {
        if (!cancelled) {
          setDiaries(Object.fromEntries(entries.map((e) => [e.date, e])));
        }
      })
      .catch(() => {
        /* 日记加载失败不影响日历展示 */
      });
    return () => {
      cancelled = true;
    };
  }, [userId, data?.month]);

  if (loading) return <p className="muted">加载情绪节律…</p>;
  if (!data) return <p className="muted">暂无节律数据</p>;

  const today = todayKey();
  const weekdayHeaders = ['日', '一', '二', '三', '四', '五', '六'];
  const firstWd = new Date(`${data.month}-01`).getDay();
  const padded = [...Array(firstWd).fill(null), ...data.days];
  const selectedDay = selectedDate ? data.days.find((d) => d.date === selectedDate) : undefined;
  const existingDiary = selectedDate ? diaries[selectedDate] : undefined;

  const handleSelect = (date: string) => {
    if (selectedDate === date) {
      setSelectedDate(null);
      return;
    }
    setSelectedDate(date);
    setDraft(diaries[date]?.content ?? '');
    setError(null);
  };

  const handleSave = async () => {
    if (!selectedDate) return;
    const targetDate = selectedDate;
    setSaving(true);
    setError(null);
    try {
      const { entry } = await saveDiaryEntry(userId, targetDate, draft);
      setDiaries((prev) => {
        const next = { ...prev };
        if (entry) {
          next[entry.date] = entry;
        } else {
          delete next[targetDate];
        }
        return next;
      });
      if (!entry) setDraft('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

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
            <button
              key={d.date}
              type="button"
              className={`emotion-rhythm-day ${LEVEL_CLASS[d.level]}${d.date === selectedDate ? ' selected' : ''}${
                diaries[d.date] ? ' has-diary' : ''
              }`}
              disabled={d.date > today}
              aria-pressed={d.date === selectedDate}
              title={`${d.date} · 分 ${d.score || '-'} · EWMA ${d.ewma || '-'} · ${d.sessions} 次${
                diaries[d.date] ? ' · 已写日记' : ''
              }${d.date > today ? ' · 未来日期' : ''}`}
              onClick={() => handleSelect(d.date)}
            >
              {Number(d.date.slice(-2))}
            </button>
          ) : (
            <div key={`pad-${i}`} className="emotion-rhythm-day mood-none empty" />
          )
        )}
      </div>

      {selectedDate && (
        <div className="emotion-rhythm-diary">
          <div className="emotion-rhythm-diary-head">
            <strong>{selectedDate} 的日记</strong>
            {selectedDay && selectedDay.sessions > 0 && (
              <span className="emotion-rhythm-diary-mood">
                当天情绪分 {selectedDay.score} · {selectedDay.sessions} 次咨询
              </span>
            )}
            <button
              type="button"
              className="emotion-rhythm-diary-close"
              onClick={() => setSelectedDate(null)}
            >
              收起
            </button>
          </div>
          <textarea
            className="emotion-rhythm-diary-input"
            rows={5}
            maxLength={MAX_DIARY_LEN}
            placeholder="今天发生了什么？此刻想留下什么？"
            aria-label={`${selectedDate} 的日记内容`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="emotion-rhythm-diary-actions">
            <span className="emotion-rhythm-diary-hint">
              只保存在你的记录里，不会进入咨询对话 · {draft.length}/{MAX_DIARY_LEN}
            </span>
            <button
              type="button"
              className="save-care-btn"
              disabled={saving || (!draft.trim() && !existingDiary)}
              onClick={() => void handleSave()}
            >
              {saving ? '保存中…' : existingDiary && !draft.trim() ? '删除' : '保存'}
            </button>
          </div>
          {error && <p className="session-feedback-error">{error}</p>}
        </div>
      )}

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
