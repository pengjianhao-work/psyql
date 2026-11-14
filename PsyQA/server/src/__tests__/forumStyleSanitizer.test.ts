import { sanitizeForumStyle } from '../utils/forumStyleSanitizer';

describe('sanitizeForumStyle', () => {
  it('去掉论坛称呼并换成对用户说话', () => {
    expect(sanitizeForumStyle('亲爱的楼楼，我理解你现在感到学习压力很大。')).toBe('你好，我理解你现在感到学习压力很大。');
    expect(sanitizeForumStyle('嗨，楼楼你好呀，很高兴见到你。')).toBe('嗨，你好，很高兴见到你。');
    expect(sanitizeForumStyle('楼主，看到你习惯性检讨自己，我很心疼。')).toBe('你好，看到你习惯性检讨自己，我很心疼。');
    expect(sanitizeForumStyle('感谢楼主的分享，这很有帮助。')).toBe('感谢你的分享，这很有帮助。');
  });

  it('去掉题主、层主等称呼', () => {
    expect(sanitizeForumStyle('题主的问题在于评价来源太单一。')).toBe('你的问题在于评价来源太单一。');
  });

  it('删掉帖子作者自我介绍和昵称', () => {
    const text = '嗨，楼楼你好呀，这里是阿凉，一个愿意做你的小太阳的人。阿凉想先抱抱你。';
    const cleaned = sanitizeForumStyle(text);
    expect(cleaned).not.toContain('阿凉');
    expect(cleaned).not.toContain('楼楼');
    expect(cleaned).toContain('你好');
  });

  it('没有论坛称呼时保留普通称呼（亲爱的可以出现）', () => {
    expect(sanitizeForumStyle('亲爱的，听到你最近学习压力很大，我能理解你的感受。')).toBe(
      '亲爱的，听到你最近学习压力很大，我能理解你的感受。'
    );
  });

  it('没有论坛称呼时原样返回（只整理空白）', () => {
    expect(sanitizeForumStyle('你可以先做一次 4 秒吸气。')).toBe('你可以先做一次 4 秒吸气。');
  });
});
