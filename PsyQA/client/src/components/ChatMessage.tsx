import React, { useState, useEffect, useMemo } from 'react';
import { Message, KnowledgeItem, SimilarQuestion, EmotionType } from '../types';
import { formatBotMessage, splitBotContent } from '../utils/formatMessage';
import { parseKeywordTags, dedupeSimilarQuestions } from '../utils/refDisplay';

interface ChatMessageProps {
  message: Message;
  knowledgeSources?: KnowledgeItem[];
  onSimilarQuestionClick?: (question: string) => void;
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

function typingInterval(contentLength: number): { step: number; ms: number } {
  if (contentLength > 800) return { step: 8, ms: 12 };
  if (contentLength > 400) return { step: 4, ms: 16 };
  if (contentLength > 150) return { step: 2, ms: 22 };
  return { step: 1, ms: 28 };
}

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
  onSimilarQuestionClick
}) => {
  const [displayedContent, setDisplayedContent] = useState('');
  const [isTyping, setIsTyping] = useState(message.type === 'bot');

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

  const { body: answerBody, ethicsNote } = useMemo(
    () => (isBot && !isTyping ? splitBotContent(displayedContent) : { body: displayedContent, ethicsNote: null }),
    [isBot, isTyping, displayedContent]
  );

  useEffect(() => {
    if (!isBot) {
      setDisplayedContent(message.content);
      setIsTyping(false);
      return;
    }

    if (message.streaming) {
      setDisplayedContent(message.content);
      setIsTyping(false);
      return;
    }

    setDisplayedContent('');
    setIsTyping(true);

    const content = message.content;
    const { step, ms } = typingInterval(content.length);
    let index = 0;

    const interval = window.setInterval(() => {
      index = Math.min(index + step, content.length);
      setDisplayedContent(content.slice(0, index));
      if (index >= content.length) {
        window.clearInterval(interval);
        setIsTyping(false);
      }
    }, ms);

    return () => window.clearInterval(interval);
  }, [message.content, message.streaming, isBot]);

  const formattedBody = useMemo(
    () => (isBot && !isTyping ? formatBotMessage(answerBody) : null),
    [isBot, isTyping, answerBody]
  );

  const formattedEthics = useMemo(
    () => (ethicsNote ? formatBotMessage(ethicsNote) : null),
    [ethicsNote]
  );

  const skipTyping = () => {
    if (isTyping && isBot) {
      setDisplayedContent(message.content);
      setIsTyping(false);
    }
  };

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
        {isBot && message.emotion && (
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
            {formattedBody ?? (
              <>
                {isBot && !isTyping ? answerBody : displayedContent}
                {isTyping && <span className="typing-cursor" aria-hidden="true">|</span>}
              </>
            )}
          </div>

          {isTyping && isBot && (
            <button type="button" className="skip-typing-btn" onClick={skipTyping}>
              跳过动画
            </button>
          )}

          {message.timestamp && !isTyping && (
            <div className="message-timestamp">{message.timestamp}</div>
          )}
        </div>

        {!isTyping && isBot && ethicsNote && (
          <div className="message-ethics-note">
            <div className="message-ethics-note-text">{formattedEthics ?? ethicsNote}</div>
          </div>
        )}

        {!isTyping && isBot && message.risk && (message.risk.level === 'high' || message.risk.level === 'critical') && (
          <div className={`risk-warning ${message.risk.level}`}>
            <div className="warning-icon" aria-hidden="true">
              ⚠️
            </div>
            <div className="warning-content">
              <div className="warning-title">危机预警</div>
              <div className="warning-message">{message.risk.warningMessage}</div>
              <div className="warning-hotline">{message.risk.hotline}</div>
            </div>
          </div>
        )}

        {!isTyping && isBot && hasRelated && (
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

      </div>
    </div>
  );
};
