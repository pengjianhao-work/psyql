import React, { useEffect } from 'react';

export interface ToastMessage {
  id: string;
  text: string;
  tone?: 'info' | 'success' | 'warning';
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastStackProps {
  messages: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastStack: React.FC<ToastStackProps> = ({ messages, onDismiss }) => {
  useEffect(() => {
    if (messages.length === 0) return;
    const timers = messages.map((m) =>
      window.setTimeout(() => onDismiss(m.id), m.actionLabel ? 8000 : 5000)
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [messages, onDismiss]);

  if (messages.length === 0) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {messages.map((m) => (
        <div key={m.id} className={`toast-item toast-${m.tone || 'info'}`}>
          <span className="toast-text">{m.text}</span>
          {m.actionLabel && m.onAction && (
            <button type="button" className="toast-action" onClick={m.onAction}>
              {m.actionLabel}
            </button>
          )}
          <button
            type="button"
            className="toast-close"
            aria-label="关闭"
            onClick={() => onDismiss(m.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};
