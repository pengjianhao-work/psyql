import { getDb, closeDb } from '../db/database';
import { saveDialogToDb } from '../db/historyStore';
import { saveSessionFeedback } from '../db/feedbackStore';
import { aggregateUserProfile, refreshUserProfile } from '../services/user/userProfileService';
import type { PsychSnapshot } from '../types/psychHistory';

describe('userProfileService', () => {
  const userId = 'test_profile_user';

  beforeAll(() => {
    process.env.PSYQA_DB_PATH = ':memory:';
    closeDb();
  });

  beforeEach(() => {
    closeDb();
    const db = getDb();
    db.prepare('DELETE FROM session_feedback WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM user_profile WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM dialogs WHERE user_id = ?').run(userId);
  });

  let dialogSeq = 0;
  const saveDialog = (userText: string, botText: string, summary: string, psych: PsychSnapshot) => {
    dialogSeq += 1;
    const t = `2026/05/20 10:0${dialogSeq}:00`;
    return saveDialogToDb(userId, userText, botText, summary, psych, undefined, t);
  };

  afterAll(() => {
    closeDb();
    delete process.env.PSYQA_DB_PATH;
  });

  it('aggregates session count and top concerns', () => {
    const psych: PsychSnapshot = {
      emotion: 'anxious',
      risk: 'low',
      problem: 'academic_stress',
      confidence: 0.8,
      stressLevel: 72,
      anxietyLevel: 65,
      moodStability: 50
    };

    saveDialog('考试好焦虑', '回复1', '情绪：焦虑', psych);
    saveDialog('学习压力大', '回复2', '学业压力', {
      ...psych,
      problem: 'academic_stress'
    });
    saveDialog('和室友相处', '回复3', '人际困扰', {
      ...psych,
      problem: 'interpersonal',
      stressLevel: 55
    });

    const profile = aggregateUserProfile(userId);

    expect(profile.sessionCount).toBe(3);
    expect(profile.topConcerns[0]?.category).toBe('academic_stress');
    expect(profile.topConcerns[0]?.count).toBe(2);
    expect(profile.dominantEmotion).toBe('anxious');
    expect(profile.summary).toContain('累计咨询 3 次');
  });

  it('includes feedback stats after refresh', () => {
    const psych: PsychSnapshot = {
      emotion: 'neutral',
      risk: 'low',
      problem: 'other',
      confidence: 0.5,
      stressLevel: 40,
      anxietyLevel: 35,
      moodStability: 60
    };
    const dialogTime = saveDialog('test', 'reply', 'summary', psych);
    saveSessionFeedback(userId, dialogTime, { rating: 5, helpful: true });

    const profile = refreshUserProfile(userId);

    expect(profile.feedbackCount).toBe(1);
    expect(profile.avgRating).toBe(5);
    expect(profile.helpfulRate).toBe(1);
  });
});
