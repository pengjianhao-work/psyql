import React, { useRef, useEffect, useState } from 'react';
import { Message } from '../types';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';

interface ChatContainerProps {
  messages: Message[];
  isLoading: boolean;
  isGenerating?: boolean;
  onSend: (question: string, description: string) => void;
  onStopGenerate?: () => void;
  onPauseGenerate?: () => void;
  onResumeGenerate?: () => void;
  streamPaused?: boolean;
  onSimilarQuestionClick: (question: string) => void;
  onRetry?: (question: string) => void;
  onClearHistory: () => void;
  onExportHistory?: () => void;
  quickPrompts?: string[];
  initializing?: boolean;
  inputLocked?: boolean;
  exportMenu?: React.ReactNode;
  estimatedWaitSec?: number;
  fastAnswerMode?: boolean;
  onValidateBeforeSend?: (question: string) => boolean;
  sessions?: Array<{ id: string; title: string; status: 'active' | 'archived' }>;
  activeSessionId?: string;
  onNewSession?: () => void;
  onEndSession?: () => void;
  onSelectSession?: (id: string) => void;
  hideCompanions?: boolean;
  onOpenVideoCenter?: () => void;
}

export const ChatContainer: React.FC<ChatContainerProps> = ({
  messages,
  isLoading,
  isGenerating = false,
  onSend,
  onStopGenerate,
  onPauseGenerate,
  onResumeGenerate,
  streamPaused = false,
  onSimilarQuestionClick,
  onRetry,
  onClearHistory,
  onExportHistory,
  quickPrompts = [],
  initializing = false,
  inputLocked = false,
  exportMenu,
  estimatedWaitSec,
  fastAnswerMode = false,
  onValidateBeforeSend,
  sessions = [],
  activeSessionId,
  onNewSession,
  onEndSession,
  onSelectSession,
  hideCompanions = false,
  onOpenVideoCenter
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const [showNew, setShowNew] = useState(false);
  const lateHour = new Date().getHours() >= 23 || new Date().getHours() < 6;
  const showWelcome = messages.length <= 1 && !isLoading && !isGenerating;
  const visibleMessages = showWelcome ? messages.filter((message) => message.id !== '1') : messages;
  const userTurns = messages.filter((message) => message.type === 'user').length;
  const promptCards = quickPrompts.slice(0, 3);
  const showQuickPrompts = showWelcome && promptCards.length > 0;
  const inputDisabled = isLoading || initializing || inputLocked;
  const showStop = isGenerating && onStopGenerate;

  useEffect(() => {
    if (stickToBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setShowNew(false);
    } else {
      setShowNew(true);
    }
  }, [messages, isLoading]);

  const onMessagesScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distance < 80;
    if (stickToBottomRef.current) setShowNew(false);
  };

  const handleClear = () => {
    if (window.confirm('确定要清空所有对话记录吗？')) {
      onClearHistory();
    }
  };

  return (
    <div className={`chat-container${lateHour ? ' chat-late' : ''}`}>
      <div className="chat-header">
        <div className="header-content">
          <span className="chat-brand-mark" aria-hidden="true">
            港
          </span>
          <div className="chat-brand-text">
            <h2>心理港湾</h2>
            <p>慢慢说就好</p>
          </div>
        </div>
        <div className="header-actions">
          {exportMenu}
          {onExportHistory && (
            <button type="button" className="action-btn" onClick={onExportHistory}>
              📥 导出
            </button>
          )}
          <button type="button" className="action-btn action-btn-quiet" onClick={handleClear}>
            清空
          </button>
          {onNewSession && (
            <button
              type="button"
              className="action-btn action-btn-primary"
              onClick={onNewSession}
              disabled={isLoading || isGenerating}
            >
              新对话
            </button>
          )}
          {onEndSession && (
            <button
              type="button"
              className="action-btn action-btn-outline"
              onClick={onEndSession}
              disabled={isLoading || isGenerating || messages.length <= 1}
            >
              结束这段
            </button>
          )}
        </div>
      </div>
      {sessions.length > 0 && (
        <label className="conversation-bar">
          <span>会话</span>
          <select
            value={activeSessionId || ''}
            onChange={(event) => onSelectSession?.(event.target.value)}
            disabled={isLoading || isGenerating}
          >
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.status === 'archived' ? `${session.title}（已结束）` : session.title}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="chat-stream">
      <div
        className={`chat-messages${showWelcome ? ' chat-messages-welcome' : ''}`}
        ref={messagesContainerRef}
        onScroll={onMessagesScroll}
      >
        {showWelcome && (
          <div className="chat-welcome-hero">
            <div className="sand-minis" aria-hidden="true">
              <span className="sand-mini sand-mini-shell" />
              <span className="sand-mini sand-mini-stone" />
              <span className="sand-mini sand-mini-tree" />
            </div>
            <h3 className="chat-welcome-heading">最近怎么样？</h3>
            <p className="chat-welcome-desc">学业、关系和心情，都可以。不是只有撑不住才来。</p>
            {onOpenVideoCenter && (
              <button
                type="button"
                className="welcome-video-entry"
                onClick={onOpenVideoCenter}
              >
                看看心理视频
              </button>
            )}
          </div>
        )}

        {showQuickPrompts && (
          <div className="chat-welcome">
            <div className="quick-prompts">
              {promptCards.map((q) => (
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

        {visibleMessages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            knowledgeSources={message.knowledgeSources}
            onSimilarQuestionClick={onSimilarQuestionClick}
            onRetry={onRetry}
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
                    <p className="chat-loading-title">我在听你说…</p>
                    {estimatedWaitSec != null && estimatedWaitSec > 0 && !fastAnswerMode && (
                      <span className="chat-loading-hint">预计约 {estimatedWaitSec} 秒，请稍候</span>
                    )}
                    {fastAnswerMode && (
                      <span className="chat-loading-hint">通常 1–3 秒内返回</span>
                    )}
                  </div>
                  {showStop && (
                    <div className="stream-control-row">
                      {!streamPaused ? (
                        <button type="button" className="stream-pause-btn" onClick={onPauseGenerate}>
                          暂停输出
                        </button>
                      ) : (
                        <button type="button" className="stream-pause-btn" onClick={onResumeGenerate}>
                          继续输出
                        </button>
                      )}
                      <button type="button" className="stream-stop-btn" onClick={onStopGenerate}>
                        停止生成
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {!isLoading && showStop && (
          <div className="stream-stop-bar">
            <span>{streamPaused ? '输出已暂停…' : '正在输出回复…'}</span>
            <div className="stream-control-row">
              {!streamPaused ? (
                <button type="button" className="stream-pause-btn" onClick={onPauseGenerate}>
                  暂停
                </button>
              ) : (
                <button type="button" className="stream-pause-btn" onClick={onResumeGenerate}>
                  继续
                </button>
              )}
              <button type="button" className="stream-stop-btn" onClick={onStopGenerate}>
                停止
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
      {showNew && !showWelcome && (
        <button
          type="button"
          className="new-message-jump"
          onClick={() => {
            stickToBottomRef.current = true;
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            setShowNew(false);
          }}
        >
          ↓ 新消息
        </button>
      )}
      </div>

      {userTurns >= 10 && <p className="session-close-hint">今天先聊到这？我随时在。</p>}

      <ChatInput
        onSend={onSend}
        disabled={inputDisabled}
        loading={isLoading || isGenerating}
        initializing={initializing}
        onValidateBeforeSend={onValidateBeforeSend}
        hideCompanions={hideCompanions}
      />
    </div>
  );
};
