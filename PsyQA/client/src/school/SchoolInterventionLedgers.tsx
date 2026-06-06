import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchInterventionLedgers,
  patchInterventionLedger,
  InterventionRecord,
  getErrorMessage
} from '../api';

export const SchoolInterventionLedgers: React.FC = () => {
  const [records, setRecords] = useState<InterventionRecord[]>([]);
  const [overdue, setOverdue] = useState<InterventionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    void fetchInterventionLedgers()
      .then((d) => {
        setRecords(d.records);
        setOverdue(d.overdue);
      })
      .catch((e) => setError(getErrorMessage(e)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addNote = (id: string) => {
    const note = noteDraft[id]?.trim();
    if (!note) return;
    const row = records.find((r) => r.id === id);
    if (!row) return;
    void patchInterventionLedger(id, {
      meetingNotes: [...row.meetingNotes, note],
      status: 'in_progress'
    }).then(() => {
      setNoteDraft((p) => ({ ...p, [id]: '' }));
      load();
    });
  };

  return (
    <div className="school-intervention-ledgers">
      <h2>高危个案闭环追踪台账</h2>
      {overdue.length > 0 && (
        <div className="school-overdue-banner" role="alert">
          {overdue.length} 条台账已超过 SLA / 回访时限，请优先处理
        </div>
      )}
      {error && <p>{error}</p>}
      {records.length === 0 && <p className="muted">暂无干预台账</p>}
      <ul className="school-ledger-list">
        {records.map((r) => (
          <li key={r.id} className={`school-ledger-card tier-${r.tier}`}>
            <div className="school-ledger-head">
              <strong>{r.studentMask}</strong>
              <span>一级/二级 · SLA {new Date(r.slaDueAt).toLocaleString('zh-CN')}</span>
              <span className={`badge status-${r.status}`}>{r.status}</span>
            </div>
            {r.meetingNotes.length > 0 && (
              <ul className="school-ledger-notes">
                {r.meetingNotes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            )}
            <label>
              约谈记录
              <textarea
                rows={2}
                value={noteDraft[r.id] || ''}
                onChange={(e) => setNoteDraft((p) => ({ ...p, [r.id]: e.target.value }))}
              />
            </label>
            <button type="button" className="save-care-btn small" onClick={() => addNote(r.id)}>
              保存记录
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SchoolInterventionLedgers;
