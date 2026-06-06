import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface InsightsPanelShellProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export const InsightsPanelShell: React.FC<InsightsPanelShellProps> = ({
  title,
  children,
  className = ''
}) => {
  const [expanded, setExpanded] = useState(false);

  const close = useCallback(() => setExpanded(false), []);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [expanded, close]);

  const open = () => setExpanded(true);

  return (
    <>
      <section
        className={`insights-panel-shell ${className}`.trim()}
        onDoubleClick={open}
        title="双击或点击右上角放大"
      >
        <header className="insights-panel-shell-head">
          <span className="insights-panel-shell-title">{title}</span>
          <button
            type="button"
            className="insights-panel-expand-btn"
            onClick={open}
            aria-label={`放大查看：${title}`}
            title="放大查看"
          >
            ⛶
          </button>
        </header>
        <div className="insights-panel-shell-body">{children}</div>
      </section>

      {expanded &&
        createPortal(
          <div
            className="insights-lightbox-backdrop"
            role="presentation"
            onClick={close}
          >
            <div
              className="insights-lightbox-panel"
              role="dialog"
              aria-modal="true"
              aria-label={title}
              onClick={(e) => e.stopPropagation()}
            >
              <header className="insights-lightbox-head">
                <h3>{title}</h3>
                <button type="button" className="insights-lightbox-close" onClick={close} aria-label="关闭">
                  ×
                </button>
              </header>
              <div className="insights-lightbox-content">{children}</div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
