"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ragService_1 = require("../services/knowledge/ragService");
const memoryCache_1 = require("../utils/memoryCache");
describe('ragService cache', () => {
    beforeAll(() => {
        (0, ragService_1.reloadKnowledgeBase)();
    });
    beforeEach(() => {
        (0, memoryCache_1.cacheDeletePrefix)('rag:');
    });
    it('retrieveKnowledge returns cached results for identical queries', () => {
        const q = 'unique-cache-test-query-xyz';
        const first = (0, ragService_1.retrieveKnowledge)(q, 2);
        const second = (0, ragService_1.retrieveKnowledge)(q, 2);
        expect(second).toEqual(first);
        expect(first).toBe(second);
    });
});
