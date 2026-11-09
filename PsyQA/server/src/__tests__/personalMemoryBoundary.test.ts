import { formatPersonalMemories, personalMemoryMatchesQuestion } from '../services/user/userMemoryService';
import {
  episodeIsActive,
  formatEpisodeInstruction,
  nextPreferenceCount,
  planEpisode,
  topicFromVector,
  topicOfText
} from '../services/user/episodeLink';
import type { SearchResult } from '../services/knowledge/searchTypes';

function memory(question: string, similarity: number, dialogTime?: string): SearchResult {
  return {
    id: question,
    question,
    answer: `用户：${question}\n助理：先休息一下。`,
    similarity,
    source: 'user',
    dialogTime
  };
}

describe('personal memory boundary', () => {
  test('a new study question does not keep an unrelated dorm memory', () => {
    const text = formatPersonalMemories(
      [memory('我和室友因为宿舍卫生吵架了', 0.55)],
      '',
      { question: '最近晚上复习效率不高，时间总是排不开', continuePrevious: false }
    );
    expect(text).toBe('');
  });

  test('follow-up keeps the previous topic even without shared words', () => {
    const text = formatPersonalMemories(
      [memory('我和室友因为宿舍卫生吵架了', 0.4)],
      '',
      { question: '然后呢', continuePrevious: true }
    );
    expect(text).toContain('宿舍卫生');
  });

  test('the same study thread links across days, and a lone shared word does not', () => {
    expect(personalMemoryMatchesQuestion(0.4, '学业', '学业', true)).toBe(false);
    expect(personalMemoryMatchesQuestion(0.78, '学业', '学业', true)).toBe(true);
    expect(topicOfText('数学考试考得不好')).toBe('学业');
    expect(topicOfText('我连续几天做不成数学题')).toBe('学业');
  });

  test('a kind math teacher does not become a topic just because it contains 数学', () => {
    expect(topicOfText('数学老师人很好')).toBeUndefined();
    expect(topicOfText('考试考砸了')).toBe('学业');
    expect(personalMemoryMatchesQuestion(0.9, undefined, '学业', true)).toBe(false);
  });

  test('school and work stay apart even when the vectors are close', () => {
    expect(topicOfText('我导师很严厉')).toBe('学业');
    expect(topicOfText('我老板很严厉')).toBe('职场');
    expect(personalMemoryMatchesQuestion(0.91, '学业', '职场', true)).toBe(false);
  });

  test('an event older than a week is recalled only when it is clearly the same thread', () => {
    const old = '2020/01/01 08:00:00';
    expect(episodeIsActive(old, Date.parse('2026-11-09T08:00:00'))).toBe(false);
    expect(
      formatPersonalMemories([memory('我连续几天做不成数学题', 0.75, old)], '', {
        question: '数学考试还是考得不好',
        continuePrevious: false
      })
    ).toBe('');
    expect(
      formatPersonalMemories([memory('我连续几天做不成数学题', 0.86, old)], '', {
        question: '数学考试还是考得不好',
        continuePrevious: false
      })
    ).toContain('数学题');
  });

  test('repeated events on one topic collapse into a single note', () => {
    const text = formatPersonalMemories(
      [
        memory('数学考试第一天没考好', 0.8, '2099/01/01 08:00:00'),
        memory('数学题第二天还是做不出来', 0.79, '2099/01/02 08:00:00'),
        memory('复习计划第三天又排乱了', 0.78, '2099/01/03 08:00:00')
      ],
      '',
      { question: '数学考试还是考不好', continuePrevious: false }
    );
    expect(text).toContain('合并成一件事');
    expect(text).not.toContain('当时的回应');
  });

  test('tone preference waits for the third matching signal', () => {
    expect(nextPreferenceCount(undefined, '说话短一些').ready).toBe(false);
    expect(nextPreferenceCount({ 说话短一些: 2 }, '说话短一些').ready).toBe(true);
  });

  test('a weak cluster does not receive a topic label', () => {
    const prototypes = { 学业: [1, 0, 0], 职场: [0, 1, 0] };
    expect(topicFromVector([1, 0, 0], prototypes)).toBe('学业');
    expect(topicFromVector([0.7, 0.68, 0], prototypes)).toBeUndefined();
  });
});

describe('same-turn episodes', () => {
  test('comma-separated complaints split without a conjunction', () => {
    const plan = planEpisode('我书丢了，还没赶上地铁，烦死了');
    expect(plan.clauses).toHaveLength(2);
    expect(plan.mode).toBe('woven');
    const note = formatEpisodeInstruction(plan);
    expect(note).toContain('书丢了');
    expect(note).toContain('没赶上地铁');
    expect(note).toContain('先接住');
    expect(note).not.toContain('逐件回应');
  });

  test('the user tying events to one feeling is not corrected', () => {
    const plain = planEpisode('我今天事事不顺');
    expect(plain.mode).toBe('single');
    expect(formatEpisodeInstruction(plain)).toBe('');
    const woven = planEpisode('书丢了，地铁也没赶上，我是不是很倒霉');
    expect(woven.mode).toBe('woven');
    expect(formatEpisodeInstruction(woven)).toContain('不要另编因果');
  });

  test('three parallel events stay three threads', () => {
    const plan = planEpisode('书丢了、地铁没赶上、作业也没写');
    expect(plan.clauses).toHaveLength(3);
    expect(plan.mode).toBe('split');
    const note = formatEpisodeInstruction(plan);
    expect(note).toContain('书丢了');
    expect(note).toContain('地铁没赶上');
    expect(note).toContain('作业也没写');
    expect(note).toContain('逐件回应');
  });

  test('math practice and a math exam stay one thread', () => {
    const plan = planEpisode('我连续几天做不成数学题。数学考试也考不好。');
    expect(plan.mode).toBe('joined');
    expect(formatEpisodeInstruction(plan)).toBe('');
  });
});
