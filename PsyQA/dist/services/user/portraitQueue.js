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
exports.schedulePortraitGeneration = schedulePortraitGeneration;
exports.buildPlaceholderPortrait = buildPlaceholderPortrait;
const portraitService_1 = require("./portraitService");
const historyManager_1 = require("../common/historyManager");
const inFlight = new Set();
function schedulePortraitGeneration(params) {
    const key = `${params.userId}:${params.dialogTime}`;
    if (inFlight.has(key))
        return;
    inFlight.add(key);
    void (() => __awaiter(this, void 0, void 0, function* () {
        try {
            const priorContext = (0, historyManager_1.getStructuredPsychTimeline)(params.userId, 4);
            const portrait = yield (0, portraitService_1.generateConversationPortrait)({
                userQuery: params.question,
                botReply: params.answer,
                psych: params.psychSnapshot,
                userId: params.userId,
                priorContext,
                statModel: params.statModel,
                tryLlm: params.tryLlm
            });
            (0, historyManager_1.updateDialogPortrait)(params.userId, params.dialogTime, portrait);
        }
        catch (err) {
            console.warn('Async portrait generation failed:', err);
        }
        finally {
            inFlight.delete(key);
        }
    }))();
}
function buildPlaceholderPortrait() {
    return {
        summary: '咨询画像生成中…',
        emotionalPresentation: '系统正在根据本轮对话整理情绪呈现，请稍后刷新查看。',
        coreConcerns: [],
        observedPatterns: [],
        strengths: [],
        supportNeeds: [],
        recommendedFocus: '稍后查看完整画像',
        confidence: 'low',
        llmUsed: false,
        generatedAt: new Date().toISOString()
    };
}
