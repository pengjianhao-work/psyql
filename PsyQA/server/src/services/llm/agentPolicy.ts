export type CounselAgentMode = 'react' | 'planner' | 'auto';
export type ReactMode = 'full' | 'prefetch' | 'planner' | 'off';

export interface AgentPolicy {
  counselEnabled: boolean;
  reactEnabled: boolean;
  reactDemo: boolean;
  mode: CounselAgentMode;
}

function isFastOrLoadTest(): boolean {
  return process.env.PSYQA_FAST_ANSWER === '1' || process.env.PSYQA_LOAD_TEST === '1';
}

export function resolveAgentPolicy(): AgentPolicy {
  const reactDisabled = process.env.PSYQA_REACT_ENABLED === '0';
  const fast = isFastOrLoadTest();
  const raw = (process.env.PSYQA_AGENT_MODE || 'auto').trim().toLowerCase();
  let mode: CounselAgentMode = 'auto';
  if (raw === 'planner' || raw === 'planner-responder') mode = 'planner';
  else if (raw === 'react') mode = 'react';

  return {
    counselEnabled: !reactDisabled && !fast,
    reactEnabled: !reactDisabled && !fast && mode !== 'planner',
    reactDemo: process.env.PSYQA_REACT_DEMO === '1',
    mode
  };
}

export function shouldRunCounselAgent(): boolean {
  return resolveAgentPolicy().counselEnabled;
}

export function shouldUseReAct(): boolean {
  const p = resolveAgentPolicy();
  return p.reactEnabled && p.mode !== 'planner';
}

export function isReactDemoMode(): boolean {
  return resolveAgentPolicy().reactDemo;
}

export function resolveCounselAgentMode(): CounselAgentMode {
  return resolveAgentPolicy().mode;
}
