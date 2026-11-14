/**
 * 心理港湾知识库来自论坛帖子（楼主/楼楼/题主…），
 * 检索注入和最终回答两处都要清洗，避免模型模仿论坛称呼。
 */

const FORUM_TERM = '楼主大大|楼主|楼楼|题主|层主';

/** 把论坛称呼、帖子作者自我介绍替换成对用户自然的说法。 */
export function sanitizeForumStyle(text: string): string {
  if (!text) return '';
  let out = text;

  // 1. “亲爱的楼主你好呀，”整体换成“你好，”
  out = out.replace(
    new RegExp('(亲爱的\\s*)?(' + FORUM_TERM + ')\\s*你好(呀|啊|哈)?\\s*[，,！!~～]?', 'g'),
    '你好，'
  );

  // 2. “楼主，”“亲爱的楼楼，”：句首 → “你好，”，句中 → “你，”
  out = out.replace(
    new RegExp('(亲爱的\\s*)?(' + FORUM_TERM + ')\\s*([，,])', 'g'),
    (match: string, _dear: string, _term: string, _comma: string, offset: number, whole: string) => {
      const before = whole.slice(0, offset).trimEnd();
      const sentenceStart = before.length === 0 || /[。！？!?\n]$/.test(before);
      return sentenceStart ? '你好，' : '你，';
    }
  );

  // 3. 其余称呼直接换成“你”（楼主的问题 → 你的问题）
  out = out.replace(new RegExp('(亲爱的\\s*)?(' + FORUM_TERM + ')', 'g'), '你');

  // 4. 论坛作者自我介绍（“这里是阿凉，一个愿意做你的小太阳的人。”）整句删掉
  out = out.replace(/这里(是|叫)?\s*阿凉[，,][^。！？\n]*[。！？]?/g, '');
  out = out.replace(/阿凉/g, '我');

  // 5. 收拾标点与空白
  out = out.replace(/[ \t]*([，。！？；：])[ \t]*/g, '$1');
  out = out.replace(/^[，,。；;、\s]+/, '');
  out = out.replace(/([，,。！？])\1+/g, '$1');
  return out.trim();
}
