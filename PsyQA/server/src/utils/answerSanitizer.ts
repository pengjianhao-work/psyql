/** 去掉 LLM 开头复述用户原话 */
export function stripUserQuestionEcho(answer: string, question: string): string {
  let text = answer.trim();
  const q = question.trim();
  if (!q || q.length < 4) return text;

  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const qEsc = escapeRe(q);

  if (text.startsWith(q)) {
    text = text.slice(q.length).replace(/^[,，、。\s]+/, '').trim();
  }

  text = text.replace(new RegExp(`^${qEsc}[，,、\\s]*`), '').trim();

  const dearMatch = text.match(/^亲爱的[，,]?\s*/);
  if (dearMatch && q.length >= 6) {
    const afterDear = text.slice(dearMatch[0].length).trim();
    if (afterDear.startsWith(q) || afterDear.startsWith(q.slice(0, Math.min(20, q.length)))) {
      text = afterDear.replace(new RegExp(`^${qEsc}[，,、\\s]*`), '').trim();
    }
  }

  const dupPrefix = q.slice(0, Math.min(24, q.length));
  if (dupPrefix.length >= 8) {
    const re = new RegExp(`^(${escapeRe(dupPrefix)}[\\s，,]*){2,}`, 'u');
    text = text.replace(re, '').trim();
  }

  return text;
}
