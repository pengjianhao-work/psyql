import { useCallback, useEffect, useState } from 'react';
import {
  createPlan,
  fetchToday,
  fetchWeekSummary,
  postCheckin,
  postCompanion,
  postReflection,
  setActionStatus,
  type LoopTodayState,
  type LoopTurnResult,
  type LoopWeeklySummary
} from '../api/loop';
import { InsightsPanelShell } from '../components/InsightsPanelShell';

const STATUS_LABEL: Record<string, string> = { pending: '待做', done: '完成', partial: '部分', skipped: '跳过' };

export function LoopWorkspace({ userId }: { userId: string }) {
  const [today, setToday] = useState<LoopTodayState | null>(null);
  const [week, setWeek] = useState<LoopWeeklySummary | null>(null);
  const [error, setError] = useState('');
  const [mood, setMood] = useState('');
  const [stress, setStress] = useState(3);
  const [eventText, setEventText] = useState('');
  const [goal, setGoal] = useState('');
  const [actionText, setActionText] = useState('');
  const [reflLines, setReflLines] = useState(['', '', '']);
  const [companionText, setCompanionText] = useState('');
  const [turn, setTurn] = useState<LoopTurnResult | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [t, w] = await Promise.all([fetchToday(userId), fetchWeekSummary(userId)]);
      setToday(t);
      setWeek(w);
      setError('');
    } catch {
      setError('闭环数据加载失败，稍后再试');
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch {
      setError('操作失败，稍后再试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="record-page">
      <div className="record-page-main">
        <InsightsPanelShell title="今天" className="record-main-card">
          {today ? (
            <div className="loop-today">
              <p className="loop-next-step">{today.nextStep}</p>
              {!today.checkin ? (
                <div className="loop-checkin-form">
                  <input
                    value={mood}
                    onChange={(e) => setMood(e.target.value)}
                    placeholder="现在的心情（一个词就行）"
                    maxLength={30}
                  />
                  <label>
                    压力 {stress}/5
                    <input type="range" min={1} max={5} value={stress} onChange={(e) => setStress(Number(e.target.value))} />
                  </label>
                  <input
                    value={eventText}
                    onChange={(e) => setEventText(e.target.value)}
                    placeholder="今天发生的一件事（可不写）"
                    maxLength={200}
                  />
                  <div className="loop-btn-row">
                    <button
                      className="submit-btn"
                      disabled={busy}
                      onClick={() => void run(() => postCheckin(userId, { mood, stress, eventText }))}
                    >
                      签到
                    </button>
                    <button disabled={busy} onClick={() => void run(() => postCheckin(userId, { skipped: true }))}>
                      今天跳过
                    </button>
                  </div>
                </div>
              ) : (
                <p className="loop-checkin-done">
                  {today.checkin.skipped ? '今天选择了跳过，也算数。' : `已签到：${today.checkin.mood || '—'}，压力 ${today.checkin.stress ?? '—'}/5`}
                </p>
              )}

              {today.plan ? (
                <div className="loop-plan">
                  <h4>本周目标：{today.plan.goal}</h4>
                  {today.todayActions.length ? (
                    today.todayActions.map((a) => (
                      <div key={a.id} className="loop-action-row">
                        <span>{a.text}</span>
                        <span className="loop-action-status">{STATUS_LABEL[a.status] ?? a.status}</span>
                        {a.status === 'pending' && (
                          <span className="loop-btn-row">
                            {(['done', 'partial', 'skipped'] as const).map((s) => (
                              <button key={s} disabled={busy} onClick={() => void run(() => setActionStatus(userId, a.id, s))}>
                                {STATUS_LABEL[s]}
                              </button>
                            ))}
                          </span>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="loop-muted">今天没有安排微行动。</p>
                  )}
                </div>
              ) : (
                <div className="loop-plan-form">
                  <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="这周想照顾好自己的一个方面" maxLength={100} />
                  <input value={actionText} onChange={(e) => setActionText(e.target.value)} placeholder="第一件小事（如：睡前不刷手机）" maxLength={100} />
                  <button
                    className="submit-btn"
                    disabled={busy || !goal.trim() || !actionText.trim()}
                    onClick={() =>
                      void run(() => createPlan(userId, goal.trim(), [{ actionText: actionText.trim() }]))
                    }
                  >
                    定个一周小目标
                  </button>
                </div>
              )}

              <div className="loop-companion">
                <input
                  value={companionText}
                  onChange={(e) => setCompanionText(e.target.value)}
                  placeholder="想说点什么…（我会先听你讲）"
                  maxLength={500}
                />
                <button
                  className="submit-btn"
                  disabled={busy || !companionText.trim()}
                  onClick={() =>
                    void run(async () => {
                      const r = await postCompanion(userId, companionText.trim());
                      setTurn(r);
                      setCompanionText('');
                    })
                  }
                >
                  说给陪伴听
                </button>
              </div>
              {turn && (
                <div className={`loop-reply${turn.mode === 'safety' ? ' loop-reply-safety' : ''}`} role={turn.mode === 'safety' ? 'alert' : undefined}>
                  {turn.reply.split('\n').map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="loop-muted">{error || '加载中…'}</p>
          )}
        </InsightsPanelShell>

        <InsightsPanelShell title="晚间三行复盘" className="record-main-card">
          <div className="loop-reflection">
            {['今天发生了什么', '什么有用 / 什么没用', '明天怎么调'].map((ph, i) => (
              <input
                key={ph}
                value={reflLines[i]}
                onChange={(e) => setReflLines((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
                placeholder={ph}
                maxLength={120}
              />
            ))}
            <button
              className="submit-btn"
              disabled={busy || reflLines.every((l) => !l.trim())}
              onClick={() =>
                void run(() => postReflection(userId, { scope: 'evening', lines: reflLines.filter((l) => l.trim()) }))
              }
            >
              留下复盘
            </button>
            {today?.eveningReflectionDone && <p className="loop-muted">今晚的复盘已经记下了。</p>}
          </div>
        </InsightsPanelShell>
      </div>

      <div className="record-page-side">
        <InsightsPanelShell title="这一周">
          {week ? (
            <div className="loop-week">
              <p className="loop-week-text">{week.text.split('\n').map((l, i) => <span key={i}>{l}<br /></span>)}</p>
            </div>
          ) : (
            <p className="loop-muted">还没有周总结。</p>
          )}
        </InsightsPanelShell>
        {turn?.suggestions?.practice?.length ? (
          <InsightsPanelShell title="可以试试的练习">
            <ul className="loop-practice-list">
              {turn.suggestions.practice.map((p) => (
                <li key={p.title}>
                  <strong>{p.title}</strong>
                  {p.body && <p className="loop-muted">{p.body}</p>}
                </li>
              ))}
            </ul>
          </InsightsPanelShell>
        ) : null}
      </div>
    </div>
  );
}
