import React from 'react';
import { KnowledgeItem } from '../types';

/** 前端兜底：去掉误展示的 ReAct 内部步骤 */
export function stripReActLeakFromDisplay(text: string): string {
  if (!text || !/(^|\n)\s*Action\s*:/i.test(text)) return text;
  const jsonMatch = text.match(/Action Input:\s*(\{[\s\S]*\})/i);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[1]) as { answer?: string; response?: string; text?: string };
      const ans = (obj.answer || obj.response || obj.text || '').trim();
      if (ans.length >= 40) return ans;
    } catch {
      /* ignore */
    }
  }
  return text
    .split('\n')
    .filter((line) => !/^\s*(Thought|Action|Action Input|Observation)\s*:/i.test(line))
    .join('\n')
    .trim();
}

export function splitBotContent(content: string): { body: string; ethicsNote: string | null } {
  const cleaned = stripReActLeakFromDisplay(content);
  const markers = ['\n\n【重要说明】', '\n【重要说明】', '\n\n---\n\n【重要说明】', '\n\n---'];
  for (const marker of markers) {
    const idx = cleaned.indexOf(marker);
    if (idx >= 0) {
      const body = cleaned.slice(0, idx).trim();
      const ethicsNote = cleaned
        .slice(idx)
        .replace(/^\n+---\n+/m, '')
        .trim();
      return { body: body || cleaned, ethicsNote: ethicsNote || null };
    }
  }
  return { body: cleaned, ethicsNote: null };
}

function CiteMark({ n, source }: { n: number; source?: KnowledgeItem }) {
  const snippet = (source?.answer || source?.question || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  return (
    <span className="cite-mark">
      <sup className="cite-sup" tabIndex={0}>
        [{n}]
      </sup>
      <span className="cite-card" role="tooltip">
        {snippet || '这条资料还在整理'}
      </span>
    </span>
  );
}

function formatInline(text: string, keyPrefix: string, sources?: KnowledgeItem[]): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\[\d+\])/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${keyPrefix}-b-${i}`}>{part.slice(2, -2)}</strong>;
    }
    const cite = part.match(/^\[(\d+)\]$/);
    if (cite) {
      const n = Number(cite[1]);
      return <CiteMark key={`${keyPrefix}-c-${i}`} n={n} source={sources?.[n - 1]} />;
    }
    return <React.Fragment key={`${keyPrefix}-t-${i}`}>{part}</React.Fragment>;
  });
}

/** 将 bot 回复转为段落与加粗，提升长文可读性 */
export function formatBotMessage(text: string, sources?: KnowledgeItem[]): React.ReactNode {
  const blocks = text.split(/\n\n+/).map((block) => block.trim()).filter((block) => block && !/^-{2,}$/.test(block));

  return blocks.map((block, bi) => {
    const trimmed = block.trim();
    const isList = /^(\d+[.、]|\*|-|•)\s/m.test(trimmed);

    if (isList) {
      const items = trimmed.split('\n').filter((l) => l.trim());
      return (
        <ul key={bi} className="message-list">
          {items.map((line, li) => {
            const cleaned = line.replace(/^(\d+[.、]|\*|-|•)\s*/, '');
            return <li key={li}>{formatInline(cleaned, `${bi}-${li}`, sources)}</li>;
          })}
        </ul>
      );
    }

    const lines = trimmed.split('\n').filter((line) => line.trim() && !/^-{2,}$/.test(line.trim()));
    if (!lines.length) return null;
    return (
      <p key={bi} className="message-paragraph">
        {lines.map((line, li) => (
          <React.Fragment key={li}>
            {li > 0 && <br />}
            {formatInline(line, `${bi}-${li}`, sources)}
          </React.Fragment>
        ))}
      </p>
    );
  });
}
