import React, { useState, useEffect, useMemo } from 'react';
import { Message, KnowledgeItem, SimilarQuestion, EmotionType, ReActStep } from '../types';
import { formatBotMessage, splitBotContent } from '../utils/formatMessage';
import { truncateText, parseKeywordTags, dedupeSimilarQuestions } from '../utils/refDisplay';

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

function KnowledgeRefCard({ item, index }: { item: KnowledgeItem; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const preview = truncateText(item.answer, 90);
  const needsExpand = item.answer.replace(/\s+/g, ' ').trim().length > 90;

  return (
    <article className="ref-knowledge-card">
      <div className="ref-knowledge-header">
        <span className="ref-index">参考 {index + 1}</span>
        <h5 className="ref-knowledge-title">{item.question}</h5>
      </div>
      <p className="ref-knowledge-preview">{expanded ? item.answer : preview}</p>
      {needsExpand && (
        <button
          type="button"
          className="ref-expand-btn"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? '收起摘要' : '展开全文'}
        </button>
      )}
    </article>
  );
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

const ACTION_LABELS: Record<string, string> = {
  search_knowledge: '检索知识库',
  search_user_memory: '检索用户记忆',
  reflect_psych: '心理分析回顾',
  finish: '生成回复',
  parse_error: '解析失败',
  plan: '规划上下文',
  respond: '生成回复'
};

const REACT_MODE_LABEL: Record<string, string> = {
  full: 'ReAct 完整推理',
  prefetch: 'ReAct 预检索加速',
  planner: 'Planner 规划模式'
};

const GENERATION_HINT_LABEL: Record<string, string> = {
  llm_ok: '',
  fast_kb: '⚡ 知识库 FAST · 规则匹配应答',
  retrieval_miss: '检索未命中 · 已用规则补充',
  kb_empty: '知识库无匹配 · 规则生成',
  llm_fallback: 'LLM 不可用 · 知识库兜底',
  rule_only: '规则模式回复'
};

const STEP_ERROR_ACTIONS = new Set(['parse_error']);

function ReActTracePanel({
  steps,
  reactMode,
  pinned,
  onTogglePin,
  onStepClick
}: {
  steps: ReActStep[];
  reactMode?: Message['reactMode'];
  pinned?: boolean;
  onTogglePin?: () => void;
  onStepClick?: (step: number) => void;
}) {
  const [expanded, setExpanded] = useState(steps.length <= 2);
  if (!steps.length) return null;

  const badgeLabel =
    (reactMode && REACT_MODE_LABEL[reactMode]) || (steps.length > 1 ? 'ReAct' : 'Agent');

  return (
    <div className={`message-react message-extras${pinned ? ' react-panel-pinned' : ''}`}>
      <button
        type="button"
        className="refs-toggle react-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className="react-badge">{badgeLabel}</span>
        {expanded ? '收起推理过程' : '查看推理过程'}
        <span className="refs-count">{steps.length} 步</span>
        {onTogglePin && (
          <span
            role="button"
            tabIndex={0}
            className="react-pin-btn"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.stopPropagation();
                onTogglePin();
              }
            }}
            title={pinned ? '取消固定' : '固定悬浮'}
          >
            {pinned ? '📌' : '📍'}
          </span>
        )}
      </button>

      {expanded && (
        <div className="react-trace-body">
          {steps.map((s) => (
            <article
              key={s.step}
              id={`react-step-${s.step}`}
              className={`react-step${STEP_ERROR_ACTIONS.has(s.action) ? ' react-step-error' : ''}`}
            >
              <header className="react-step-header">
                <button
                  type="button"
                  className="react-step-jump"
                  onClick={() => onStepClick?.(s.step)}
                  title="定位到回答"
                >
                  <span className="react-step-num">Step {s.step}</span>
                </button>
                <span className="react-step-action">{ACTION_LABELS[s.action] || s.action}</span>
              </header>
              {s.thought && <p className="react-step-thought">{s.thought}</p>}
              {s.action !== 'finish' && Object.keys(s.actionInput).length > 0 && (
                <p className="react-step-input">
                  输入：{JSON.stringify(s.actionInput)}
                </p>
              )}
              <p className="react-step-obs">{s.observation}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  knowledgeSources,
  onSimilarQuestionClick
}) => {
  const [displayedContent, setDisplayedContent] = useState('');
  const [isTyping, setIsTyping] = useState(message.type === 'bot');
  const [refsExpanded, setRefsExpanded] = useState(false);
  const [reactPinned, setReactPinned] = useState(false);

  const knowledgeList = useMemo(
    () => knowledgeSources ?? message.knowledgeSources ?? [],
    [knowledgeSources, message.knowledgeSources]
  );
  const relatedTopics = useMemo(
    () => dedupeSimilarQuestions(message.similarQuestions ?? [], knowledgeList.map((k) => k.question)),
    [message.similarQuestions, knowledgeList]
  );

  const hasKnowledge = knowledgeList.length > 0;
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
    setRefsExpanded(false);

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
            {message.reactUsed && <span className="react-inline-badge">ReAct</span>}
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

        {isBot && message.reactTrace && message.reactTrace.length > 0 && (
          <ReActTracePanel
            steps={message.reactTrace}
            reactMode={message.reactMode}
            pinned={reactPinned}
            onTogglePin={() => setReactPinned((v) => !v)}
            onStepClick={() => {
              document.getElementById(`bot-answer-${message.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          />
        )}

        {!isTyping && isBot && hasKnowledge && (
          <div className="message-refs message-extras">
            <button
              type="button"
              className="refs-toggle"
              onClick={() => setRefsExpanded((v) => !v)}
              aria-expanded={refsExpanded}
            >
              {refsExpanded ? '收起知识库来源' : '查看知识库来源'}
              <span className="refs-count">{knowledgeList.length} 条</span>
            </button>

            {refsExpanded && (
              <div className="refs-body">
                <p className="refs-intro">以下内容来自心理知识库，已融入上方回答；此处仅供溯源参考。</p>
                <div className="knowledge-sources">
                  {knowledgeList.map((item, idx) => (
                    <KnowledgeRefCard key={idx} item={item} index={idx} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
