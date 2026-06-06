import { runReActCounselAgent } from './reactCounselAgent';
import type { ReActCounselContext, ReActCounselResult, ReActStep } from './reactCounselAgent';
import { runPlannerRespondAgent } from './plannerRespondAgent';
import {
  resolveAgentPolicy,
  resolveCounselAgentMode,
  shouldRunCounselAgent,
  shouldUseReAct,
  isReactDemoMode
} from './agentPolicy';

export type { ReActStep, ReActCounselContext, ReActCounselResult };
export type { CounselAgentMode, ReactMode } from './agentPolicy';
export {
  resolveAgentPolicy,
  resolveCounselAgentMode,
  shouldRunCounselAgent,
  shouldUseReAct,
  isReactDemoMode
} from './agentPolicy';
export { resolveReActPlan } from './reactCounselAgent';

export async function runCounselAgent(
  ctx: ReActCounselContext,
  options?: {
    maxSteps?: number;
    temperature?: number;
    timeoutMs?: number;
    onToken?: (chunk: string) => void;
    onStep?: (step: ReActStep) => void;
  }
): Promise<ReActCounselResult> {
  const mode = resolveCounselAgentMode();
  const usePlanner =
    mode === 'planner' ||
    (mode === 'auto' &&
      (ctx.risk.level === 'high' ||
        ctx.risk.level === 'critical' ||
        (ctx.prefetchedKnowledge?.length ?? 0) >= 2 ||
        process.env.PSYQA_AGENT_AUTO_PLANNER === '1'));

  if (usePlanner) {
    return runPlannerRespondAgent(ctx, options);
  }
  return runReActCounselAgent(ctx, options);
}
