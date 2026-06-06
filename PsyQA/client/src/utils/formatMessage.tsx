import React from 'react';

export function splitBotContent(content: string): { body: string; ethicsNote: string | null } {
  const markers = ['\n\n【重要说明】', '\n【重要说明】', '\n\n---\n\n【重要说明】', '\n\n---'];
  for (const marker of markers) {
    const idx = content.indexOf(marker);
    if (idx >= 0) {
      const body = content.slice(0, idx).trim();
      const ethicsNote = content
        .slice(idx)
        .replace(/^\n+---\n+/m, '')
        .trim();
      return { body: body || content, ethicsNote: ethicsNote || null };
    }
  }
  return { body: content, ethicsNote: null };
}

function formatInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={`${keyPrefix}-b-${i}`}>{part.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={`${keyPrefix}-t-${i}`}>{part}</React.Fragment>;
  });
}

/** 将 bot 回复转为段落与加粗，提升长文可读性 */
export function formatBotMessage(text: string): React.ReactNode {
  const blocks = text.split(/\n\n+/).filter((b) => b.trim());

  return blocks.map((block, bi) => {
    const trimmed = block.trim();
    const isList = /^(\d+[.、]|\*|-|•)\s/m.test(trimmed);

    if (isList) {
      const items = trimmed.split('\n').filter((l) => l.trim());
      return (
        <ul key={bi} className="message-list">
          {items.map((line, li) => {
            const cleaned = line.replace(/^(\d+[.、]|\*|-|•)\s*/, '');
            return <li key={li}>{formatInline(cleaned, `${bi}-${li}`)}</li>;
          })}
        </ul>
      );
    }

    const lines = trimmed.split('\n');
    return (
      <p key={bi} className="message-paragraph">
        {lines.map((line, li) => (
          <React.Fragment key={li}>
            {li > 0 && <br />}
            {formatInline(line, `${bi}-${li}`)}
          </React.Fragment>
        ))}
      </p>
    );
  });
}
