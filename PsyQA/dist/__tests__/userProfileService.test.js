"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../db/database");
const historyStore_1 = require("../db/historyStore");
const feedbackStore_1 = require("../db/feedbackStore");
const userProfileService_1 = require("../services/user/userProfileService");
describe('userProfileService', () => {
    const userId = 'test_profile_user';
    beforeAll(() => {
        process.env.PSYQA_DB_PATH = ':memory:';
        (0, database_1.closeDb)();
    });
    beforeEach(() => {
        (0, database_1.closeDb)();
        const db = (0, database_1.getDb)();
        db.prepare('DELETE FROM session_feedback WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM user_profile WHERE user_id = ?').run(userId);
        db.prepare('DELETE FROM dialogs WHERE user_id = ?').run(userId);
    });
    let dialogSeq = 0;
    const saveDialog = (userText, botText, summary, psych) => {
        dialogSeq += 1;
        const t = `2026/05/20 10:0${dialogSeq}:00`;
        return (0, historyStore_1.saveDialogToDb)(userId, userText, botText, summary, psych, undefined, t);
    };
    afterAll(() => {
        (0, database_1.closeDb)();
        delete process.env.PSYQA_DB_PATH;
    });
    it('aggregates session count and top concerns', () => {
        var _a, _b;
        const psych = {
            emotion: 'anxious',
            risk: 'low',
            problem: 'academic_stress',
            confidence: 0.8,
            stressLevel: 72,
            anxietyLevel: 65,
            moodStability: 50
        };
        saveDialog('考试好焦虑', '回复1', '情绪：焦虑', psych);
        saveDialog('学习压力大', '回复2', '学业压力', Object.assign(Object.assign({}, psych), { problem: 'academic_stress' }));
        saveDialog('和室友相处', '回复3', '人际困扰', Object.assign(Object.assign({}, psych), { problem: 'interpersonal', stressLevel: 55 }));
        const profile = (0, userProfileService_1.aggregateUserProfile)(userId);
        expect(profile.sessionCount).toBe(3);
        expect((_a = profile.topConcerns[0]) === null || _a === void 0 ? void 0 : _a.category).toBe('academic_stress');
        expect((_b = profile.topConcerns[0]) === null || _b === void 0 ? void 0 : _b.count).toBe(2);
        expect(profile.dominantEmotion).toBe('anxious');
        expect(profile.summary).toContain('累计咨询 3 次');
    });
    it('includes feedback stats after refresh', () => {
        const psych = {
            emotion: 'neutral',
            risk: 'low',
            problem: 'other',
            confidence: 0.5,
            stressLevel: 40,
            anxietyLevel: 35,
            moodStability: 60
        };
        const dialogTime = saveDialog('test', 'reply', 'summary', psych);
        (0, feedbackStore_1.saveSessionFeedback)(userId, dialogTime, { rating: 5, helpful: true });
        const profile = (0, userProfileService_1.refreshUserProfile)(userId);
        expect(profile.feedbackCount).toBe(1);
        expect(profile.avgRating).toBe(5);
        expect(profile.helpfulRate).toBe(1);
    });
});
