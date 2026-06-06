"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.computeMemoryBoost = exports.computeTimelineUserWeight = void 0;
exports.resolveAgentPhase = resolveAgentPhase;
exports.resolveMonthsElapsed = resolveMonthsElapsed;
exports.getRagBlendWeights = getRagBlendWeights;
exports.searchBlendedUserMemory = searchBlendedUserMemory;
exports.buildAgentPromptContext = buildAgentPromptContext;
exports.indexUserDialogMemory = indexUserDialogMemory;
exports.clearUserAgentMemory = clearUserAgentMemory;
exports.listUserDialogMemories = listUserDialogMemories;
exports.deleteUserDialogMemory = deleteUserDialogMemory;
exports.buildAgentExportBundle = buildAgentExportBundle;
const userAgentStore_1 = require("../../db/userAgentStore");
const emotionService_1 = require("../psych/emotionService");
const chromaVectorService_1 = require("../knowledge/chromaVectorService");
const embeddingService_1 = require("../knowledge/embeddingService");
const memoryCache_1 = require("../../utils/memoryCache");
const memoryTagService_1 = require("./memoryTagService");
const ragWeightPolicy_1 = require("./ragWeightPolicy");
const PHASE_WEIGHTS = {
    collect: { label: ragWeightPolicy_1.PHASE_LABELS.collect },
    shape: { label: ragWeightPolicy_1.PHASE_LABELS.shape },
    mature: { label: ragWeightPolicy_1.PHASE_LABELS.mature }
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
    return (0, ragWeightPolicy_1.resolvePhaseFromMonths)(resolveMonthsElapsed(userId));
}
function resolveMonthsElapsed(userId) {
    const profile = (0, userAgentStore_1.getUserAgentProfile)(userId);
    const first = (profile === null || profile === void 0 ? void 0 : profile.firstDialogAt) || (0, userAgentStore_1.getFirstDialogTime)(userId);
    if (!first)
        return 0;
    return monthsBetween(first);
}
var ragWeightPolicy_2 = require("./ragWeightPolicy");
Object.defineProperty(exports, "computeTimelineUserWeight", { enumerable: true, get: function () { return ragWeightPolicy_2.computeTimelineUserWeight; } });
Object.defineProperty(exports, "computeMemoryBoost", { enumerable: true, get: function () { return ragWeightPolicy_2.computeMemoryBoost; } });
function getRagBlendWeights(userId) {
    const phase = resolveAgentPhase(userId);
    const w = PHASE_WEIGHTS[phase];
    const monthsElapsed = resolveMonthsElapsed(userId);
    const memoryCount = (0, userAgentStore_1.countUserDialogVectors)(userId);
    const timelineUser = (0, ragWeightPolicy_1.computeTimelineUserWeight)(monthsElapsed);
    const memoryBoost = (0, ragWeightPolicy_1.computeMemoryBoost)(memoryCount);
    const user = (0, ragWeightPolicy_1.roundWeight)(Math.min(ragWeightPolicy_1.MAX_USER_RAG_WEIGHT, timelineUser + memoryBoost));
    const pub = (0, ragWeightPolicy_1.roundWeight)(1 - user);
    return {
        user,
        public: pub,
        phase,
        label: w.label,
        monthsElapsed,
        memoryCount,
        timelineUser,
        memoryBoost
    };
}
function monthsSinceDialog(dialogTime) {
    if (!dialogTime)
        return 0;
    const d = new Date(dialogTime.replace(/\//g, '-'));
    if (Number.isNaN(d.getTime()))
        return 0;
    const now = new Date();
    return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
}
function applyMemoryTimeDecay(hit) {
    const months = monthsSinceDialog(hit.dialogTime);
    if (months >= 12)
        return Object.assign(Object.assign({}, hit), { similarity: hit.similarity * 0.72 });
    if (months >= 6)
        return Object.assign(Object.assign({}, hit), { similarity: hit.similarity * 0.85 });
    return hit;
}
function searchBlendedUserMemory(userId_1, query_1) {
    return __awaiter(this, arguments, void 0, function* (userId, query, totalK = 5) {
        const cacheKey = `mem:${userId}:${totalK}:${query.slice(0, 200)}`;
        return (0, memoryCache_1.cacheGetOrSet)(cacheKey, 120000, () => searchBlendedUserMemoryUncached(userId, query, totalK));
    });
}
function searchBlendedUserMemoryUncached(userId_1, query_1) {
    return __awaiter(this, arguments, void 0, function* (userId, query, totalK = 5) {
        if (!(0, chromaVectorService_1.isChromaEnabled)() || !userId || userId === 'default_user') {
            const pub = yield (0, chromaVectorService_1.searchPublicChromaCollection)(query, totalK);
            return pub;
        }
        const { user, public: pubW, phase } = getRagBlendWeights(userId);
        const userK = Math.max(1, Math.round(totalK * user));
        const pubK = Math.max(1, totalK - userK);
        const [userHitsRaw, pubHits] = yield Promise.all([
            (0, chromaVectorService_1.searchUserChromaCollection)(userId, query, userK),
            (0, chromaVectorService_1.searchPublicChromaCollection)(query, pubK)
        ]);
        const userHits = userHitsRaw.filter((h) => !h.dialogTime || !(0, memoryTagService_1.isMemoryArchived)(userId, h.dialogTime));
        const blend = (hits, weight, source) => hits.map((h) => {
            let sim = h.similarity * weight;
            if (source === 'user' && h.dialogTime) {
                sim *= (0, memoryTagService_1.getLockedMemoryBoost)(userId, h.dialogTime);
            }
            return applyMemoryTimeDecay(Object.assign(Object.assign({}, h), { source, similarity: sim }));
        });
        const merged = [...blend(userHits, user, 'user'), ...blend(pubHits, pubW, 'public')].sort((a, b) => b.similarity - a.similarity);
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
    const weights = getRagBlendWeights(userId);
    const parts = [`【专属用户档案 · ${PHASE_WEIGHTS[phase].label}】`];
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
    parts.push(`【RAG权重 · 动态】用户私有记忆 ${Math.round(weights.user * 100)}%（时间轴 ${Math.round(weights.timelineUser * 100)}%` +
        `${weights.memoryBoost > 0 ? ` + 记忆加成 ${Math.round(weights.memoryBoost * 100)}%` : ''}）` +
        ` + 公共知识库 ${Math.round(weights.public * 100)}% · 已沉淀 ${weights.memoryCount} 条`);
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
                collectionName: (0, chromaVectorService_1.getUserChromaCollectionName)(userId),
                month,
                emotion,
                triggerTag: tag,
                contentPreview: userText
            });
            const { upsertMemoryMeta } = yield Promise.resolve().then(() => __importStar(require('./memoryTagService')));
            upsertMemoryMeta(userId, dialogTime, {
                content: userText,
                problem: psych === null || psych === void 0 ? void 0 : psych.problem
            });
        }
    });
}
/** 清空用户专属 Agent 数据（SQLite 画像 + 向量元数据 + Chroma 用户集合） */
function clearUserAgentMemory(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const { clearUserAgentData } = yield Promise.resolve().then(() => __importStar(require('../../db/userAgentStore')));
        clearUserAgentData(userId);
        const chromaDeleted = yield (0, chromaVectorService_1.deleteUserChromaCollection)(userId);
        return { chromaDeleted };
    });
}
function listUserDialogMemories(userId) {
    const { listUserDialogVectorMeta } = require('../../db/userAgentStore');
    const { listMemoryMeta } = require('./memoryTagService');
    const rows = listUserDialogVectorMeta(userId);
    const metaMap = new Map(listMemoryMeta(userId).map((m) => [m.dialogTime, m]));
    return rows.map((r) => {
        const meta = metaMap.get(r.dialogTime);
        return Object.assign(Object.assign({}, r), { tags: (meta === null || meta === void 0 ? void 0 : meta.tags) || [], locked: (meta === null || meta === void 0 ? void 0 : meta.locked) || false, archived: (meta === null || meta === void 0 ? void 0 : meta.archived) || false });
    });
}
function deleteUserDialogMemory(userId, dialogTime) {
    return __awaiter(this, void 0, void 0, function* () {
        const { listUserDialogVectorMeta, deleteUserDialogVectorMeta } = yield Promise.resolve().then(() => __importStar(require('../../db/userAgentStore')));
        const rows = listUserDialogVectorMeta(userId);
        const row = rows.find((r) => r.dialogTime === dialogTime);
        let chromaDeleted = false;
        if (row === null || row === void 0 ? void 0 : row.chromaId) {
            chromaDeleted = yield (0, chromaVectorService_1.deleteUserChromaVectors)(userId, [row.chromaId]);
        }
        const deleted = deleteUserDialogVectorMeta(userId, dialogTime);
        return { deleted, chromaDeleted };
    });
}
/** 导出专属 Agent 配置包（JSON，不含向量本体） */
function buildAgentExportBundle(userId) {
    const profile = (0, userAgentStore_1.ensureUserAgentProfile)(userId);
    const weights = getRagBlendWeights(userId);
    return {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        userId,
        phase: weights.phase,
        ragWeights: weights,
        chromaCollection: (0, chromaVectorService_1.getUserChromaCollectionName)(userId),
        profile: {
            basicJson: profile.basicJson,
            emotionTimelineJson: profile.emotionTimelineJson,
            interventionJson: profile.interventionJson,
            agentSystemPrompt: profile.agentSystemPrompt,
            firstDialogAt: profile.firstDialogAt,
            monthlySummariesJson: profile.monthlySummariesJson,
            annualReportsJson: profile.annualReportsJson,
            updatedAt: profile.updatedAt
        },
        note: '向量嵌入存储于 Chroma 用户集合，完整迁移需同时备份该 collection'
    };
}
