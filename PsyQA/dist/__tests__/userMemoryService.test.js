"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const userMemoryService_1 = require("../services/userMemoryService");
const userAgentStore_1 = require("../db/userAgentStore");
jest.mock('../db/userAgentStore', () => {
    const actual = jest.requireActual('../db/userAgentStore');
    return Object.assign(Object.assign({}, actual), { getFirstDialogTime: jest.fn(), getUserAgentProfile: jest.fn() });
});
const { getFirstDialogTime, getUserAgentProfile } = jest.requireMock('../db/userAgentStore');
describe('userMemoryService phases', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    it('returns collect when no first dialog', () => {
        getFirstDialogTime.mockReturnValue(null);
        getUserAgentProfile.mockReturnValue(null);
        expect((0, userMemoryService_1.resolveAgentPhase)('u1')).toBe('collect');
        expect((0, userMemoryService_1.getRagBlendWeights)('u1').user).toBe(0.3);
    });
    it('returns shape after 8 months', () => {
        const d = new Date();
        d.setMonth(d.getMonth() - 8);
        getFirstDialogTime.mockReturnValue(d.toISOString());
        getUserAgentProfile.mockReturnValue({ firstDialogAt: d.toISOString() });
        expect((0, userMemoryService_1.resolveAgentPhase)('u1')).toBe('shape');
        expect((0, userMemoryService_1.getRagBlendWeights)('u1').user).toBe(0.6);
    });
    it('returns mature after 20 months', () => {
        const d = new Date();
        d.setMonth(d.getMonth() - 20);
        getFirstDialogTime.mockReturnValue(d.toISOString());
        getUserAgentProfile.mockReturnValue({ firstDialogAt: d.toISOString() });
        expect((0, userMemoryService_1.resolveAgentPhase)('u1')).toBe('mature');
        expect((0, userMemoryService_1.getRagBlendWeights)('u1').user).toBe(0.85);
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
