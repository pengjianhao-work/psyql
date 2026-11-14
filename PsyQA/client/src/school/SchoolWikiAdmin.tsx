import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchWikiPages,
  fetchWikiPage,
  updateWikiStatus,
  rebuildWiki,
  getErrorMessage,
  WikiBuildState,
  WikiListResponse,
  WikiPageDetail,
  WikiStatus
} from '../api';
import './school-wiki.css';

const CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'all', label: '全部分类' },
  { value: 'academic_stress', label: '学业压力' },
  { value: 'emotion_regulation', label: '情绪调节' },
  { value: 'interpersonal', label: '人际关系' },
  { value: 'family_relationship', label: '家庭关系' },
  { value: 'romantic_relationship', label: '恋爱关系' },
  { value: 'career_future', label: '职业未来' },
  { value: 'self_identity', label: '自我认同' },
  { value: 'body_image', label: '身体意象' },
  { value: 'addiction', label: '成瘾问题' },
  { value: 'trauma', label: '创伤经历' }
];

const STATUS_LABEL: Record<WikiStatus, string> = {
  published: '已发布',
  draft: '草稿',
  archived: '已归档'
};

function categoryLabel(value: string): string {
  return CATEGORY_OPTIONS.find((item) => item.value === value)?.label || value;
}

export const SchoolWikiAdmin: React.FC = () => {
  const [data, setData] = useState<WikiListResponse | null>(null);
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState<'all' | WikiStatus>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [detail, setDetail] = useState<WikiPageDetail | null>(null);
  const [rebuildCategory, setRebuildCategory] = useState('all');
  const [rebuildCount, setRebuildCount] = useState(8);
  const [rebuildStarting, setRebuildStarting] = useState(false);
  const [build, setBuild] = useState<WikiBuildState | null>(null);
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchWikiPages({
        category,
        status,
        q: query || undefined,
        page
      });
      setData(result);
      setBuild(result.build);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [category, status, query, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!build?.running) {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    if (pollRef.current) return;
    pollRef.current = window.setInterval(() => {
      void load();
    }, 4000);
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [build?.running, load]);

  const openDetail = async (slug: string) => {
    setError(null);
    try {
      setDetail(await fetchWikiPage(slug));
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const changeStatus = async (slug: string, next: WikiStatus) => {
    setError(null);
    try {
      await updateWikiStatus(slug, next);
      setMsg('已把「' + slug + '」设为' + STATUS_LABEL[next]);
      await load();
      await openDetail(slug);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  const startRebuild = async () => {
    setRebuildStarting(true);
    setMsg(null);
    setError(null);
    try {
      const state = await rebuildWiki({ category: rebuildCategory, perCategory: rebuildCount });
      setBuild(state);
      setMsg('重建任务已在后台启动，列表会自动刷新。');
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setRebuildStarting(false);
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const running = Boolean(build?.running);

  return (
    <div className="school-wiki-admin">
      <div className="school-page-head">
        <h2>LLM Wiki 知识层</h2>
        {data && (
          <p className="muted school-page-sub">
            共 {data.totals.total} 页 · 已发布 {data.totals.published} · 草稿 {data.totals.draft} · 归档{' '}
            {data.totals.archived}
          </p>
        )}
      </div>

      <section className="school-card school-wiki-build">
        <h3>离线重建</h3>
        <p className="muted school-wiki-build-hint">
          按分类选种子、取真实知识库来源、用 72B 生成结构化页面，校验通过才发布；重建在后台子进程执行，不阻塞问答，也不会改动 mental_dataset。
        </p>
        <div className="school-wiki-build-form">
          <select
            value={rebuildCategory}
            onChange={(e) => setRebuildCategory(e.target.value)}
            disabled={running}
          >
            {CATEGORY_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <label className="school-wiki-build-count">
            每类页数
            <input
              type="number"
              min={1}
              max={20}
              value={rebuildCount}
              onChange={(e) => setRebuildCount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))}
              disabled={running}
            />
          </label>
          <button
            type="button"
            className="save-care-btn"
            disabled={running || rebuildStarting}
            onClick={() => void startRebuild()}
          >
            {running ? '重建中…' : rebuildStarting ? '启动中…' : '开始重建'}
          </button>
        </div>
        <p className="muted school-wiki-build-status">
          最近状态：{running ? '执行中' : build?.ok === true ? '成功' : build?.ok === false ? '失败' : '未运行'}
          {build?.summary ? ' · ' + build.summary : ''}
          {build?.finishedAt ? ' · ' + build.finishedAt : ''}
        </p>
      </section>

      <div className="school-toolbar">
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
        >
          {CATEGORY_OPTIONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as 'all' | WikiStatus);
            setPage(1);
          }}
        >
          <option value="all">全部状态</option>
          <option value="published">已发布</option>
          <option value="draft">草稿</option>
          <option value="archived">已归档</option>
        </select>
        <input
          type="search"
          placeholder="搜索标题/摘要…"
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

      <div className="school-wiki-layout">
        <div className="school-wiki-list-wrap">
          {loading ? (
            <p className="muted">加载中…</p>
          ) : (
            <ul className="school-kb-list school-wiki-list">
              {(data?.items || []).map((item) => (
                <li
                  key={item.slug}
                  className={'school-kb-item school-wiki-item' + (detail?.slug === item.slug ? ' is-active' : '')}
                  onClick={() => void openDetail(item.slug)}
                >
                  <div className="school-kb-tags">
                    <span className="group-tag">{categoryLabel(item.category)}</span>
                    <span className={'wiki-status wiki-status-' + item.status}>{STATUS_LABEL[item.status]}</span>
                  </div>
                  <strong>{item.title}</strong>
                  <p>{item.summary}</p>
                  <p className="muted school-wiki-item-meta">
                    来源 {item.sourceCount} 条 · {item.sectionCount} 段 · {item.hasEmbedding ? '已嵌入' : '无嵌入'} ·{' '}
                    {item.updatedAt.slice(0, 10)}
                  </p>
                </li>
              ))}
              {!data?.items.length && <li className="muted">还没有 wiki 页，先点「开始重建」。</li>}
            </ul>
          )}

          {data && totalPages > 1 && (
            <div className="school-kb-pager">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                上一页
              </button>
              <span>
                {page} / {totalPages}（共 {data.total} 页）
              </span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                下一页
              </button>
            </div>
          )}
        </div>

        <aside className="school-wiki-detail-wrap">
          {!detail ? (
            <p className="muted school-wiki-empty">点击左侧一页查看正文、来源引用和发布状态。</p>
          ) : (
            <div className="school-card school-wiki-detail">
              <h3>{detail.title}</h3>
              <p className="muted school-wiki-detail-summary">{detail.summary}</p>
              <p className="muted school-wiki-detail-meta">
                分类：{categoryLabel(detail.category)} · 模型：{detail.model} · 更新：{detail.updatedAt.slice(0, 10)}
              </p>
              <div className="school-wiki-detail-actions">
                {(['published', 'draft', 'archived'] as WikiStatus[]).map((next) => (
                  <button
                    key={next}
                    type="button"
                    className={'school-btn-secondary small' + (detail.status === next ? ' is-active' : '')}
                    disabled={detail.status === next}
                    onClick={() => void changeStatus(detail.slug, next)}
                  >
                    {STATUS_LABEL[next]}
                  </button>
                ))}
              </div>
              {detail.sections.map((section) => (
                <section key={section.heading} className="school-wiki-section">
                  <h4>{section.heading}</h4>
                  <p>{section.body}</p>
                </section>
              ))}
              {detail.relatedQuestions.length > 0 && (
                <section className="school-wiki-section">
                  <h4>相关追问</h4>
                  <ul>
                    {detail.relatedQuestions.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ul>
                </section>
              )}
              <section className="school-wiki-sources">
                <h4>来源（{detail.sourceRefs.length} 条真实知识库文档）</h4>
                <ul>
                  {detail.sourceRefs.map((ref) => (
                    <li key={ref.docId}>
                      <code>{ref.docId}</code> {ref.question}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

export default SchoolWikiAdmin;
