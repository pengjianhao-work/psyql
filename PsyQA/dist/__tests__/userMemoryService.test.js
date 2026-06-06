"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const userMemoryService_1 = require("../services/user/userMemoryService");
const ragWeightPolicy_1 = require("../services/user/ragWeightPolicy");
const userAgentStore_1 = require("../db/userAgentStore");
jest.mock('../db/userAgentStore', () => {
    const actual = jest.requireActual('../db/userAgentStore');
    return Object.assign(Object.assign({}, actual), { getFirstDialogTime: jest.fn(), getUserAgentProfile: jest.fn(), countUserDialogVectors: jest.fn() });
});
const { getFirstDialogTime, getUserAgentProfile, countUserDialogVectors } = jest.requireMock('../db/userAgentStore');
describe('userMemoryService phases', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        countUserDialogVectors.mockReturnValue(0);
    });
    it('returns collect when no first dialog', () => {
        getFirstDialogTime.mockReturnValue(null);
        getUserAgentProfile.mockReturnValue(null);
        expect((0, userMemoryService_1.resolveAgentPhase)('u1')).toBe('collect');
        expect((0, userMemoryService_1.getRagBlendWeights)('u1').user).toBe(0.3);
        expect((0, userMemoryService_1.getRagBlendWeights)('u1').timelineUser).toBe(0.3);
    });
    it('returns shape after 8 months with interpolated weight', () => {
        const d = new Date();
        d.setMonth(d.getMonth() - 8);
        getFirstDialogTime.mockReturnValue(d.toISOString());
        getUserAgentProfile.mockReturnValue({ firstDialogAt: d.toISOString() });
        expect((0, userMemoryService_1.resolveAgentPhase)('u1')).toBe('shape');
        const w = (0, userMemoryService_1.getRagBlendWeights)('u1');
        expect(w.timelineUser).toBeGreaterThan(0.45);
        expect(w.timelineUser).toBeLessThan(0.7);
        expect(w.user).toBe(w.timelineUser);
    });
    it('returns mature after 20 months with interpolated weight', () => {
        const d = new Date();
        d.setMonth(d.getMonth() - 20);
        getFirstDialogTime.mockReturnValue(d.toISOString());
        getUserAgentProfile.mockReturnValue({ firstDialogAt: d.toISOString() });
        expect((0, userMemoryService_1.resolveAgentPhase)('u1')).toBe('mature');
        const w = (0, userMemoryService_1.getRagBlendWeights)('u1');
        expect(w.timelineUser).toBeGreaterThan(0.7);
        expect(w.timelineUser).toBeLessThan(0.85);
    });
    it('adds memory boost when dialog vectors accumulate', () => {
        getFirstDialogTime.mockReturnValue(null);
        getUserAgentProfile.mockReturnValue(null);
        countUserDialogVectors.mockReturnValue(25);
        const w = (0, userMemoryService_1.getRagBlendWeights)('u1');
        expect(w.memoryBoost).toBe(0.03);
        expect(w.user).toBe(0.33);
    });
});
describe('dynamic weight helpers', () => {
    it('interpolates timeline anchors', () => {
        expect((0, ragWeightPolicy_1.computeTimelineUserWeight)(0)).toBe(0.3);
        expect((0, ragWeightPolicy_1.computeTimelineUserWeight)(6)).toBe(0.45);
        expect((0, ragWeightPolicy_1.computeTimelineUserWeight)(12)).toBeCloseTo(0.575, 2);
        expect((0, ragWeightPolicy_1.computeTimelineUserWeight)(24)).toBe(0.85);
        expect((0, ragWeightPolicy_1.computeTimelineUserWeight)(30)).toBe(0.85);
    });
    it('computes memory boost tiers', () => {
        expect((0, ragWeightPolicy_1.computeMemoryBoost)(0)).toBe(0);
        expect((0, ragWeightPolicy_1.computeMemoryBoost)(5)).toBe(0.015);
        expect((0, ragWeightPolicy_1.computeMemoryBoost)(20)).toBe(0.03);
        expect((0, ragWeightPolicy_1.computeMemoryBoost)(50)).toBe(0.05);
    });
});
describe('userAgentStore ensure', () => {
    it('ensureUserAgentProfile creates row', () => {
        var _a;
        const id = `test_agent_${Date.now()}`;
        const row = (0, userAgentStore_1.ensureUserAgentProfile)(id);
        expect(row.userId).toBe(id);
        expect(row.agentPhase).toBe('collect');
        (0, userAgentStore_1.updateUserAgentProfile)(id, {
            basicJson: { age: 20, occupation: 'student' }
        });
        const updated = (0, userAgentStore_1.ensureUserAgentProfile)(id);
        expect((_a = updated.basicJson) === null || _a === void 0 ? void 0 : _a.age).toBe(20);
    });
});
