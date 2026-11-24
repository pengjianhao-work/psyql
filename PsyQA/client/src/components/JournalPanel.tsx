import React, { useCallback, useEffect, useState } from 'react';
import {
  createJournal,
  deleteJournal,
  fetchJournals,
  getErrorMessage,
  JournalEntry,
  updateJournal
} from '../api';
import { MOOD_OPTIONS } from './MoodCheckinCard';

interface JournalPanelProps {
  userId: string;
}

const PREVIEW_LEN = 60;

function toPreview(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length > PREVIEW_LEN ? `${flat.slice(0, PREVIEW_LEN)}…` : flat;
}

export const JournalPanel: React.FC<JournalPanelProps> = ({ userId }) => {
  const [journals, setJournals] = useState<JournalEntry[] | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [moodTag, setMoodTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { journals: list } = await fetchJournals(userId);
      setJournals(list);
    } catch {
      /* 日记列表加载失败不阻塞页面 */
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetEditor = () => {
    setEditingId(null);
    setTitle('');
    setBody('');
    setMoodTag('');
  };

  const handleSave = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const patch = {
        title: title.trim() || undefined,
        body: trimmed,
        moodTag: moodTag || null
      };
      if (editingId !== null) {
        await updateJournal(userId, editingId, patch);
      } else {
        await createJournal(userId, patch);
      }
      resetEditor();
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = (entry: JournalEntry) => {
    setEditingId(entry.id);
    setTitle(entry.title);
    setBody(entry.body);
    setMoodTag(entry.moodTag ?? '');
    setError(null);
  };

  const handleDelete = async (journalId: number) => {
    setBusy(true);
    setError(null);
    try {
      await deleteJournal(userId, journalId);
      if (editingId === journalId) resetEditor();
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!journals) {
    return <div className="journal-panel"><p className="agent-profile-muted">加载中…</p></div>;
  }

  return (
    <div className="journal-panel">
      <div className="journal-editor">
        <input
          type="text"
          className="journal-title-input"
          maxLength={50}
          placeholder="标题（可选）"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSave();
          }}
        />
        <textarea
          className="journal-body-input"
          rows={3}
          maxLength={5000}
          placeholder="写下今天的心情…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="journal-editor-row">
          <select
            className="journal-mood-select"
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
            disabled={busy || !body.trim()}
            onClick={() => void handleSave()}
          >
            {editingId !== null ? '保存修改' : '记下来'}
          </button>
          {editingId !== null && (
            <button
              type="button"
              className="agent-profile-btn small"
              disabled={busy}
              onClick={resetEditor}
            >
              取消
            </button>
          )}
        </div>
      </div>

      {journals.length === 0 ? (
        <p className="journal-empty">还没有日记，写下今天的心情吧</p>
      ) : (
        <ul className="journal-list">
          {journals.map((j) => (
            <li key={j.id}>
              <div className="journal-item-head">
                <span className="journal-date">
                  {j.createdAt.slice(5, 16).replace('T', ' ')}
                </span>
                {j.moodTag && <span className="group-tag">{j.moodTag}</span>}
                <span className="task-meta">
                  <button
                    type="button"
                    className="task-del"
                    title="编辑日记"
                    disabled={busy}
                    onClick={() => handleEdit(j)}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className="task-del"
                    title="删除日记"
                    disabled={busy}
                    onClick={() => void handleDelete(j.id)}
                  >
                    ×
                  </button>
                </span>
              </div>
              {j.title && <p className="journal-item-title">{j.title}</p>}
              <p className="journal-item-preview">{toPreview(j.body)}</p>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="session-feedback-error">{error}</p>}
    </div>
  );
};
