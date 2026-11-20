import React, { useCallback, useEffect, useState } from 'react';
import {
  AgentProfilePayload,
  getAgentProfile,
  getErrorMessage,
  patchAgentProfile,
  downloadAgentProfileExport,
  listAgentMemories,
  deleteAgentMemory,
  fetchMemoryTags,
  patchMemoryTag,
  batchArchiveMemories,
  AgentMemoryRow,
  UserStaticProfile,
  InterventionProfile,
  UserFact,
  MemoryFactsResponse,
  getMemoryFacts,
  patchMemoryFact,
  deleteMemoryFact,
  distillMemoryFacts
} from '../api';
import { RagWeightBar } from './RagWeightBar';

const PHASE_LABEL: Record<AgentProfilePayload['phase'], string> = {
  collect: '特征采集期（0–6 月）',
  shape: '人格成型期（7–18 月）',
  mature: '专属 Agent 定型（19–24 月）'
};

const TONE_OPTIONS = [
  { value: '', label: '未设置' },
  { value: 'gentle', label: '温和共情' },
  { value: 'rational', label: '理性分析' },
  { value: 'brief', label: '简短开导' }
];

function splitList(raw: string): string[] {
  return raw
    .split(/[,，、;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function joinList(items?: string[]): string {
  return items?.join('、') ?? '';
}

const TAG_LABEL: Record<string, string> = {
  academic: '学业',
  relationship: '人际',
  family: '家庭',
  romance: '恋爱',
  crisis: '危机',
  emotion: '情绪',
  other: '其他'
};

const FACT_CATEGORY_LABEL: Record<UserFact['category'], string> = {
  emotion: '情绪模式',
  relationship: '人际关系',
  academic: '学业',
  habit: '生活习惯',
  preference: '偏好',
  context: '处境背景'
};

const FACT_CONFIDENCE_LABEL: Record<UserFact['confidence'], string> = {
  low: '初步',
  medium: '较稳定',
  high: '稳定'
};

type MemoryTab = 'portrait' | 'facts' | 'memories';

const TAB_LABEL: Record<MemoryTab, string> = {
  portrait: 'L3 心理画像',
  facts: 'L2 记忆事实',
  memories: 'L1 对话记忆'
};

interface AgentProfileCardProps {
  userId: string;
}

export const AgentProfileCard: React.FC<AgentProfileCardProps> = ({ userId }) => {
  const [profile, setProfile] = useState<AgentProfilePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [memories, setMemories] = useState<AgentMemoryRow[]>([]);
  const [tagFilter, setTagFilter] = useState('');
  const [selectedMem, setSelectedMem] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<MemoryTab>('portrait');
  const [factsData, setFactsData] = useState<MemoryFactsResponse | null>(null);
  const [distilling, setDistilling] = useState(false);
  const [editingFactId, setEditingFactId] = useState<string | null>(null);
  const [factDraft, setFactDraft] = useState('');

  const [basicAge, setBasicAge] = useState('');
  const [basicOccupation, setBasicOccupation] = useState('');
  const [basicFamily, setBasicFamily] = useState('');
  const [basicEvents, setBasicEvents] = useState('');
  const [preferredTone, setPreferredTone] = useState('');
  const [sensitiveTopics, setSensitiveTopics] = useState('');
  const [avoidPhrases, setAvoidPhrases] = useState('');
  const [effectiveApproaches, setEffectiveApproaches] = useState('');
  const [agentPrompt, setAgentPrompt] = useState('');

  const fillForm = useCallback((data: AgentProfilePayload) => {
    const b = data.basicJson;
    setBasicAge(b?.age !== undefined ? String(b.age) : '');
    setBasicOccupation(b?.occupation ?? '');
    setBasicFamily(b?.familyBackground ?? '');
    setBasicEvents(joinList(b?.majorLifeEvents));
    setPreferredTone(data.interventionJson?.preferredTone ?? '');
    setSensitiveTopics(joinList(data.interventionJson?.sensitiveTopics));
    setAvoidPhrases(joinList(data.interventionJson?.avoidPhrases));
    setEffectiveApproaches(joinList(data.interventionJson?.effectiveApproaches));
    setAgentPrompt(data.agentSystemPrompt ?? '');
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAgentProfile(userId);
      setProfile(data);
      fillForm(data);
    } catch (e) {
      setError(getErrorMessage(e));
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [userId, fillForm]);

  const loadMemories = useCallback(async () => {
    const [rows, tagData] = await Promise.all([
      listAgentMemories(userId),
      fetchMemoryTags(userId).catch(() => ({ memories: [] as Array<{ dialogTime: string; tags: string[]; locked: boolean; archived: boolean }> }))
    ]);
    const metaMap = new Map(tagData.memories.map((m) => [m.dialogTime, m]));
    setMemories(
      rows.map((r) => {
        const meta = metaMap.get(r.dialogTime);
        return {
          ...r,
          tags: meta?.tags?.length ? meta.tags : r.tags || [],
          locked: meta?.locked ?? r.locked ?? false,
          archived: meta?.archived ?? r.archived ?? false
        };
      })
    );
  }, [userId]);

  const loadFacts = useCallback(async () => {
    try {
      const data = await getMemoryFacts(userId, true);
      setFactsData(data);
    } catch {
      setFactsData(null);
    }
  }, [userId]);

  useEffect(() => {
    void loadFacts();
  }, [loadFacts, profile?.updatedAt]);

  useEffect(() => {
    void loadMemories();
  }, [loadMemories, profile?.updatedAt]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const basic: UserStaticProfile = {
        occupation: basicOccupation.trim() || undefined,
        familyBackground: basicFamily.trim() || undefined,
        majorLifeEvents: splitList(basicEvents)
      };
      const ageNum = basicAge.trim() ? Number(basicAge) : undefined;
      if (ageNum !== undefined && !Number.isNaN(ageNum)) {
        basic.age = ageNum;
      } else if (basicAge.trim()) {
        basic.age = basicAge.trim();
      }

      const intervention: Partial<InterventionProfile> = {
        preferredTone: preferredTone || undefined,
        sensitiveTopics: splitList(sensitiveTopics),
        avoidPhrases: splitList(avoidPhrases),
        effectiveApproaches: splitList(effectiveApproaches)
      };

      const result = await patchAgentProfile({
        userId,
        basic,
        intervention,
        ...(profile?.phase === 'mature' && agentPrompt.trim()
          ? { agentSystemPrompt: agentPrompt.trim() }
          : {})
      });
      setProfile({ ...result.profile, phase: result.phase, ragWeights: result.ragWeights });
      fillForm({ ...result.profile, phase: result.phase, ragWeights: result.ragWeights });
      setEditing(false);
      setMessage('专属档案已保存');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      await downloadAgentProfileExport(userId);
      setMessage('配置包已下载');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const handleDistill = async () => {
    setDistilling(true);
    setError(null);
    try {
      const result = await distillMemoryFacts(userId);
      setMessage(result.touched > 0 ? `已更新 ${result.touched} 条记忆事实` : '暂无新的可提炼内容');
      await loadFacts();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setDistilling(false);
    }
  };

  const handleFactPatch = async (factId: string, patch: { fact?: string; status?: 'active' | 'archived' }) => {
    try {
      await patchMemoryFact(userId, factId, patch);
      setEditingFactId(null);
      setFactDraft('');
      await loadFacts();
      setMessage('记忆事实已更新');
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const handleFactDelete = async (factId: string) => {
    try {
      await deleteMemoryFact(userId, factId);
      await loadFacts();
      setMessage('已删除该条记忆事实');
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  if (loading) {
    return (
      <div className="agent-profile-card">
        <h4>专属 Agent 档案</h4>
        <p className="agent-profile-muted">加载中…</p>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="agent-profile-card">
        <h4>专属 Agent 档案</h4>
        <p className="agent-profile-error">{error}</p>
        <button type="button" className="agent-profile-btn" onClick={() => void load()}>
          重试
        </button>
      </div>
    );
  }

  if (!profile) return null;

  const latestMonthly = profile.monthlySummariesJson.slice(-1)[0];
  const recentTimeline = profile.emotionTimelineJson.slice(-3).reverse();
  const latestAnnual = profile.annualReportsJson.slice(-1)[0];

  return (
    <div className="agent-profile-card">
      <div className="agent-profile-head">
        <h4>专属 Agent 档案</h4>
        <span className={`agent-phase-badge phase-${profile.phase}`}>
          {PHASE_LABEL[profile.phase]}
        </span>
      </div>

      <RagWeightBar weights={profile.ragWeights} />

      <div className="memory-tabs" role="tablist">
        {(Object.keys(TAB_LABEL) as MemoryTab[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`memory-tab${tab === key ? ' active' : ''}`}
            onClick={() => setTab(key)}
          >
            {TAB_LABEL[key]}
          </button>
        ))}
      </div>

      {tab === 'portrait' && (
        <div className="memory-tab-panel">
          <p className="agent-profile-muted memory-layer-desc">
            L3 心理画像：系统根据历次对话综合生成的阶段性理解，仅供参考，不构成心理评估或诊断。
          </p>
          {recentTimeline.length > 0 && (
            <div className="agent-profile-section">
              <strong>情绪时序</strong>
              <ul className="agent-timeline-list">
                {recentTimeline.map((e) => (
                  <li key={e.month}>
                    <span className="agent-timeline-month">{e.month}</span>
                    {e.dominantEmotions?.length ? e.dominantEmotions.join('、') : '—'}
                    {e.triggers?.length ? ` · 诱因：${e.triggers.join('、')}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {latestMonthly?.summary && (
            <div className="agent-profile-section">
              <strong>近月心理特征</strong>
              <p>{latestMonthly.summary}</p>
            </div>
          )}

          {latestAnnual?.report && (
            <div className="agent-profile-section">
              <strong>{latestAnnual.year} 年度档案摘要</strong>
              <p className="agent-annual-excerpt">{latestAnnual.report.slice(0, 200)}…</p>
            </div>
          )}

          {profile.agentSystemPrompt && (
            <div className="agent-profile-section agent-prompt-block">
              <strong>专属 Agent 人设</strong>
              <p>{profile.agentSystemPrompt}</p>
            </div>
          )}

          {profile.firstDialogAt && (
            <p className="agent-profile-muted">
              首条咨询：{profile.firstDialogAt.slice(0, 10)}
            </p>
          )}
        </div>
      )}

      {tab === 'facts' && (
        <div className="memory-tab-panel">
          <div className="agent-memory-list">
            <div className="agent-memory-head">
              <h4>记忆事实 · 对话蒸馏</h4>
              <button
                type="button"
                className="agent-profile-btn small"
                onClick={() => void handleDistill()}
                disabled={distilling}
              >
                {distilling ? '蒸馏中…' : '重新蒸馏'}
              </button>
            </div>
            {factsData?.distill.lastDistillAt && (
              <p className="agent-profile-muted">
                上次蒸馏：{factsData.distill.lastDistillAt.slice(0, 10)} · 共{' '}
                {factsData.facts.filter((f) => f.status === 'active').length} 条生效
              </p>
            )}
            {factsData && factsData.facts.length === 0 && (
              <p className="agent-profile-muted">
                还没有记忆事实。对话积累后会自动蒸馏，也可以点「重新蒸馏」立即尝试。
              </p>
            )}
            <ul>
              {factsData?.facts.map((f) => (
                <li key={f.id} className={f.status === 'archived' ? 'agent-memory-archived' : ''}>
                  {editingFactId === f.id ? (
                    <div className="agent-fact-edit">
                      <input
                        type="text"
                        value={factDraft}
                        onChange={(e) => setFactDraft(e.target.value)}
                        maxLength={120}
                      />
                      <button
                        type="button"
                        className="agent-profile-btn small primary"
                        onClick={() => void handleFactPatch(f.id, { fact: factDraft })}
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        className="agent-profile-btn small"
                        onClick={() => {
                          setEditingFactId(null);
                          setFactDraft('');
                        }}
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="agent-memory-body">
                        <span>{f.fact}</span>
                        <div className="agent-memory-tags">
                          <span className="group-tag">{FACT_CATEGORY_LABEL[f.category]}</span>
                          <span className="group-tag">{FACT_CONFIDENCE_LABEL[f.confidence]}</span>
                          {f.occurrences > 1 && <span className="group-tag">印证 {f.occurrences} 次</span>}
                          {f.status === 'archived' && <span className="group-tag archived">已归档</span>}
                        </div>
                      </div>
                      <div className="agent-memory-actions">
                        <button
                          type="button"
                          className="agent-profile-btn small"
                          onClick={() => {
                            setEditingFactId(f.id);
                            setFactDraft(f.fact);
                          }}
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          className="agent-profile-btn small"
                          onClick={() =>
                            void handleFactPatch(f.id, {
                              status: f.status === 'archived' ? 'active' : 'archived'
                            })
                          }
                        >
                          {f.status === 'archived' ? '恢复' : '归档'}
                        </button>
                        <button
                          type="button"
                          className="agent-profile-btn small"
                          onClick={() => void handleFactDelete(f.id)}
                        >
                          删除
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <p className="agent-profile-muted memory-layer-desc">
            L2 记忆事实：从多轮对话中提炼的稳定偏好与处境，可编辑、可归档；也可在下方直接维护档案字段。
          </p>

          {!editing ? (
        <>
          {profile.basicJson && (
            <dl className="agent-profile-dl">
              {profile.basicJson.age !== undefined && (
                <>
                  <dt>年龄</dt>
                  <dd>{profile.basicJson.age}</dd>
                </>
              )}
              {profile.basicJson.occupation && (
                <>
                  <dt>职业</dt>
                  <dd>{profile.basicJson.occupation}</dd>
                </>
              )}
              {profile.basicJson.familyBackground && (
                <>
                  <dt>原生家庭</dt>
                  <dd>{profile.basicJson.familyBackground}</dd>
                </>
              )}
              {(profile.basicJson.majorLifeEvents?.length ?? 0) > 0 && (
                <>
                  <dt>重大经历</dt>
                  <dd>{profile.basicJson.majorLifeEvents!.join('、')}</dd>
                </>
              )}
            </dl>
          )}

          {profile.interventionJson && (
            <div className="agent-profile-section">
              {profile.interventionJson.preferredTone && (
                <p>
                  <strong>沟通偏好：</strong>
                  {TONE_OPTIONS.find((o) => o.value === profile.interventionJson!.preferredTone)?.label ??
                    profile.interventionJson.preferredTone}
                </p>
              )}
              {(profile.interventionJson.sensitiveTopics?.length ?? 0) > 0 && (
                <p>
                  <strong>敏感话题：</strong>
                  {profile.interventionJson!.sensitiveTopics.join('、')}
                </p>
              )}
              {(profile.interventionJson.avoidPhrases?.length ?? 0) > 0 && (
                <p>
                  <strong>避雷话术：</strong>
                  {profile.interventionJson!.avoidPhrases.join('、')}
                </p>
              )}
              {(profile.interventionJson.effectiveApproaches?.length ?? 0) > 0 && (
                <p>
                  <strong>有效疏导：</strong>
                  {profile.interventionJson!.effectiveApproaches.join('、')}
                </p>
              )}
            </div>
          )}

        </>
      ) : (
        <div className="agent-profile-form">
          <label>
            年龄
            <input type="text" value={basicAge} onChange={(e) => setBasicAge(e.target.value)} />
          </label>
          <label>
            职业
            <input
              type="text"
              value={basicOccupation}
              onChange={(e) => setBasicOccupation(e.target.value)}
            />
          </label>
          <label>
            原生家庭
            <textarea
              rows={2}
              value={basicFamily}
              onChange={(e) => setBasicFamily(e.target.value)}
            />
          </label>
          <label>
            重大经历（顿号或逗号分隔）
            <input type="text" value={basicEvents} onChange={(e) => setBasicEvents(e.target.value)} />
          </label>
          <label>
            沟通偏好
            <select value={preferredTone} onChange={(e) => setPreferredTone(e.target.value)}>
              {TONE_OPTIONS.map((o) => (
                <option key={o.value || 'none'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            敏感话题（顿号分隔）
            <input
              type="text"
              value={sensitiveTopics}
              onChange={(e) => setSensitiveTopics(e.target.value)}
            />
          </label>
          <label>
            避雷话术（顿号分隔）
            <input type="text" value={avoidPhrases} onChange={(e) => setAvoidPhrases(e.target.value)} />
          </label>
          <label>
            有效疏导方式（顿号分隔）
            <input
              type="text"
              value={effectiveApproaches}
              onChange={(e) => setEffectiveApproaches(e.target.value)}
            />
          </label>
          {profile.phase === 'mature' && (
            <label>
              专属 Agent 人设
              <textarea
                rows={4}
                value={agentPrompt}
                onChange={(e) => setAgentPrompt(e.target.value)}
                placeholder="19–24 月阶段可编辑；也可由年度报告自动生成"
              />
            </label>
          )}
        </div>
      )}
        </div>
      )}

      {message && <p className="agent-profile-success">{message}</p>}
      {error && profile && <p className="agent-profile-error">{error}</p>}

      {tab === 'memories' && (
        <div className="memory-tab-panel">
          <p className="agent-profile-muted memory-layer-desc">
            L1 对话记忆：逐条原始对话记录，可按标签筛选、锁定加权、归档或删除。
          </p>
          {memories.length === 0 ? (
            <p className="agent-profile-muted">暂无对话记忆。</p>
          ) : (
        <div className="agent-memory-list">
          <div className="agent-memory-head">
            <h4>对话记忆 · 标签归档</h4>
            <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
              <option value="">全部标签</option>
              {Object.entries(TAG_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {selectedMem.size > 0 && (
            <button
              type="button"
              className="agent-profile-btn small"
              onClick={() => {
                void batchArchiveMemories(userId, Array.from(selectedMem), true).then(() => {
                  setSelectedMem(new Set());
                  void loadMemories();
                  setMessage('已批量归档选中记忆');
                });
              }}
            >
              批量归档（{selectedMem.size}）
            </button>
          )}
          <ul>
            {memories
              .filter((m) => !tagFilter || m.tags?.includes(tagFilter))
              .filter((m) => !m.archived || tagFilter)
              .slice(0, 12)
              .map((m) => (
                <li key={m.dialogTime} className={m.archived ? 'agent-memory-archived' : ''}>
                  <input
                    type="checkbox"
                    checked={selectedMem.has(m.dialogTime)}
                    onChange={() => {
                      setSelectedMem((prev) => {
                        const next = new Set(prev);
                        if (next.has(m.dialogTime)) next.delete(m.dialogTime);
                        else next.add(m.dialogTime);
                        return next;
                      });
                    }}
                  />
                  <div className="agent-memory-body">
                    <span>{m.contentPreview || m.dialogTime}</span>
                    <div className="agent-memory-tags">
                      {(m.tags || []).map((t) => (
                        <span key={t} className="group-tag">
                          {TAG_LABEL[t] || t}
                        </span>
                      ))}
                      {m.locked && <span className="group-tag locked">已锁定·RAG加权</span>}
                      {m.archived && <span className="group-tag archived">已归档</span>}
                    </div>
                  </div>
                  <div className="agent-memory-actions">
                    <button
                      type="button"
                      className="agent-profile-btn small"
                      onClick={() => {
                        void patchMemoryTag(userId, m.dialogTime, { locked: !m.locked }).then(() => {
                          void loadMemories();
                          setMessage(m.locked ? '已取消锁定' : '已锁定，RAG 检索权重提升');
                        });
                      }}
                    >
                      {m.locked ? '解锁' : '锁定'}
                    </button>
                    <button
                      type="button"
                      className="agent-profile-btn small"
                      onClick={() => {
                        void deleteAgentMemory(userId, m.dialogTime).then(() => {
                          void loadMemories();
                          setMessage('已删除该条记忆');
                        });
                      }}
                    >
                      删除
                    </button>
                  </div>
                </li>
              ))}
          </ul>
        </div>
          )}
        </div>
      )}

      <div className="agent-profile-actions">
        {!editing ? (
          <>
            <button
              type="button"
              className="agent-profile-btn primary"
              onClick={() => {
                setEditing(true);
                setTab('facts');
              }}
            >
              编辑档案
            </button>
            <button
              type="button"
              className="agent-profile-btn"
              onClick={() => void handleExport()}
              disabled={exporting}
            >
              {exporting ? '导出中…' : '导出配置包'}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="agent-profile-btn primary"
              onClick={() => void handleSave()}
              disabled={saving}
            >
              {saving ? '保存中…' : '保存'}
            </button>
            <button
              type="button"
              className="agent-profile-btn"
              onClick={() => {
                fillForm(profile);
                setEditing(false);
                setError(null);
              }}
              disabled={saving}
            >
              取消
            </button>
          </>
        )}
      </div>
    </div>
  );
};
