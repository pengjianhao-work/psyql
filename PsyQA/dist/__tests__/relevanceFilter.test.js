"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const relevanceFilter_1 = require("../utils/relevanceFilter");
const questionCatalog_1 = require("../services/question/questionCatalog");
describe('relevanceFilter', () => {
    test('hasDirectTopicOverlap detects shared phrases', () => {
        expect((0, relevanceFilter_1.hasDirectTopicOverlap)('和舍友打架了', '宿舍矛盾怎么办')).toBe(true);
        expect((0, relevanceFilter_1.hasDirectTopicOverlap)('和舍友打架了', '高三喜欢一个没有联系的人')).toBe(false);
    });
    test('filterSimilarQuestionsForDisplay drops weak matches', () => {
        const items = [
            {
                question: '高三，喜欢一个没有联系的人，这份喜欢是否要坚持？',
                description: '恋爱',
                keywords: '恋爱',
                answers: [],
                similarity: 5
            },
            {
                question: '和室友关系不好，很烦恼怎么办？',
                description: '宿舍人际',
                keywords: '宿舍',
                answers: [],
                similarity: 9
            }
        ];
        const out = (0, relevanceFilter_1.filterSimilarQuestionsForDisplay)('今天和舍友打架了', undefined, items, 3);
        expect(out.length).toBe(1);
        expect(out[0].question).toContain('室友');
    });
    test('filterKnowledgeForDisplay keeps only related items', () => {
        const items = [
            { question: '考试焦虑', answer: '关于考试压力的建议', relevance: 4 },
            { question: '宿舍冲突处理', answer: '与室友沟通边界', relevance: 8 }
        ];
        const out = (0, relevanceFilter_1.filterKnowledgeForDisplay)('和舍友吵架', items, 3);
        expect(out.length).toBe(1);
        expect(out[0].question).toContain('宿舍');
    });
});
describe('findSimilarQuestions', () => {
    const mockQuestions = [
        {
            questionID: 1,
            question: '我已经失眠很久了，每天一睡着就想哭，我要崩溃了？',
            description: '情绪',
            keywords: '失眠 焦虑',
            answers: [{ answer_text: '...', has_label: false, labels_sequence: null }]
        },
        {
            questionID: 2,
            question: '和室友关系不好，很烦恼',
            description: '人际',
            keywords: '宿舍 室友',
            answers: [{ answer_text: '...', has_label: false, labels_sequence: null }]
        },
        {
            questionID: 3,
            question: '高三，喜欢一个没有联系的人',
            description: '恋爱',
            keywords: '恋爱',
            answers: [{ answer_text: '...', has_label: false, labels_sequence: null }]
        }
    ];
    test('returns empty for unrelated generic query context', () => {
        const result = (0, questionCatalog_1.findSimilarQuestions)('今天天气真好', mockQuestions, 3);
        expect(result.length).toBe(0);
    });
    test('returns roommate-related for dorm conflict query', () => {
        const result = (0, questionCatalog_1.findSimilarQuestions)('今天和舍友打架了', mockQuestions, 3);
        expect(result.length).toBeGreaterThan(0);
        expect(result.some((r) => r.question.includes('室友') || r.question.includes('宿舍'))).toBe(true);
        expect(result.some((r) => r.question.includes('高三'))).toBe(false);
    });
});
