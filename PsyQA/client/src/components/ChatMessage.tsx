import React, { useState, useEffect, useMemo } from 'react';
import { Message, KnowledgeItem, SimilarQuestion, EmotionType } from '../types';
import { formatBotMessage, splitBotContent } from '../utils/formatMessage';
import { parseKeywordTags, dedupeSimilarQuestions } from '../utils/refDisplay';
import { VideoCard } from './VideoCard';

interface ChatMessageProps {
  message: Message;
  knowledgeSources?: KnowledgeItem[];
  onSimilarQuestionClick?: (question: string) => void;
  onRetry?: (question: string) => void;
}

const emotionIcons: Record<EmotionType, string> = {
  happy: '😊',
  sad: '😢',
  anxious: '😰',
  angry: '😠',
  lonely: '🥺',
  neutral: '😌',
  hopeful: '🌟',
  confused: '😕',
  frustrated: '😤',
  guilty: '😔',
  shameful: '😳',
  proud: '😊'
};

const emotionLabels: Record<EmotionType, string> = {
  happy: '开心',
  sad: '低落',
  anxious: '焦虑',
  angry: '愤怒',
  lonely: '孤独',
  neutral: '平稳',
  hopeful: '充满希望',
  confused: '迷茫困惑',
  frustrated: '挫败',
  guilty: '内疚',
  shameful: '羞愧',
  proud: '自豪'
};

function RelatedTopicItem({
  item,
  onClick
}: {
  item: SimilarQuestion;
  onClick?: (question: string) => void;
}) {
  const tags = parseKeywordTags(item.keywords);

  return (
    <button type="button" className="related-topic-item" onClick={() => onClick?.(item.question)}>
      <span className="related-topic-text">{item.question}</span>
      {tags.length > 0 && (
        <span className="related-topic-tags">
          {tags.map((tag) => (
            <span key={tag} className="topic-tag">
              {tag}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

const GENERATION_HINT_LABEL: Record<string, string> = {
  llm_ok: '',
  fast_kb: '⚡ 知识库 FAST · 规则匹配应答',
  retrieval_miss: '检索未命中 · 已用规则补充',
  kb_empty: '知识库无匹配 · 规则生成',
  llm_fallback: 'LLM 不可用 · 知识库兜底',
  rule_only: '规则模式回复'
};

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  knowledgeSources,
  onSimilarQuestionClick,
  onRetry
}) => {
  const [thinkOpen, setThinkOpen] = useState(Boolean(message.reactTrace?.length) && !message.content);
  const [copied, setCopied] = useState(false);

  const knowledgeList = useMemo(
    () => knowledgeSources ?? message.knowledgeSources ?? [],
    [knowledgeSources, message.knowledgeSources]
  );
  const relatedTopics = useMemo(
    () => dedupeSimilarQuestions(message.similarQuestions ?? [], knowledgeList.map((k) => k.question)),
    [message.similarQuestions, knowledgeList]
  );

  const hasRelated = relatedTopics.length > 0;
  const isBot = message.type === 'bot';
  const streaming = Boolean(message.streaming);

  useEffect(() => {
    if (message.content) setThinkOpen(false);
  }, [message.content]);

  const { body: answerBody, ethicsNote } = useMemo(
    () => (isBot ? splitBotContent(message.content) : { body: message.content, ethicsNote: null }),
    [isBot, message.content]
  );

  const formattedBody = useMemo(
    () => (isBot ? formatBotMessage(answerBody, knowledgeList) : null),
    [isBot, answerBody, knowledgeList]
  );

  const formattedEthics = useMemo(
    () => (ethicsNote ? formatBotMessage(ethicsNote) : null),
    [ethicsNote]
  );

  const timeLabel = useMemo(() => {
    const raw = message.timestamp || '';
    const match = raw.match(/(\d{1,2}):(\d{2})/);
    return match ? `${match[1].padStart(2, '0')}:${match[2]}` : raw;
  }, [message.timestamp]);

  if (message.retryQuestion) {
    return (
      <div className="message-wrapper system">
        <button type="button" className="stream-retry" onClick={() => onRetry?.(message.retryQuestion || '')}>
          刚才那条没发出去，点这里重试
        </button>
      </div>
    );
  }

  const copyAnswer = () => {
    const text = message.content.trim();
    if (!text || !navigator.clipboard) return;
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };

  const traceCount = message.reactTrace?.length ?? 0;

  return (
    <div className={`message-wrapper ${message.type}`}>
      <div className="message-avatar">
        {message.type === 'user' ? (
          <div className="avatar user-avatar" aria-hidden="true">
            👤
          </div>
        ) : (
          <div
            className="avatar bot-avatar"
            style={{ backgroundColor: message.emotionStyle?.color || '#6366f1' }}
            aria-hidden="true"
          >
            🧠
          </div>
        )}
      </div>

      <div className="message-content-wrapper">
        {isBot && traceCount > 0 && (
          <details className="thinking-strip" open={thinkOpen} onToggle={(event) => setThinkOpen(event.currentTarget.open)}>
            <summary>{message.content ? '检索过程' : `正在检索 ${traceCount} 步…`}</summary>
          </details>
        )}

        {isBot && message.emotion && !streaming && (
          <div className="emotion-tag" style={{ color: message.emotionStyle?.color }}>
            {emotionIcons[message.emotion.emotion]} {emotionLabels[message.emotion.emotion]}
            {message.reactUsed && (
              <span className="react-inline-badge">
                {message.reactMode === 'tot' ? 'ToT' : message.reactMode === 'planner' ? 'Planner' : 'ReAct'}
              </span>
            )}
          </div>
        )}

        <div className={`message-bubble ${message.type}`} id={isBot ? `bot-answer-${message.id}` : undefined}>
          <div className="message-text">
            {isBot ? formattedBody : message.content}
            {streaming && <span className="typing-cursor" aria-hidden="true">|</span>}
          </div>

          {isBot && !streaming && message.content.trim() && (
            <div className="msg-actions">
              <button type="button" className="msg-action" onClick={copyAnswer}>
                {copied ? '已复制' : '复制'}
              </button>
            </div>
          )}
        </div>

        {!streaming && isBot && ethicsNote && (
          <div className="message-ethics-note">
            <div className="message-ethics-note-text">{formattedEthics ?? ethicsNote}</div>
          </div>
        )}

        {!streaming && isBot && message.risk && (message.risk.level === 'high' || message.risk.level === 'critical') && (
          <div className={`risk-warning ${message.risk.level}`}>
            <div className="warning-icon" aria-hidden="true">
              ⚠️
            </div>
            <div className="warning-content">
              <div className="warning-title">
                {message.risk.level === 'critical' ? '请先确认你是否安全' : '听起来最近挺难的'}
              </div>
              <div className="warning-message">{message.risk.warningMessage}</div>
              <div className="warning-hotline">{message.risk.hotline}</div>
            </div>
          </div>
        )}

        {!streaming && isBot && message.videos && message.videos.length > 0 && (
          <section className="video-recommend message-extras" aria-label="心理视频推荐">
            <div className="video-recommend-header">
              <span className="video-recommend-icon" aria-hidden="true">
                🎬
              </span>
              <div>
                <h4 className="video-recommend-title">也许一段视频能帮到你</h4>
                <p className="video-recommend-hint">来自抖音的心理治愈内容</p>
              </div>
            </div>
            <div className="video-recommend-list">
              {message.videos.map((video) => (
                <VideoCard key={video.id} video={video} compact />
              ))}
            </div>
          </section>
        )}

        {!streaming && isBot && hasRelated && (
          <section className="related-topics message-extras" aria-label="相关话题">
            <div className="related-topics-header">
              <span className="related-topics-icon" aria-hidden="true">
                💡
              </span>
              <div>
                <h4 className="related-topics-title">你可能还想了解</h4>
                <p className="related-topics-hint">点击可继续提问</p>
              </div>
            </div>
            <div className="related-topics-list">
              {relatedTopics.map((item, idx) => (
                <RelatedTopicItem key={idx} item={item} onClick={onSimilarQuestionClick} />
              ))}
            </div>
          </section>
        )}

        {isBot && message.generationHint && GENERATION_HINT_LABEL[message.generationHint] && (
          <p
            className={`generation-hint-tag${message.generationHint === 'fast_kb' ? ' generation-hint-fast' : ''}`}
            role="status"
          >
            {GENERATION_HINT_LABEL[message.generationHint]}
          </p>
        )}

        {message.timestamp && !streaming && (
          <div className="message-meta">
            {isBot ? `心理港湾 · ${timeLabel}` : timeLabel}
          </div>
        )}
      </div>
    </div>
  );
};
