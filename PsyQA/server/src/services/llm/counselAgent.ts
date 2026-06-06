import { runReActCounselAgent, shouldUseReAct } from './reactCounselAgent';
import type { ReActCounselContext, ReActCounselResult, ReActStep } from './reactCounselAgent';
import { runPlannerRespondAgent } from './plannerRespondAgent';

export type { ReActStep, ReActCounselContext, ReActCounselResult };
export { shouldUseReAct, resolveReActPlan } from './reactCounselAgent';

export type CounselAgentMode = 'react' | 'planner' | 'auto';

export function resolveCounselAgentMode(): CounselAgentMode {
  const raw = (process.env.PSYQA_AGENT_MODE || 'auto').trim().toLowerCase();
  if (raw === 'planner' || raw === 'planner-responder') return 'planner';
  if (raw === 'react') return 'react';
  return 'auto';
}

export function shouldRunCounselAgent(): boolean {
  if (process.env.PSYQA_REACT_ENABLED === '0') return false;
  if (process.env.PSYQA_FAST_ANSWER === '1') return false;
  if (process.env.PSYQA_LOAD_TEST === '1') return false;
  return true;
}

export async function runCounselAgent(
  ctx: ReActCounselContext,
  options?: {
    maxSteps?: number;
    temperature?: number;
    timeoutMs?: number;
    onToken?: (chunk: string) => void;
  }
): Promise<ReActCounselResult> {
  const mode = resolveCounselAgentMode();
  const usePlanner =
    mode === 'planner' ||
    (mode === 'auto' &&
      (ctx.risk.level === 'high' ||
        (ctx.prefetchedKnowledge?.length ?? 0) >= 2 ||
        process.env.PSYQA_AGENT_AUTO_PLANNER === '1'));

  if (usePlanner) {
    return runPlannerRespondAgent(ctx, options);
  }
  return runReActCounselAgent(ctx, options);
}
