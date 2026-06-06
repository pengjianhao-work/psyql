import React, { useState, useRef, useEffect } from 'react';

export type ExportFormat = 'txt' | 'json' | 'report' | 'print';

interface ExportMenuProps {
  onExport: (format: ExportFormat) => void;
  disabled?: boolean;
}

export const ExportMenu: React.FC<ExportMenuProps> = ({ onExport, disabled }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (format: ExportFormat) => {
    setOpen(false);
    onExport(format);
  };

  return (
    <div className="export-menu" ref={ref}>
      <button
        type="button"
        className="action-btn"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        📥 导出
      </button>
      {open && (
        <div className="export-menu-dropdown" role="menu">
          <button type="button" role="menuitem" onClick={() => pick('txt')}>
            对话记录 (.txt)
          </button>
          <button type="button" role="menuitem" onClick={() => pick('json')}>
            完整数据 (.json)
          </button>
          <button type="button" role="menuitem" onClick={() => pick('report')}>
            咨询摘要 + 打印
          </button>
        </div>
      )}
    </div>
  );
};
