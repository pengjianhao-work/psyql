import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  fetchSchoolStudentDetail,
  getErrorMessage,
  postCounselorTranscriptRequest,
  SchoolStudentDetail as StudentDetailData
} from '../api';
import { useSchoolSession } from './useSchoolSession';
import { formatEmotion, formatRisk, riskClass } from './schoolLabels';
import { TrendChart } from '../components/TrendChart';
import { HistoryDataPoint } from '../types';

const SchoolStudentDetailPage: React.FC = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const { sessionUser } = useSchoolSession();
  const [data, setData] = useState<StudentDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedDialog, setExpandedDialog] = useState<string | null>(null);
  const [transcriptMsg, setTranscriptMsg] = useState<string | null>(null);
  const [requestingTranscript, setRequestingTranscript] = useState(false);

  const load = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    setError(null);
    try {
      const detail = await fetchSchoolStudentDetail(studentId);
      setData(detail);
      if (detail.dialogs[0]) {
        setExpandedDialog(detail.dialogs[0].time);
      }
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return <p className="muted">加载学生档案…</p>;
  }

  if (error && !data) {
    return (
      <div className="school-card school-error-block">
        <p>{error}</p>
        <Link to="/school/students" className="school-back-link">
          ← 返回学生列表
        </Link>
      </div>
    );
  }

  if (!data) return null;

  const { profile, dialogs, alerts } = data;

  const psychTrend: HistoryDataPoint[] = [...dialogs]
    .reverse()
    .filter((d) => d.psych)
    .map((d) => ({
      date: d.time,
      stressLevel: d.psych!.stressLevel,
      anxietyLevel: d.psych!.anxietyLevel,
      moodStability: d.psych!.moodStability
    }));

  return (
    <div className="school-student-detail">
      <div className="school-page-head">
        <div>
          <Link to="/school/students" className="school-back-link">
            ← 学生列表
          </Link>
          <h2 className="school-detail-title">
            {profile.avatar && <span className="school-detail-avatar">{profile.avatar}</span>}
            {profile.displayName}
          </h2>
          <p className="muted school-page-sub">
            学号 {profile.studentNo || '—'} · 账号 {profile.username || profile.id} · {profile.orgName}
            {profile.className ? ` · ${profile.className}` : ''}
          </p>
        </div>
        <button type="button" className="save-care-btn school-refresh-btn" onClick={load} disabled={loading}>
          {loading ? '刷新中…' : '刷新'}
        </button>
        {(sessionUser.role === 'counselor' || sessionUser.role === 'admin') &&
          profile.transcriptMasked !== false && (
            <button
              type="button"
              className="school-btn-secondary"
              disabled={requestingTranscript || profile.allowSchoolTranscriptView}
              onClick={() => {
                if (!studentId) return;
                setRequestingTranscript(true);
                setTranscriptMsg(null);
                void postCounselorTranscriptRequest(studentId)
                  .then((r) => setTranscriptMsg(r.message))
                  .catch((e) => setTranscriptMsg(getErrorMessage(e)))
                  .finally(() => setRequestingTranscript(false));
              }}
            >
              {profile.allowSchoolTranscriptView
                ? '已授权查看原文'
                : requestingTranscript
                  ? '申请中…'
                  : '申请查看对话原文'}
            </button>
          )}
      </div>
      {transcriptMsg && <p className="muted school-transcript-msg">{transcriptMsg}</p>}

      <div className="school-detail-profile-grid">
        <div className="school-card school-detail-stat">
          <span className="label">累计咨询</span>
          <strong>{profile.consultCount}</strong>
        </div>
        <div className="school-card school-detail-stat">
          <span className="label">最近咨询</span>
          <strong className="school-detail-stat-sm">{profile.lastConsultTime || '—'}</strong>
        </div>
        <div className="school-card school-detail-stat">
          <span className="label">最近情绪</span>
          <strong>{profile.lastEmotionLabel || formatEmotion(profile.lastEmotion)}</strong>
        </div>
        <div className={`school-card school-detail-stat ${riskClass(profile.lastRisk)}`}>
          <span className="label">最近风险</span>
          <strong>{profile.lastRiskLabel || formatRisk(profile.lastRisk)}</strong>
        </div>
        <div className="school-card school-detail-stat">
          <span className="label">压力 / 焦虑 / 平稳</span>
          <strong className="school-detail-stat-sm">
            {profile.lastStressLevel ?? '—'} / {profile.lastAnxietyLevel ?? '—'} /{' '}
            {profile.lastMoodStability ?? '—'}
          </strong>
        </div>
        <div className="school-card school-detail-stat warn">
          <span className="label">待处理告警</span>
          <strong>{profile.pendingAlerts}</strong>
        </div>
      </div>

      {psychTrend.length > 0 && (
        <section className="school-card school-detail-section school-detail-trend">
          <TrendChart data={psychTrend} />
        </section>
      )}

      {alerts.length > 0 && (
        <section className="school-card school-detail-section">
          <h3>风险告警记录 ({alerts.length})</h3>
          <ul className="school-detail-alert-list">
            {alerts.map((a) => (
              <li key={a.id} className={`school-alert-mini level-${a.level}`}>
                <span className={`badge ${a.level}`}>
                  {a.level === 'critical' ? '危急' : a.level === 'high' ? '高危' : '关注'}
                </span>
                <span>{a.summary}</span>
                <small className="muted">{a.dialogTime}</small>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="school-card school-detail-section">
        <h3>咨询对话记录 ({dialogs.length})</h3>
        {dialogs.length === 0 ? (
          <p className="muted">暂无对话记录</p>
        ) : (
          <div className="school-dialog-list">
            {dialogs.map((d) => {
              const open = expandedDialog === d.time;
              return (
                <article key={d.time} className="school-dialog-card">
                  <button
                    type="button"
                    className="school-dialog-head"
                    onClick={() => setExpandedDialog(open ? null : d.time)}
                  >
                    <div className="school-dialog-head-main">
                      <time>{d.time}</time>
                      {d.psych && (
                        <span className={`school-dialog-tags ${riskClass(d.psych.risk)}`}>
                          {d.psych.emotionLabel} · 风险{d.psych.riskLabel} · {d.psych.problemLabel}
                        </span>
                      )}
                    </div>
                    <span className="school-dialog-toggle">{open ? '▲' : '▼'}</span>
                  </button>
                  <p className="school-dialog-summary">{d.summary}</p>
                  {open && (
                    <div className="school-dialog-body">
                      <div className="school-dialog-turn">
                        <span className="school-dialog-role user">学生</span>
                        <p>{d.user}</p>
                      </div>
                      <div className="school-dialog-turn">
                        <span className="school-dialog-role bot">助手</span>
                        <p>{d.bot}</p>
                      </div>
                      {d.psych && (
                        <div className="school-dialog-metrics">
                          <strong>心理指标</strong>
                          <span>压力 {d.psych.stressLevel}</span>
                          <span>焦虑 {d.psych.anxietyLevel}</span>
                          <span>平稳度 {d.psych.moodStability}</span>
                          <span>置信 {(d.psych.confidence * 100).toFixed(0)}%</span>
                        </div>
                      )}
                      {d.portrait && (
                        <div className="school-dialog-portrait">
                          <strong>咨询画像</strong>
                          <p>{d.portrait.summary}</p>
                          {d.portrait.coreConcerns.length > 0 && (
                            <p>
                              <em>核心困扰：</em>
                              {d.portrait.coreConcerns.join('、')}
                            </p>
                          )}
                          <p>
                            <em>建议关注：</em>
                            {d.portrait.recommendedFocus}
                          </p>
                        </div>
                      )}
                      {d.report && (
                        <details className="school-dialog-report">
                          <summary>完整分析报告</summary>
                          <pre>{d.report}</pre>
                        </details>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default SchoolStudentDetailPage;
