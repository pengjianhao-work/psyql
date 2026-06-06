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
exports.seedP0DemoData = seedP0DemoData;
const fs = __importStar(require("fs"));
const historyManager_1 = require("./historyManager");
const accountService_1 = require("../user/accountService");
const schoolAlertService_1 = require("../school/schoolAlertService");
const orgService_1 = require("../user/orgService");
const paths_1 = require("../../config/paths");
const DEMO_STUDENT_ID = 'acc_demo';
const HISTORY_FILE = (0, paths_1.userHistoryJsonPath)();
function loadRawHistory() {
    if (!fs.existsSync(HISTORY_FILE)) {
        return { users: {} };
    }
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
}
function saveRawHistory(data) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2), 'utf8');
}
function appendSeedDialog(userId, userQuery, botReply, summary, psych, time) {
    const data = loadRawHistory();
    if (!data.users[userId]) {
        data.users[userId] = { dialogs: [], summaries: [], total_times: 0 };
    }
    data.users[userId].dialogs.push({ time, user: userQuery, bot: botReply, summary, psych });
    data.users[userId].summaries.push({ time, summary });
    data.users[userId].total_times += 1;
    saveRawHistory(data);
}
function seedP0DemoData() {
    return __awaiter(this, void 0, void 0, function* () {
        (0, orgService_1.ensureOrganizations)();
        yield (0, accountService_1.loadAccounts)();
        const hist = (0, historyManager_1.getUserHistory)(DEMO_STUDENT_ID);
        if (!hist || hist.dialogs.length === 0) {
            appendSeedDialog(DEMO_STUDENT_ID, '最近学习压力很大，学不进去怎么办？', '我理解你现在承受的学习压力，可以先从最小行动开始…', '情绪：焦虑；问题领域：学业压力', {
                emotion: 'anxious',
                risk: 'medium',
                problem: 'academic_stress',
                confidence: 0.82,
                stressLevel: 72,
                anxietyLevel: 68,
                moodStability: 55
            }, '2026/05/18 14:30:00');
            appendSeedDialog(DEMO_STUDENT_ID, '有时候觉得活着没意思，不知道该怎么办', '我非常重视你现在的状态，你的安全是第一位的…', '情绪：低落；问题领域：情绪困扰，风险关注：high', {
                emotion: 'sad',
                risk: 'high',
                problem: 'emotion_regulation',
                confidence: 0.88,
                stressLevel: 85,
                anxietyLevel: 78,
                moodStability: 40
            }, '2026/05/19 20:15:00');
        }
        const hasDemoAlert = (0, schoolAlertService_1.listAlerts)().some((a) => a.studentId === DEMO_STUDENT_ID);
        if (!hasDemoAlert) {
            (0, schoolAlertService_1.recordRiskAlert)({
                studentId: DEMO_STUDENT_ID,
                displayName: '演示学生',
                orgId: 'cs-demo',
                riskLevel: 'high',
                summary: '检测到高危情绪表达：活着没意思（演示预置数据）',
                riskKeywords: ['活着没意思'],
                dialogId: '2026/05/19 20:15:00',
                dialogTime: '2026-05-19T12:15:00.000Z'
            });
        }
    });
}
