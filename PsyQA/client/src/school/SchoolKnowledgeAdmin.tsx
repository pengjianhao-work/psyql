import React, { useCallback, useEffect, useState } from 'react';
import {
  createKnowledgeItem,
  fetchKnowledgeItems,
  fetchKnowledgeUpdateStatus,
  getErrorMessage,
  KnowledgeCatalogItem,
  KnowledgeCategoryFilter,
  submitKnowledgeReview
} from '../api';

const CATEGORY_OPTIONS: Array<{ value: KnowledgeCategoryFilter; label: string }> = [
  { value: 'all', label: '全部分类' },
  { value: 'academic_stress', label: '学业压力' },
  { value: 'interpersonal', label: '人际关系' },
  { value: 'crisis', label: '危机干预' },
  { value: 'emotion_regulation', label: '情绪调节' },
  { value: 'family_relationship', label: '家庭关系' }
];

const ADD_CATEGORIES = CATEGORY_OPTIONS.filter((c) => c.value !== 'all');

export const SchoolKnowledgeAdmin: React.FC = () => {
  const [items, setItems] = useState<KnowledgeCatalogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [category, setCategory] = useState<KnowledgeCategoryFilter>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<{ knowledgeBaseCount: number; vectorDbCount: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [newQ, setNewQ] = useState('');
  const [newA, setNewA] = useState('');
  const [newCat, setNewCat] = useState<KnowledgeCategoryFilter>('academic_stress');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, status] = await Promise.all([
        fetchKnowledgeItems({ category, q: query || undefined, page }),
        fetchKnowledgeUpdateStatus()
      ]);
      setItems(list.items);
      setTotal(list.total);
      setStats({
        knowledgeBaseCount: status.live.knowledgeBaseCount,
        vectorDbCount: status.live.vectorDbCount
      });
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [category, query, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await createKnowledgeItem({ question: newQ, answer: newA, category: newCat });
      setNewQ('');
      setNewA('');
      setMsg('已添加并热重载知识库');
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleReview = async (item: KnowledgeCatalogItem, verdict: 'correct' | 'incorrect' | 'partial') => {
    try {
      await submitKnowledgeReview({
        question: item.question,
        answerPreview: item.answer.slice(0, 500),
        verdict
      });
      setMsg(`已提交众审标注：${verdict}`);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="school-knowledge-admin">
      <div className="school-page-head">
        <h2>知识库可视化后台</h2>
        {stats && (
          <p className="muted school-page-sub">
            共 {stats.knowledgeBaseCount} 条知识 · 向量库 {stats.vectorDbCount} 条
          </p>
        )}
      </div>

      <section className="school-card school-kb-add">
        <h3>新增知识条目</h3>
        <div className="school-kb-form">
          <select value={newCat} onChange={(e) => setNewCat(e.target.value as KnowledgeCategoryFilter)}>
            {ADD_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="典型问题"
            value={newQ}
            onChange={(e) => setNewQ(e.target.value)}
          />
          <textarea
            rows={3}
            placeholder="标准回答（支持多行）"
            value={newA}
            onChange={(e) => setNewA(e.target.value)}
          />
          <button type="button" className="save-care-btn" disabled={saving || !newQ.trim() || !newA.trim()} onClick={() => void handleAdd()}>
            {saving ? '保存中…' : '添加并重载'}
          </button>
        </div>
      </section>

      <div className="school-toolbar">
        <select value={category} onChange={(e) => { setCategory(e.target.value as KnowledgeCategoryFilter); setPage(1); }}>
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          type="search"
          placeholder="搜索问题/回答…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void load()}
        />
        <button type="button" className="save-care-btn" onClick={() => void load()}>
          搜索
        </button>
      </div>

      {msg && <p className="agent-profile-success">{msg}</p>}
      {error && <p className="school-error-inline">{error}</p>}

      {loading ? (
        <p className="muted">加载中…</p>
      ) : (
        <ul className="school-kb-list">
          {items.map((item) => (
            <li key={item.index} className="school-kb-item">
              <div className="school-kb-tags">
                {item.categoryLabels.map((l) => (
                  <span key={l} className="group-tag">
                    {l}
                  </span>
                ))}
              </div>
              <strong>{item.question}</strong>
              <p>{item.answer.slice(0, 280)}{item.answer.length > 280 ? '…' : ''}</p>
              <div className="school-kb-review-btns">
                <button type="button" className="school-btn-secondary small" onClick={() => void handleReview(item, 'correct')}>
                  准确
                </button>
                <button type="button" className="school-btn-secondary small" onClick={() => void handleReview(item, 'partial')}>
                  部分准确
                </button>
                <button type="button" className="school-btn-muted small" onClick={() => void handleReview(item, 'incorrect')}>
                  不准确
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="school-kb-pager">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            上一页
          </button>
          <span>
            {page} / {totalPages}（共 {total} 条）
          </span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            下一页
          </button>
        </div>
      )}
    </div>
  );
};

export default SchoolKnowledgeAdmin;
