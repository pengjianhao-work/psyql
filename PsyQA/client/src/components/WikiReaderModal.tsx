import React, { useEffect, useState } from 'react';
import { fetchPublishedWikiPage } from '../api';
import { WikiPageDetail } from '../types';

interface WikiReaderModalProps {
  page: { slug: string; title: string } | null;
  onClose: () => void;
}

export const WikiReaderModal: React.FC<WikiReaderModalProps> = ({ page, onClose }) => {
  const [detail, setDetail] = useState<WikiPageDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!page) {
      setDetail(null);
      setError('');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    setDetail(null);
    fetchPublishedWikiPage(page.slug)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch(() => {
        if (!cancelled) setError('这篇内容暂时打不开，稍后再试试');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page]);

  if (!page) return null;

  return (
    <div className="wiki-reader-overlay" role="dialog" aria-modal="true" aria-labelledby="wiki-reader-title" onClick={onClose}>
      <div className="wiki-reader-modal" onClick={(e) => e.stopPropagation()}>
        <div className="wiki-reader-header">
          <div>
            <h3 id="wiki-reader-title">{detail?.title || page.title}</h3>
            {detail?.summary && <p className="wiki-reader-summary">{detail.summary}</p>}
          </div>
          <button type="button" className="wiki-reader-close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="wiki-reader-body">
          {loading && <p className="wiki-reader-status">正在打开…</p>}
          {error && <p className="wiki-reader-status wiki-reader-error">{error}</p>}
          {detail && (
            <>
              {detail.sections.map((section, idx) => (
                <section key={idx} className="wiki-reader-section">
                  <h4>{section.heading}</h4>
                  <p>{section.body}</p>
                </section>
              ))}
              {detail.relatedQuestions.length > 0 && (
                <section className="wiki-reader-section">
                  <h4>相关问题</h4>
                  <ul>
                    {detail.relatedQuestions.map((q, idx) => (
                      <li key={idx}>{q}</li>
                    ))}
                  </ul>
                </section>
              )}
              {detail.sourceRefs.length > 0 && (
                <section className="wiki-reader-section wiki-reader-sources">
                  <h4>参考来源</h4>
                  <ul>
                    {detail.sourceRefs.map((ref, idx) => (
                      <li key={idx}>
                        <strong>{ref.question}</strong>
                        <span>{ref.answer.slice(0, 80)}{ref.answer.length > 80 ? '…' : ''}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default WikiReaderModal;
