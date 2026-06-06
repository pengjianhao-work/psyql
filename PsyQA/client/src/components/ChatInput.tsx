import React, { useState, useRef, useEffect } from 'react';

interface ChatInputProps {
  onSend: (question: string, description: string) => void;
  disabled?: boolean;
  loading?: boolean;
  initializing?: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  disabled,
  loading = false,
  initializing = false
}) => {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  useEffect(() => {
    adjustHeight();
  }, [content]);

  const submit = () => {
    if (content.trim() && !disabled) {
      onSend(content.trim(), '');
      setContent('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const statusHint = loading
    ? '助手正在组织回复…'
    : initializing
      ? '正在加载历史记录…'
      : null;

  return (
    <div className="chat-input">
      {statusHint && <p className="chat-input-status">{statusHint}</p>}
      <form onSubmit={handleSubmit} className={`input-box${disabled ? ' input-box-disabled' : ''}`}>
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            loading ? '请等待当前回复完成…' : '说说你的困扰吧，我会认真倾听…'
          }
          rows={1}
          disabled={disabled}
          aria-label="输入你的问题"
        />
        <div className="input-box-footer">
          <span className="input-hint">Enter 发送 · Shift+Enter 换行</span>
          <button
            type="submit"
            className="send-btn"
            disabled={disabled || !content.trim()}
            aria-label="发送消息"
          >
            <span className="send-btn-text">发送</span>
            <span className="send-btn-icon" aria-hidden="true">
              ↑
            </span>
          </button>
        </div>
      </form>
    </div>
  );
};
