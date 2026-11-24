import React, { useCallback, useEffect, useState } from 'react';
import {
  addTaskBoardTask,
  deleteTaskBoardTask,
  fetchTaskBoard,
  getErrorMessage,
  TaskBoardPayload,
  toggleTaskBoardTask
} from '../api';

interface TaskBoardPanelProps {
  userId: string;
}

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六'];

export const TaskBoardPanel: React.FC<TaskBoardPanelProps> = ({ userId }) => {
  const [board, setBoard] = useState<TaskBoardPayload | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setBoard(await fetchTaskBoard(userId));
    } catch {
      /* 看板加载失败不阻塞页面 */
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggle = async (taskId: number) => {
    setBusy(true);
    setError(null);
    try {
      await toggleTaskBoardTask(userId, taskId);
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async () => {
    const title = newTitle.trim();
    if (!title) return;
    setBusy(true);
    setError(null);
    try {
      await addTaskBoardTask(userId, title);
      setNewTitle('');
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (taskId: number) => {
    setBusy(true);
    try {
      await deleteTaskBoardTask(userId, taskId);
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (!board) {
    return <div className="task-board-panel"><p className="agent-profile-muted">加载中…</p></div>;
  }

  const todayDone = board.stats.today;
  const weekDoneCount = board.stats.week.filter((d) => d.done).length;

  return (
    <div className="task-board-panel">
      <div className="task-board-head">
        <h4>打卡看板</h4>
        <span className="task-board-streak" title="连续完成任务的天数">
          🔥 {board.stats.streakDays} 天
        </span>
      </div>

      <div className="task-board-week" title="最近 7 天是否有任务完成">
        {board.stats.week.map((d) => {
          const dt = new Date(`${d.date}T00:00:00`);
          return (
            <span
              key={d.date}
              className={`task-board-dot${d.done ? ' done' : ''}${d.date === todayDone ? ' today' : ''}`}
              title={`${d.date}${d.done ? ' · 已完成' : ''}`}
            >
              {WEEK_LABELS[dt.getDay()]}
            </span>
          );
        })}
        <span className="task-board-week-count">本周 {weekDoneCount}/7</span>
      </div>

      <p className="task-board-progress">
        今日已完成 {board.stats.doneToday}/{board.stats.totalActive} 项
      </p>

      <ul className="task-board-list">
        {board.tasks.map((task) => {
          const done = task.doneDates.includes(todayDone);
          return (
            <li key={task.id} className={done ? 'task-done' : ''}>
              <label className="task-check">
                <input
                  type="checkbox"
                  checked={done}
                  disabled={busy}
                  onChange={() => void handleToggle(task.id)}
                />
                <span className="task-title">{task.title}</span>
              </label>
              <span className="task-meta">
                <span className="group-tag">{task.kindLabel || '自定义'}</span>
                {task.kind !== 'custom' && (
                  <button
                    type="button"
                    className="task-del"
                    title="删除任务"
                    onClick={() => void handleDelete(task.id)}
                  >
                    ×
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="task-board-add">
        <input
          type="text"
          maxLength={40}
          placeholder="添加自己的打卡任务…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleAdd();
          }}
        />
        <button type="button" className="agent-profile-btn small" disabled={busy || !newTitle.trim()} onClick={() => void handleAdd()}>
          添加
        </button>
      </div>

      {error && <p className="session-feedback-error">{error}</p>}
    </div>
  );
};
