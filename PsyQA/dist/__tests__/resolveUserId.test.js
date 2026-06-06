"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const resolveUserId_1 = require("../utils/resolveUserId");
describe('resolveUserId helpers', () => {
    test('normalizeUserId strips unsafe chars', () => {
        expect((0, resolveUserId_1.normalizeUserId)('acc_abc-123')).toBe('acc_abc-123');
        expect((0, resolveUserId_1.normalizeUserId)('bad id!')).toBe('bad_id_');
    });
    test('guest user pattern', () => {
        expect((0, resolveUserId_1.isGuestUserId)('user1')).toBe(true);
        expect((0, resolveUserId_1.isGuestUserId)('acc_student01')).toBe(false);
    });
    test('guest api allowed in non-production by default', () => {
        const prev = process.env.NODE_ENV;
        process.env.NODE_ENV = 'development';
        expect((0, resolveUserId_1.isGuestApiAllowed)()).toBe(true);
        process.env.NODE_ENV = prev;
    });
});
