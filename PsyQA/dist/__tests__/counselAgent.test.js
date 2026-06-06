"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const counselAgent_1 = require("../services/llm/counselAgent");
describe('counselAgent', () => {
    it('resolveCounselAgentMode reads env', () => {
        const prev = process.env.PSYQA_AGENT_MODE;
        process.env.PSYQA_AGENT_MODE = 'planner';
        expect((0, counselAgent_1.resolveCounselAgentMode)()).toBe('planner');
        process.env.PSYQA_AGENT_MODE = 'react';
        expect((0, counselAgent_1.resolveCounselAgentMode)()).toBe('react');
        if (prev === undefined)
            delete process.env.PSYQA_AGENT_MODE;
        else
            process.env.PSYQA_AGENT_MODE = prev;
    });
    it('shouldRunCounselAgent respects disable flags', () => {
        const prev = process.env.PSYQA_REACT_ENABLED;
        process.env.PSYQA_REACT_ENABLED = '0';
        expect((0, counselAgent_1.shouldRunCounselAgent)()).toBe(false);
        if (prev === undefined)
            delete process.env.PSYQA_REACT_ENABLED;
        else
            process.env.PSYQA_REACT_ENABLED = prev;
    });
});
