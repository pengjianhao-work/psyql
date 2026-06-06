import React, { useRef, useEffect } from 'react';
import { Message } from '../types';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';

interface ChatContainerProps {
  messages: Message[];
  isLoading: boolean;
  onSend: (question: string, description: string) => void;
  onSimilarQuestionClick: (question: string) => void;
  onClearHistory: () => void;
  onExportHistory?: () => void;
  quickPrompts?: string[];
  initializing?: boolean;
  inputLocked?: boolean;
  exportMenu?: React.ReactNode;
  estimatedWaitSec?: number;
}

export const ChatContainer: React.FC<ChatContainerProps> = ({
  messages,
  isLoading,
  onSend,
  onSimilarQuestionClick,
  onClearHistory,
  onExportHistory,
  quickPrompts = [],
  initializing = false,
  inputLocked = false,
  exportMenu,
  estimatedWaitSec
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const showWelcome = messages.length <= 1 && !isLoading;
  const showQuickPrompts = showWelcome && quickPrompts.length > 0;
  const inputDisabled = isLoading || initializing || inputLocked;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleClear = () => {
    if (window.confirm('确定要清空所有对话记录吗？')) {
      onClearHistory();
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <div className="header-content">
          <h2>💬 心理港湾</h2>
          <p>安全 · 私密 · 不评判的倾听空间</p>
        </div>
        <div className="header-actions">
          {exportMenu}
          {onExportHistory && (
            <button type="button" className="action-btn" onClick={onExportHistory}>
              📥 导出
            </button>
          )}
          <button type="button" className="action-btn" onClick={handleClear}>
            🗑️ 清空
          </button>
        </div>
      </div>

      <div className="chat-messages" ref={messagesContainerRef}>
        {showWelcome && (
          <div className="chat-welcome-hero">
            <div className="chat-welcome-icon" aria-hidden="true">
              🌿
            </div>
            <h3 className="chat-welcome-heading">今天想聊点什么？</h3>
            <p className="chat-welcome-desc">
              可以描述最近的心情、人际或学业压力。我会认真倾听，并给出参考建议。
            </p>
            <ul className="chat-welcome-features">
              <li>🔒 对话仅你可见</li>
              <li>📚 专业心理知识参考</li>
              <li>📊 可查看情绪趋势</li>
            </ul>
          </div>
        )}

        {showQuickPrompts && (
          <div className="chat-welcome">
            <p className="chat-welcome-title">也可以从这些话题开始：</p>
            <div className="quick-prompts">
              {quickPrompts.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="quick-prompt-chip"
                  onClick={() => onSend(q, '')}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            knowledgeSources={message.knowledgeSources}
            onSimilarQuestionClick={onSimilarQuestionClick}
          />
        ))}

        {isLoading && (
          <div className="message-wrapper bot chat-loading-row" aria-live="polite" aria-busy="true">
            <div className="message-avatar">
              <div className="avatar bot-avatar chat-loading-avatar" aria-hidden="true">
                🧠
              </div>
            </div>
            <div className="message-content-wrapper">
              <div className="message-bubble bot chat-loading-bubble">
                <div className="chat-loading-inner">
                  <div className="typing-indicator" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="chat-loading-text">
                    <p className="chat-loading-title">正在认真倾听并思考…</p>
                    {estimatedWaitSec != null && estimatedWaitSec > 0 && (
                      <span className="chat-loading-hint">预计约 {estimatedWaitSec} 秒，请稍候</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <ChatInput
        onSend={onSend}
        disabled={inputDisabled}
        loading={isLoading}
        initializing={initializing}
      />
    </div>
  );
};
