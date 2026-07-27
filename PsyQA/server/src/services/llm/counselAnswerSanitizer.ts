const MIN_CHARS = 80;

const REACT_LINE = /^\s*(Thought|Action|Action Input|Observation)\s*:/i;

export function hasReActLeak(text: string): boolean {
  if (!text) return false;
  return REACT_LINE.test(text) || /\bAction Input\s*:/i.test(text);
}

function extractJsonAnswerField(jsonText: string): string {
  try {
    const obj = JSON.parse(jsonText) as Record<string, unknown>;
    const ans = String(obj.answer || obj.response || obj.text || '').trim();
    return ans;
  } catch {
    return '';
  }
}

function extractJsonFromActionInput(raw: string): string {
  const marker = raw.match(/Action Input:\s*/i);
  if (!marker || marker.index === undefined) return '';
  const start = raw.indexOf('{', marker.index);
  if (start < 0) return '';
  let depth = 0;
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return extractJsonAnswerField(raw.slice(start, i + 1));
    }
  }
  return '';
}

/** 从泄漏的 ReAct 文本中提取用户可见回复 */
export function sanitizeCounselAnswer(raw: string): string {
  const text = (raw || '').trim();
  if (!text) return '';

  const fromActionInput = extractJsonFromActionInput(text);
  if (fromActionInput.length >= MIN_CHARS && !hasReActLeak(fromActionInput)) {
    return fromActionInput;
  }

  if (text.startsWith('{')) {
    const fromJson = extractJsonAnswerField(text);
    if (fromJson.length >= MIN_CHARS && !hasReActLeak(fromJson)) return fromJson;
  }

  const lines = text.split('\n');
  const body = lines
    .filter((line) => !REACT_LINE.test(line))
    .join('\n')
    .trim();

  if (body.startsWith('{')) {
    const fromJson = extractJsonAnswerField(body);
    if (fromJson.length >= MIN_CHARS && !hasReActLeak(fromJson)) return fromJson;
  }

  if (body.length >= MIN_CHARS && !hasReActLeak(body)) return body;
  return '';
}

export function isValidCounselAnswer(text: string, minChars = MIN_CHARS): boolean {
  const t = (text || '').trim();
  if (t.length < minChars) return false;
  if (hasReActLeak(t)) return false;
  if (/^\s*\{[\s\S]*"(answer|response)"\s*:/.test(t)) return false;
  return true;
}

export const COUNSEL_ANSWER_MIN_CHARS = MIN_CHARS;
