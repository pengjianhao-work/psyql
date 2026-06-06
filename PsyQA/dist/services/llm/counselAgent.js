"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveReActPlan = exports.isReactDemoMode = exports.shouldUseReAct = exports.shouldRunCounselAgent = exports.resolveCounselAgentMode = exports.resolveAgentPolicy = void 0;
exports.runCounselAgent = runCounselAgent;
const reactCounselAgent_1 = require("./reactCounselAgent");
const plannerRespondAgent_1 = require("./plannerRespondAgent");
const agentPolicy_1 = require("./agentPolicy");
var agentPolicy_2 = require("./agentPolicy");
Object.defineProperty(exports, "resolveAgentPolicy", { enumerable: true, get: function () { return agentPolicy_2.resolveAgentPolicy; } });
Object.defineProperty(exports, "resolveCounselAgentMode", { enumerable: true, get: function () { return agentPolicy_2.resolveCounselAgentMode; } });
Object.defineProperty(exports, "shouldRunCounselAgent", { enumerable: true, get: function () { return agentPolicy_2.shouldRunCounselAgent; } });
Object.defineProperty(exports, "shouldUseReAct", { enumerable: true, get: function () { return agentPolicy_2.shouldUseReAct; } });
Object.defineProperty(exports, "isReactDemoMode", { enumerable: true, get: function () { return agentPolicy_2.isReactDemoMode; } });
var reactCounselAgent_2 = require("./reactCounselAgent");
Object.defineProperty(exports, "resolveReActPlan", { enumerable: true, get: function () { return reactCounselAgent_2.resolveReActPlan; } });
function runCounselAgent(ctx, options) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        const mode = (0, agentPolicy_1.resolveCounselAgentMode)();
        const usePlanner = mode === 'planner' ||
            (mode === 'auto' &&
                (ctx.risk.level === 'high' ||
                    ctx.risk.level === 'critical' ||
                    ((_b = (_a = ctx.prefetchedKnowledge) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0) >= 2 ||
                    process.env.PSYQA_AGENT_AUTO_PLANNER === '1'));
        if (usePlanner) {
            return (0, plannerRespondAgent_1.runPlannerRespondAgent)(ctx, options);
        }
        return (0, reactCounselAgent_1.runReActCounselAgent)(ctx, options);
    });
}
