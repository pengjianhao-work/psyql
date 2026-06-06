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
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSummary = generateSummary;
exports.getLastPsychSnapshot = getLastPsychSnapshot;
exports.getUserPsychSnapshots = getUserPsychSnapshots;
exports.getStructuredPsychTimeline = getStructuredPsychTimeline;
exports.rebuildReportFromPsych = rebuildReportFromPsych;
exports.saveDialog = saveDialog;
exports.getUserSummaries = getUserSummaries;
exports.getUserProgress = getUserProgress;
exports.getUserHistory = getUserHistory;
exports.clearUserHistory = clearUserHistory;
exports.updateDialogSelfRating = updateDialogSelfRating;
exports.updateDialogReport = updateDialogReport;
exports.updateDialogPsych = updateDialogPsych;
exports.updateDialogPortrait = updateDialogPortrait;
exports.getRecentPortraits = getRecentPortraits;
exports.getGroupedUserHistory = getGroupedUserHistory;
const fs = __importStar(require("fs"));
const jsonFileStore_1 = require("../../utils/jsonFileStore");
const paths_1 = require("../../config/paths");
const historyStore_1 = require("../../db/historyStore");
const emotionService_1 = require("../psych/emotionService");
const psychStatsService_1 = require("../psych/psychStatsService");
const HISTORY_FILE = (0, paths_1.userHistoryJsonPath)();
const USE_SQLITE = process.env.PSYQA_USE_JSON_STORAGE !== '1';
const EMOTION_LABELS = {
    happy: '开心',
    sad: '低落',
    anxious: '焦虑',
    angry: '愤怒',
    lonely: '孤独',
    neutral: '平稳',
    hopeful: '希望',
    confused: '迷茫',
    frustrated: '挫败',
    guilty: '内疚',
    shameful: '羞愧',
    proud: '自豪'
};
function loadHistoryJson() {
    if (!fs.existsSync(HISTORY_FILE)) {
        (0, jsonFileStore_1.writeJsonFileSync)(HISTORY_FILE, { users: {} });
    }
    return (0, jsonFileStore_1.readJsonFileSync)(HISTORY_FILE, { users: {} });
}
function saveHistoryJson(data) {
    (0, jsonFileStore_1.writeJsonFileSync)(HISTORY_FILE, data);
}
function getUserData(user_id) {
    if (USE_SQLITE)
        return (0, historyStore_1.getUserHistoryFromDb)(user_id);
    const data = loadHistoryJson();
    return data.users[user_id] || null;
}
function persistUserData(user_id, userData) {
    if (USE_SQLITE)
        return;
    const data = loadHistoryJson();
    data.users[user_id] = userData;
    saveHistoryJson(data);
}
const GROUP_RULES = {
    学业: ['学习', '考试', '考研', '作业', '绩点', '论文'],
    人际: ['人际', '朋友', '室友', '同学', '社交', '孤独'],
    情绪: ['焦虑', '抑郁', '烦躁', '紧张', '情绪', '压力'],
    家庭: ['家庭', '父母', '家人'],
    恋爱: ['恋爱', '失恋', '感情', '分手'],
    未来: ['就业', '未来', '方向', '迷茫', '职业']
};
function generateSummary(query, reply, psych) {
    if (psych) {
        const emo = EMOTION_LABELS[psych.emotion] || psych.emotion;
        const prob = (0, emotionService_1.getCategoryName)(psych.problem);
        const riskNote = psych.risk === 'low' ? '' : `，风险关注：${psych.risk}`;
        return `情绪：${emo}（置信${Math.round(psych.confidence * 100)}%）；问题领域：${prob}${riskNote}`;
    }
    const KEYWORDS = ['压力', '焦虑', '失眠', '抑郁', '孤独', '自卑', '紧张', '烦躁', '失恋', '考试', '学习'];
    const emotions = [];
    for (const k of KEYWORDS) {
        if (query.includes(k))
            emotions.push(k);
    }
    if (emotions.length === 0)
        return '情绪平稳，咨询日常问题';
    return `当前存在：${emotions.join('、')} 相关困扰，正在寻求疏导。`;
}
function getLastPsychSnapshot(user_id) {
    var _a;
    const dialogs = (_a = getUserData(user_id)) === null || _a === void 0 ? void 0 : _a.dialogs;
    if (!(dialogs === null || dialogs === void 0 ? void 0 : dialogs.length))
        return null;
    for (let i = dialogs.length - 1; i >= 0; i--) {
        if (dialogs[i].psych)
            return dialogs[i].psych;
    }
    return null;
}
function getUserPsychSnapshots(user_id) {
    var _a;
    const dialogs = (_a = getUserData(user_id)) === null || _a === void 0 ? void 0 : _a.dialogs;
    if (!(dialogs === null || dialogs === void 0 ? void 0 : dialogs.length))
        return [];
    return dialogs.filter((d) => d.psych).map((d) => d.psych);
}
function getStructuredPsychTimeline(user_id, limit = 5) {
    var _a;
    const dialogs = (_a = getUserData(user_id)) === null || _a === void 0 ? void 0 : _a.dialogs;
    if (!(dialogs === null || dialogs === void 0 ? void 0 : dialogs.length))
        return '暂无结构化心理状态记录。';
    const recent = dialogs.filter((d) => d.psych).slice(-limit);
    if (recent.length === 0)
        return '暂无结构化心理状态记录。';
    let text = '近几次咨询心理状态（结构化）：\n';
    recent.forEach((d, i) => {
        const p = d.psych;
        text += `${i + 1}. ${d.time} | 情绪=${EMOTION_LABELS[p.emotion] || p.emotion} | 问题=${(0, emotionService_1.getCategoryName)(p.problem)} | 风险=${p.risk} | 压力指数≈${p.stressLevel}\n`;
    });
    return text;
}
function rebuildReportFromPsych(psych) {
    const emotion = {
        emotion: psych.emotion,
        confidence: psych.confidence,
        keywords: [],
        secondaryEmotions: []
    };
    const risk = {
        level: psych.risk,
        keywords: [],
        warningMessage: psych.risk === 'high' || psych.risk === 'critical' ? '请关注当前风险等级，必要时寻求专业支持。' : '',
        hotline: '全国心理援助热线：400-161-9995'
    };
    const problem = {
        category: psych.problem,
        confidence: 0.75,
        keywords: [],
        subcategories: []
    };
    return (0, emotionService_1.formatEmotionReport)(emotion, risk, problem, undefined);
}
function saveDialog(user_id, user_query, assistant_reply, summary, psych, report) {
    if (USE_SQLITE) {
        return (0, historyStore_1.saveDialogToDb)(user_id, user_query, assistant_reply, summary, psych, report);
    }
    const data = loadHistoryJson();
    const now = new Date().toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    if (!data.users[user_id]) {
        data.users[user_id] = { dialogs: [], summaries: [], total_times: 0 };
    }
    data.users[user_id].dialogs.push({
        time: now,
        user: user_query,
        bot: assistant_reply,
        summary,
        report,
        psych
    });
    data.users[user_id].summaries.push({ time: now, summary });
    data.users[user_id].total_times += 1;
    saveHistoryJson(data);
    return now;
}
function getUserSummaries(user_id) {
    const user = getUserData(user_id);
    if (!user)
        return '无历史对话。';
    let text = '用户历史心理状态变化：\n';
    user.summaries.forEach((s, i) => {
        text += `${i + 1}. ${s.time}：${s.summary}\n`;
    });
    return text;
}
function getUserProgress(user_id) {
    const user = getUserData(user_id);
    if (!user)
        return '暂无记录';
    let res = '';
    user.dialogs.forEach((item, i) => {
        res += `【第${i + 1}次咨询】${item.time}\n`;
        res += `问题：${item.user}\n`;
        res += `状态总结：${item.summary}\n\n`;
    });
    return res;
}
function getUserHistory(user_id) {
    return getUserData(user_id);
}
function clearUserHistory(user_id) {
    if (USE_SQLITE) {
        (0, historyStore_1.clearUserHistoryInDb)(user_id);
        return;
    }
    const data = loadHistoryJson();
    if (data.users[user_id]) {
        delete data.users[user_id];
        saveHistoryJson(data);
    }
}
function updateDialogSelfRating(user_id, dialogTime, ratings) {
    if (USE_SQLITE) {
        const user = getUserData(user_id);
        if (!(user === null || user === void 0 ? void 0 : user.dialogs.length))
            return null;
        let target = user.dialogs[user.dialogs.length - 1];
        if (dialogTime) {
            const found = user.dialogs.find((d) => d.time === dialogTime);
            if (found)
                target = found;
        }
        if (!target.psych)
            return null;
        applySelfRatingToPsych(target.psych, ratings);
        (0, historyStore_1.updateDialogPsychInDb)(user_id, target.time, target.psych);
        return target.psych;
    }
    const data = loadHistoryJson();
    const user = data.users[user_id];
    if (!(user === null || user === void 0 ? void 0 : user.dialogs.length))
        return null;
    let target = user.dialogs[user.dialogs.length - 1];
    if (dialogTime) {
        const found = user.dialogs.find((d) => d.time === dialogTime);
        if (found)
            target = found;
    }
    if (!target.psych)
        return null;
    applySelfRatingToPsych(target.psych, ratings);
    saveHistoryJson(data);
    return target.psych;
}
function applySelfRatingToPsych(psych, ratings) {
    var _a, _b, _c;
    const modelMetrics = {
        stressLevel: (_a = psych.modelStressLevel) !== null && _a !== void 0 ? _a : psych.stressLevel,
        anxietyLevel: (_b = psych.modelAnxietyLevel) !== null && _b !== void 0 ? _b : psych.anxietyLevel,
        moodStability: (_c = psych.modelMoodStability) !== null && _c !== void 0 ? _c : psych.moodStability
    };
    if (psych.modelStressLevel === undefined) {
        psych.modelStressLevel = modelMetrics.stressLevel;
        psych.modelAnxietyLevel = modelMetrics.anxietyLevel;
        psych.modelMoodStability = modelMetrics.moodStability;
    }
    if (ratings.userSelfRating !== undefined)
        psych.userSelfRating = ratings.userSelfRating;
    if (ratings.selfRatedStress !== undefined)
        psych.selfRatedStress = ratings.selfRatedStress;
    if (ratings.selfRatedAnxiety !== undefined)
        psych.selfRatedAnxiety = ratings.selfRatedAnxiety;
    const blended = (0, psychStatsService_1.blendMetricsWithSelfRating)(modelMetrics, {
        mood: psych.userSelfRating,
        stress: psych.selfRatedStress,
        anxiety: psych.selfRatedAnxiety
    });
    psych.stressLevel = blended.stressLevel;
    psych.anxietyLevel = blended.anxietyLevel;
    psych.moodStability = blended.moodStability;
}
function updateDialogReport(user_id, dialogTime, report) {
    var _a;
    const data = loadHistoryJson();
    const user = data.users[user_id];
    if (!(user === null || user === void 0 ? void 0 : user.dialogs.length))
        return false;
    const target = (_a = user.dialogs.find((d) => d.time === dialogTime)) !== null && _a !== void 0 ? _a : user.dialogs[user.dialogs.length - 1];
    target.report = report;
    saveHistoryJson(data);
    return true;
}
function updateDialogPsych(user_id, dialogTime, psych) {
    var _a;
    if (USE_SQLITE) {
        return (0, historyStore_1.updateDialogPsychInDb)(user_id, dialogTime, psych);
    }
    const data = loadHistoryJson();
    const user = data.users[user_id];
    if (!(user === null || user === void 0 ? void 0 : user.dialogs.length))
        return false;
    const target = (_a = user.dialogs.find((d) => d.time === dialogTime)) !== null && _a !== void 0 ? _a : user.dialogs[user.dialogs.length - 1];
    target.psych = psych;
    saveHistoryJson(data);
    return true;
}
function updateDialogPortrait(user_id, dialogTime, portrait) {
    var _a;
    if (USE_SQLITE) {
        return (0, historyStore_1.updateDialogPortraitInDb)(user_id, dialogTime, portrait);
    }
    const data = loadHistoryJson();
    const user = data.users[user_id];
    if (!(user === null || user === void 0 ? void 0 : user.dialogs.length))
        return false;
    const target = (_a = user.dialogs.find((d) => d.time === dialogTime)) !== null && _a !== void 0 ? _a : user.dialogs[user.dialogs.length - 1];
    target.portrait = portrait;
    saveHistoryJson(data);
    return true;
}
function inferTagsFromDialog(dialog) {
    var _a;
    const text = `${dialog.user} ${dialog.summary} ${((_a = dialog.psych) === null || _a === void 0 ? void 0 : _a.problem) || ''}`.toLowerCase();
    const tags = [];
    let selectedGroup = '其他';
    let maxHits = 0;
    if (dialog.psych) {
        const prob = (0, emotionService_1.getCategoryName)(dialog.psych.problem);
        if (prob)
            tags.push(prob);
    }
    for (const [group, words] of Object.entries(GROUP_RULES)) {
        let hits = 0;
        for (const word of words) {
            if (text.includes(word.toLowerCase())) {
                hits += 1;
                tags.push(word);
            }
        }
        if (hits > maxHits) {
            maxHits = hits;
            selectedGroup = group;
        }
    }
    return {
        tags: Array.from(new Set(tags)).slice(0, 5),
        group: selectedGroup
    };
}
function getRecentPortraits(user_id, limit = 8) {
    var _a;
    const dialogs = (_a = getUserData(user_id)) === null || _a === void 0 ? void 0 : _a.dialogs;
    if (!(dialogs === null || dialogs === void 0 ? void 0 : dialogs.length))
        return [];
    return dialogs
        .filter((d) => d.portrait)
        .slice(-limit)
        .map((d) => ({ time: d.time, portrait: d.portrait }));
}
function getGroupedUserHistory(user_id) {
    const history = getUserHistory(user_id);
    if (!history)
        return {};
    return history.dialogs.reduce((acc, dialog) => {
        const { tags, group } = inferTagsFromDialog(dialog);
        if (!acc[group])
            acc[group] = [];
        acc[group].push(Object.assign(Object.assign({}, dialog), { tags, group }));
        return acc;
    }, {});
}
