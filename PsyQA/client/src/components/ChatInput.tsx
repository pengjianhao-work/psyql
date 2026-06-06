import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { checkSensitiveInput } from '../utils/sensitiveInputCheck';
import { CrisisInputGuide } from './CrisisInputGuide';

interface ChatInputProps {
  onSend: (question: string, description: string) => void;
  disabled?: boolean;
  loading?: boolean;
  initializing?: boolean;
  onValidateBeforeSend?: (question: string) => boolean;
}

type SpeechRecognitionCtor = new () => SpeechRecognition;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  disabled,
  loading = false,
  initializing = false,
  onValidateBeforeSend
}) => {
  const [content, setContent] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const [crisisDismissed, setCrisisDismissed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const speechSupported = Boolean(getSpeechRecognition());

  const sensitiveCheck = useMemo(() => checkSensitiveInput(content), [content]);
  const showCrisisGuide =
    !crisisDismissed &&
    (sensitiveCheck.level === 'critical' || sensitiveCheck.level === 'high');

  useEffect(() => {
    if (sensitiveCheck.level === 'none' || sensitiveCheck.level === 'medium') {
      setCrisisDismissed(false);
    }
  }, [sensitiveCheck.level]);

  const adjustHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  useEffect(() => {
    adjustHeight();
  }, [content]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const submit = () => {
    const trimmed = content.trim();
    if (trimmed && !disabled) {
      if (onValidateBeforeSend && !onValidateBeforeSend(trimmed)) {
        return;
      }
      onSend(trimmed, '');
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

  const toggleVoice = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor || disabled || loading) return;

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const recognition = new Ctor();
    recognition.lang = 'zh-CN';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognitionRef.current = recognition;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        transcript += event.results[i][0].transcript;
      }
      if (transcript.trim()) {
        setContent((prev) => (prev ? `${prev}${transcript}` : transcript));
      }
    };

    recognition.onerror = () => {
      setVoiceHint('语音识别失败，请检查麦克风权限');
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
      setVoiceHint(null);
    };

    setListening(true);
    setVoiceHint('正在聆听…');
    recognition.start();
  }, [disabled, loading, listening]);

  const statusHint = loading
    ? '助手正在组织回复…'
    : initializing
      ? '正在加载历史记录…'
      : voiceHint;

  return (
    <div className="chat-input">
      {showCrisisGuide && (
        <CrisisInputGuide check={sensitiveCheck} onDismiss={() => setCrisisDismissed(true)} />
      )}
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
          <span className="input-hint">
            Enter 发送 · Shift+Enter 换行
            {speechSupported ? ' · 可语音输入' : ''}
          </span>
          <div className="input-box-actions">
            {speechSupported && (
              <button
                type="button"
                className={`voice-btn${listening ? ' voice-btn-active' : ''}`}
                onClick={toggleVoice}
                disabled={disabled || loading}
                aria-label={listening ? '停止语音输入' : '语音输入'}
                title={listening ? '停止语音输入' : '语音输入'}
              >
                {listening ? '⏹' : '🎤'}
              </button>
            )}
            <button
              type="submit"
              className="send-btn"
              disabled={disabled || !content.trim()}
              aria-label="发送消息"
            >
              发送
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
