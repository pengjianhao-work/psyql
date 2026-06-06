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
exports.resolveAgentPhase = resolveAgentPhase;
exports.getRagBlendWeights = getRagBlendWeights;
exports.searchBlendedUserMemory = searchBlendedUserMemory;
exports.buildAgentPromptContext = buildAgentPromptContext;
exports.indexUserDialogMemory = indexUserDialogMemory;
const userAgentStore_1 = require("../../db/userAgentStore");
const emotionService_1 = require("../psych/emotionService");
const chromaVectorService_1 = require("../knowledge/chromaVectorService");
const embeddingService_1 = require("../knowledge/embeddingService");
const PHASE_WEIGHTS = {
    collect: { user: 0.3, public: 0.7, label: '特征采集期（0-6月）' },
    shape: { user: 0.6, public: 0.4, label: '人格成型期（7-18月）' },
    mature: { user: 0.85, public: 0.15, label: '专属Agent定型（19-24月）' }
};
function parseDialogMonth(dialogTime) {
    const d = new Date(dialogTime.replace(/\//g, '-'));
    if (!Number.isNaN(d.getTime())) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    return new Date().toISOString().slice(0, 7);
}
function monthsBetween(fromIso, to = new Date()) {
    const start = new Date(fromIso);
    if (Number.isNaN(start.getTime()))
        return 0;
    return ((to.getFullYear() - start.getFullYear()) * 12 + (to.getMonth() - start.getMonth()));
}
function resolveAgentPhase(userId) {
    const profile = (0, userAgentStore_1.getUserAgentProfile)(userId);
    const first = (profile === null || profile === void 0 ? void 0 : profile.firstDialogAt) || (0, userAgentStore_1.getFirstDialogTime)(userId);
    if (!first)
        return 'collect';
    const months = monthsBetween(first);
    if (months < 6)
        return 'collect';
    if (months < 18)
        return 'shape';
    return 'mature';
}
function getRagBlendWeights(userId) {
    const phase = resolveAgentPhase(userId);
    const w = PHASE_WEIGHTS[phase];
    return { user: w.user, public: w.public, phase, label: w.label };
}
function searchBlendedUserMemory(userId_1, query_1) {
    return __awaiter(this, arguments, void 0, function* (userId, query, totalK = 5) {
        if (!(0, chromaVectorService_1.isChromaEnabled)() || !userId || userId === 'default_user') {
            const pub = yield (0, chromaVectorService_1.searchPublicChromaCollection)(query, totalK);
            return pub;
        }
        const { user, public: pubW, phase } = getRagBlendWeights(userId);
        const userK = Math.max(1, Math.round(totalK * user));
        const pubK = Math.max(1, totalK - userK);
        const [userHits, pubHits] = yield Promise.all([
            (0, chromaVectorService_1.searchUserChromaCollection)(userId, query, userK),
            (0, chromaVectorService_1.searchPublicChromaCollection)(query, pubK)
        ]);
        const blend = (hits, weight) => hits.map((h) => (Object.assign(Object.assign({}, h), { similarity: h.similarity * weight })));
        const merged = [...blend(userHits, user), ...blend(pubHits, pubW)].sort((a, b) => b.similarity - a.similarity);
        const seen = new Set();
        const out = [];
        for (const item of merged) {
            const key = item.question.slice(0, 80);
            if (seen.has(key))
                continue;
            seen.add(key);
            out.push(item);
            if (out.length >= totalK)
                break;
        }
        if (out.length === 0 && phase === 'collect') {
            return (0, chromaVectorService_1.searchPublicChromaCollection)(query, totalK);
        }
        return out;
    });
}
function buildAgentPromptContext(userId) {
    var _a, _b, _c, _d, _e;
    if (!userId || userId === 'default_user')
        return '';
    const profile = (0, userAgentStore_1.ensureUserAgentProfile)(userId);
    const phase = resolveAgentPhase(userId);
    const weights = PHASE_WEIGHTS[phase];
    const parts = [`【专属用户档案 · ${weights.label}】`];
    if (profile.basicJson) {
        const b = profile.basicJson;
        const basicLine = [
            b.age !== undefined ? `年龄：${b.age}` : '',
            b.occupation ? `职业：${b.occupation}` : '',
            b.familyBackground ? `原生家庭：${b.familyBackground}` : '',
            ((_a = b.majorLifeEvents) === null || _a === void 0 ? void 0 : _a.length) ? `重大经历：${b.majorLifeEvents.join('、')}` : ''
        ]
            .filter(Boolean)
            .join('｜');
        if (basicLine)
            parts.push(basicLine);
    }
    if (profile.interventionJson) {
        const iv = profile.interventionJson;
        if (iv.preferredTone)
            parts.push(`沟通偏好：${iv.preferredTone}`);
        if ((_b = iv.sensitiveTopics) === null || _b === void 0 ? void 0 : _b.length)
            parts.push(`敏感话题（避开）：${iv.sensitiveTopics.join('、')}`);
        if ((_c = iv.avoidPhrases) === null || _c === void 0 ? void 0 : _c.length)
            parts.push(`避雷话术：${iv.avoidPhrases.join('、')}`);
        if ((_d = iv.effectiveApproaches) === null || _d === void 0 ? void 0 : _d.length) {
            parts.push(`有效疏导方式：${iv.effectiveApproaches.join('、')}`);
        }
    }
    const latestMonthly = profile.monthlySummariesJson.slice(-1)[0];
    if (latestMonthly === null || latestMonthly === void 0 ? void 0 : latestMonthly.summary) {
        parts.push(`近月心理特征：${latestMonthly.summary}`);
    }
    if ((_e = profile.agentSystemPrompt) === null || _e === void 0 ? void 0 : _e.trim()) {
        parts.push(`【专属Agent人设】\n${profile.agentSystemPrompt.trim()}`);
    }
    parts.push(`【RAG权重】用户私有记忆 ${Math.round(weights.user * 100)}% + 公共知识库 ${Math.round(weights.public * 100)}%`);
    return parts.join('\n');
}
function indexUserDialogMemory(input) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const { userId, dialogTime, userText, botText, psych } = input;
        if (!userId || userId === 'default_user')
            return;
        const first = (0, userAgentStore_1.getFirstDialogTime)(userId);
        if (!first) {
            (0, userAgentStore_1.updateUserAgentProfile)(userId, { firstDialogAt: dialogTime });
        }
        const phase = resolveAgentPhase(userId);
        (0, userAgentStore_1.updateUserAgentProfile)(userId, { agentPhase: phase });
        if (!(0, chromaVectorService_1.isChromaEnabled)())
            return;
        const month = parseDialogMonth(dialogTime);
        const emotion = (_a = psych === null || psych === void 0 ? void 0 : psych.emotion) !== null && _a !== void 0 ? _a : 'neutral';
        const trigger = (psych === null || psych === void 0 ? void 0 : psych.problem)
            ? (0, emotionService_1.getCategoryName)(psych.problem)
            : 'general';
        const tag = `${emotion}_${trigger}`;
        const content = `用户：${userText}\n助理：${botText}`;
        const chromaId = `${userId}_${dialogTime.replace(/[^\d]/g, '')}`;
        const embedding = yield (0, embeddingService_1.embedText)(content);
        if (!embedding)
            return;
        const ok = yield (0, chromaVectorService_1.upsertUserDialogVector)(userId, {
            id: chromaId,
            content,
            embedding,
            metadata: {
                month,
                emotion,
                trigger,
                tag,
                dialogTime,
                userPreview: userText.slice(0, 120)
            }
        });
        if (ok) {
            (0, userAgentStore_1.recordDialogVectorMeta)({
                userId,
                dialogTime,
                chromaId,
                collectionName: `user_${userId.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 48)}`,
                month,
                emotion,
                triggerTag: tag,
                contentPreview: userText
            });
        }
    });
}
