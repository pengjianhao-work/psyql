import { runReActCounselAgent } from './reactCounselAgent';
import type { ReActCounselContext, ReActCounselResult, ReActStep } from './reactCounselAgent';
import { runPlannerRespondAgent } from './plannerRespondAgent';
import { runTotCounselAgent } from './totCounselAgent';
import { runCoreTaskLoopAgent } from './coreTaskLoopAgent';
import { appendSelfAskVerify, shouldRunSelfAskVerify } from './selfAskVerify';
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
export { shouldRunSelfAskVerify } from './selfAskVerify';

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

  let result: ReActCounselResult;
  if (mode === 'loop') {
    result = await runCoreTaskLoopAgent(ctx, options);
  } else if (mode === 'tot') {
    result = await runTotCounselAgent(ctx, options);
  } else {
    const usePlanner =
      mode === 'planner' ||
      (mode === 'auto' &&
        (ctx.risk.level === 'high' ||
          ctx.risk.level === 'critical' ||
          (ctx.prefetchedKnowledge?.length ?? 0) >= 2 ||
          process.env.PSYQA_AGENT_AUTO_PLANNER === '1'));

    result = usePlanner
      ? await runPlannerRespondAgent(ctx, options)
      : await runReActCounselAgent(ctx, options);
  }

  if (shouldRunSelfAskVerify(mode) && result.success) {
    result = await appendSelfAskVerify(ctx, result, {
      temperature: options?.temperature,
      timeoutMs: options?.timeoutMs,
      onStep: options?.onStep,
      onToken: options?.onToken
    });
  }

  return result;
}
