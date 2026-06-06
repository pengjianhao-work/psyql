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
exports.summarizeUserMonth = summarizeUserMonth;
exports.runMonthlyFeatureSummary = runMonthlyFeatureSummary;
exports.generateUserAnnualReport = generateUserAnnualReport;
exports.runAnnualReports = runAnnualReports;
exports.monthKey = monthKey;
exports.previousMonthKey = previousMonthKey;
exports.yearKey = yearKey;
exports.previousYearKey = previousYearKey;
const userAgentStore_1 = require("../../db/userAgentStore");
const llmClient_1 = require("../llm/llmClient");
const userMemoryService_1 = require("./userMemoryService");
function monthKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function previousMonthKey(d = new Date()) {
    const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    return monthKey(prev);
}
function yearKey(d = new Date()) {
    return String(d.getFullYear());
}
function previousYearKey(d = new Date()) {
    return String(d.getFullYear() - 1);
}
function monthLikePattern(ym) {
    return `${ym.replace('-', '/').slice(0, 7)}/%`;
}
function buildDialogDigest(rows) {
    return rows
        .slice(-40)
        .map((r, i) => {
        var _a, _b;
        let psych = '';
        if (r.psychJson) {
            try {
                const p = JSON.parse(r.psychJson);
                psych = ` [情绪:${(_a = p.emotion) !== null && _a !== void 0 ? _a : '-'} 主题:${(_b = p.problem) !== null && _b !== void 0 ? _b : '-'}]`;
            }
            catch (_c) {
                /* ignore */
            }
        }
        return `${i + 1}. 用户：${r.userText.slice(0, 200)}${psych}\n   摘要：${r.summary.slice(0, 120)}`;
    })
        .join('\n');
}
function parseSummarySections(text) {
    var _a, _b, _c;
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const pick = (prefix) => {
        const line = lines.find((l) => l.startsWith(prefix));
        if (!line)
            return [];
        return line
            .slice(prefix.length)
            .split(/[、,，;；]/)
            .map((s) => s.trim())
            .filter(Boolean);
    };
    const summaryLine = (_b = (_a = lines.find((l) => l.startsWith('总结：'))) === null || _a === void 0 ? void 0 : _a.slice(3)) !== null && _b !== void 0 ? _b : text.slice(0, 400);
    return {
        summary: summaryLine,
        emotions: pick('高频情绪：'),
        triggers: pick('触发诱因：'),
        tone: (_c = lines.find((l) => l.startsWith('沟通偏好：'))) === null || _c === void 0 ? void 0 : _c.slice(5),
        sensitive: pick('敏感话题：'),
        effective: pick('有效疏导：')
    };
}
function summarizeUserMonth(userId, targetMonth) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g;
        const month = targetMonth || previousMonthKey();
        const profile = (0, userAgentStore_1.ensureUserAgentProfile)(userId);
        if (profile.monthlySummariesJson.some((m) => m.month === month)) {
            return { userId, month, summary: '', skipped: true };
        }
        const rows = getDbDialogsForMonth(userId, month);
        if (!rows.length) {
            return { userId, month, summary: '', skipped: true };
        }
        const digest = buildDialogDigest(rows);
        const prompt = `你是心理档案分析师。根据以下用户当月咨询记录，输出结构化中文摘要（不要 markdown）：
总结：（100字内当月心理特征）
高频情绪：（焦虑/内耗/抑郁/易怒等，顿号分隔，最多4项）
触发诱因：（工作/感情/睡眠等，顿号分隔）
沟通偏好：（温和共情/理性分析/简短开导 等一句话）
敏感话题：（用户反感或需避开的话题，无则写「无」）
有效疏导：（用户反馈有效或反复接受的疏导方式，无则写「待观察」）

【${month} 咨询记录】
${digest}`;
        const raw = yield (0, llmClient_1.callLlmGenerate)(prompt, { temperature: 0.3, maxTokens: 512, timeoutMs: 120000 });
        if (!(raw === null || raw === void 0 ? void 0 : raw.trim())) {
            return { userId, month, summary: '', skipped: true };
        }
        const parsed = parseSummarySections(raw.trim());
        const now = new Date().toISOString();
        const monthlySummaries = [
            ...profile.monthlySummariesJson.filter((m) => m.month !== month),
            { month, summary: parsed.summary, createdAt: now }
        ];
        const timelineEntry = {
            month,
            dominantEmotions: parsed.emotions,
            triggers: parsed.triggers,
            notes: parsed.summary
        };
        const emotionTimeline = [
            ...profile.emotionTimelineJson.filter((e) => e.month !== month),
            timelineEntry
        ].sort((a, b) => a.month.localeCompare(b.month));
        const intervention = {
            effectiveApproaches: [
                ...((_b = (_a = profile.interventionJson) === null || _a === void 0 ? void 0 : _a.effectiveApproaches) !== null && _b !== void 0 ? _b : []),
                ...parsed.effective.filter((x) => { var _a, _b; return x !== '待观察' && !((_b = (_a = profile.interventionJson) === null || _a === void 0 ? void 0 : _a.effectiveApproaches) !== null && _b !== void 0 ? _b : []).includes(x); })
            ].slice(-12),
            avoidPhrases: (_d = (_c = profile.interventionJson) === null || _c === void 0 ? void 0 : _c.avoidPhrases) !== null && _d !== void 0 ? _d : [],
            sensitiveTopics: [
                ...((_f = (_e = profile.interventionJson) === null || _e === void 0 ? void 0 : _e.sensitiveTopics) !== null && _f !== void 0 ? _f : []),
                ...parsed.sensitive.filter((x) => { var _a, _b; return x !== '无' && !((_b = (_a = profile.interventionJson) === null || _a === void 0 ? void 0 : _a.sensitiveTopics) !== null && _b !== void 0 ? _b : []).includes(x); })
            ].slice(-20),
            preferredTone: parsed.tone || ((_g = profile.interventionJson) === null || _g === void 0 ? void 0 : _g.preferredTone)
        };
        (0, userAgentStore_1.updateUserAgentProfile)(userId, {
            monthlySummariesJson: monthlySummaries,
            emotionTimelineJson: emotionTimeline,
            interventionJson: intervention,
            agentPhase: (0, userMemoryService_1.resolveAgentPhase)(userId)
        });
        return { userId, month, summary: parsed.summary };
    });
}
function getDbDialogsForMonth(userId, month) {
    return (0, userAgentStore_1.getDialogsForMonth)(userId, month);
}
function runMonthlyFeatureSummary(options) {
    return __awaiter(this, void 0, void 0, function* () {
        const month = (options === null || options === void 0 ? void 0 : options.month) || previousMonthKey();
        const userIds = (options === null || options === void 0 ? void 0 : options.userId) ? [options.userId] : (0, userAgentStore_1.listUserIdsWithDialogs)();
        const results = [];
        for (const uid of userIds) {
            if (!uid || uid === 'default_user')
                continue;
            results.push(yield summarizeUserMonth(uid, month));
        }
        return results;
    });
}
function generateUserAnnualReport(userId, targetYear) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const year = targetYear || previousYearKey();
        const profile = (0, userAgentStore_1.ensureUserAgentProfile)(userId);
        if (profile.annualReportsJson.some((r) => r.year === year)) {
            return { userId, year, report: '', skipped: true };
        }
        const rows = (0, userAgentStore_1.getDialogsForYear)(userId, year);
        const monthlyInYear = profile.monthlySummariesJson.filter((m) => m.month.startsWith(`${year}-`));
        if (!rows.length && !monthlyInYear.length) {
            return { userId, year, report: '', skipped: true };
        }
        const digest = buildDialogDigest(rows);
        const monthlyBlock = monthlyInYear.map((m) => `${m.month}：${m.summary}`).join('\n');
        const prompt = `你是资深心理咨询师，请基于用户 ${year} 年全部咨询记录，撰写年度心理档案（300-500字）：
1. 长期性格与情绪模式
2. 反复出现的触发因素与应对方式
3. 有效干预与需避雷的沟通方式
4. 下一年陪伴建议

最后单独一行输出：
【专属Agent人设】（150字内，第二人称「你」描述如何陪伴该用户）

【月度摘要】
${monthlyBlock || '（无月度摘要）'}

【部分对话摘录】
${digest || '（无对话）'}`;
        const raw = yield (0, llmClient_1.callLlmGenerate)(prompt, { temperature: 0.35, maxTokens: 900, timeoutMs: 180000 });
        if (!(raw === null || raw === void 0 ? void 0 : raw.trim())) {
            return { userId, year, report: '', skipped: true };
        }
        const agentMatch = raw.match(/【专属Agent人设】([\s\S]*?)(?:\n\n|$)/);
        const agentPrompt = (_a = agentMatch === null || agentMatch === void 0 ? void 0 : agentMatch[1]) === null || _a === void 0 ? void 0 : _a.trim();
        const reportBody = raw.replace(/【专属Agent人设】[\s\S]*$/, '').trim();
        const now = new Date().toISOString();
        const annualReports = [
            ...profile.annualReportsJson.filter((r) => r.year !== year),
            { year, report: reportBody, createdAt: now }
        ];
        const patch = {
            annualReportsJson: annualReports,
            agentPhase: (0, userMemoryService_1.resolveAgentPhase)(userId)
        };
        if (agentPrompt && (0, userMemoryService_1.resolveAgentPhase)(userId) === 'mature') {
            patch.agentSystemPrompt = agentPrompt;
        }
        (0, userAgentStore_1.updateUserAgentProfile)(userId, patch);
        return { userId, year, report: reportBody };
    });
}
function runAnnualReports(options) {
    return __awaiter(this, void 0, void 0, function* () {
        const year = (options === null || options === void 0 ? void 0 : options.year) || previousYearKey();
        const userIds = (options === null || options === void 0 ? void 0 : options.userId) ? [options.userId] : (0, userAgentStore_1.listUserIdsWithDialogs)();
        const results = [];
        for (const uid of userIds) {
            if (!uid || uid === 'default_user')
                continue;
            results.push(yield generateUserAnnualReport(uid, year));
        }
        return results;
    });
}
