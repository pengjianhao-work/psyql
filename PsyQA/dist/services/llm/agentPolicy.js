"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveAgentPolicy = resolveAgentPolicy;
exports.shouldRunCounselAgent = shouldRunCounselAgent;
exports.shouldUseReAct = shouldUseReAct;
exports.isReactDemoMode = isReactDemoMode;
exports.resolveCounselAgentMode = resolveCounselAgentMode;
function isFastOrLoadTest() {
    return process.env.PSYQA_FAST_ANSWER === '1' || process.env.PSYQA_LOAD_TEST === '1';
}
function resolveAgentPolicy() {
    const reactDisabled = process.env.PSYQA_REACT_ENABLED === '0';
    const fast = isFastOrLoadTest();
    const raw = (process.env.PSYQA_AGENT_MODE || 'auto').trim().toLowerCase();
    let mode = 'auto';
    if (raw === 'planner' || raw === 'planner-responder')
        mode = 'planner';
    else if (raw === 'react')
        mode = 'react';
    return {
        counselEnabled: !reactDisabled && !fast,
        reactEnabled: !reactDisabled && !fast && mode !== 'planner',
        reactDemo: process.env.PSYQA_REACT_DEMO === '1',
        mode
    };
}
function shouldRunCounselAgent() {
    return resolveAgentPolicy().counselEnabled;
}
function shouldUseReAct() {
    const p = resolveAgentPolicy();
    return p.reactEnabled && p.mode !== 'planner';
}
function isReactDemoMode() {
    return resolveAgentPolicy().reactDemo;
}
function resolveCounselAgentMode() {
    return resolveAgentPolicy().mode;
}
