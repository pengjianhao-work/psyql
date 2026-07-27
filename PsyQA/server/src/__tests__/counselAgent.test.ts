import { resolveCounselAgentMode, shouldRunCounselAgent } from '../services/llm/counselAgent';

describe('counselAgent', () => {
  it('resolveCounselAgentMode reads env', () => {
    const prev = process.env.PSYQA_AGENT_MODE;
    process.env.PSYQA_AGENT_MODE = 'planner';
    expect(resolveCounselAgentMode()).toBe('planner');
    process.env.PSYQA_AGENT_MODE = 'react';
    expect(resolveCounselAgentMode()).toBe('react');
    process.env.PSYQA_AGENT_MODE = 'tot';
    expect(resolveCounselAgentMode()).toBe('tot');
    process.env.PSYQA_AGENT_MODE = 'loop';
    expect(resolveCounselAgentMode()).toBe('loop');
    if (prev === undefined) delete process.env.PSYQA_AGENT_MODE;
    else process.env.PSYQA_AGENT_MODE = prev;
  });

  it('shouldRunCounselAgent respects disable flags', () => {
    const prev = process.env.PSYQA_REACT_ENABLED;
    process.env.PSYQA_REACT_ENABLED = '0';
    expect(shouldRunCounselAgent()).toBe(false);
    if (prev === undefined) delete process.env.PSYQA_REACT_ENABLED;
    else process.env.PSYQA_REACT_ENABLED = prev;
  });
});
