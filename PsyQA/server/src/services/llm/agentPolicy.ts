export type CounselAgentMode = 'react' | 'planner' | 'tot' | 'loop' | 'auto';
export type ReactMode = 'full' | 'prefetch' | 'planner' | 'tot' | 'loop' | 'off';

export interface AgentPolicy {
  counselEnabled: boolean;
  reactEnabled: boolean;
  reactDemo: boolean;
  mode: CounselAgentMode;
}

function isFastOrLoadTest(): boolean {
  return process.env.PSYQA_FAST_ANSWER === '1' || process.env.PSYQA_LOAD_TEST === '1';
}

const EXCLUSIVE_MODES: CounselAgentMode[] = ['planner', 'tot', 'loop'];

export function resolveAgentPolicy(): AgentPolicy {
  const reactDisabled = process.env.PSYQA_REACT_ENABLED === '0';
  const fast = isFastOrLoadTest();
  const raw = (process.env.PSYQA_AGENT_MODE || 'auto').trim().toLowerCase();
  let mode: CounselAgentMode = 'auto';
  if (raw === 'planner' || raw === 'planner-responder') mode = 'planner';
  else if (raw === 'tot' || raw === 'tree-of-thoughts' || raw === 'tree_of_thoughts') mode = 'tot';
  else if (raw === 'loop' || raw === 'core' || raw === 'taor' || raw === 'core-loop') mode = 'loop';
  else if (raw === 'react') mode = 'react';

  return {
    counselEnabled: !reactDisabled && !fast,
    reactEnabled: !reactDisabled && !fast && !EXCLUSIVE_MODES.includes(mode),
    reactDemo: process.env.PSYQA_REACT_DEMO === '1',
    mode
  };
}

export function shouldRunCounselAgent(): boolean {
  return resolveAgentPolicy().counselEnabled;
}

export function shouldUseReAct(): boolean {
  const p = resolveAgentPolicy();
  return p.reactEnabled && !EXCLUSIVE_MODES.includes(p.mode);
}

export function isReactDemoMode(): boolean {
  return resolveAgentPolicy().reactDemo;
}

export function resolveCounselAgentMode(): CounselAgentMode {
  return resolveAgentPolicy().mode;
}

/** PSYQA_AGENT_MODE=react 或 PSYQA_REACT_DEMO=1：强制完整多步 ReAct，禁止预检索单轮捷径 */
export function isStrictFullReAct(): boolean {
  const mode = resolveCounselAgentMode();
  return mode === 'react' || isReactDemoMode();
}
