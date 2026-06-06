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
exports.CATEGORY_LABEL = void 0;
exports.listKnowledgeCatalog = listKnowledgeCatalog;
exports.appendKnowledgeEntry = appendKnowledgeEntry;
const fs = __importStar(require("fs"));
const paths_1 = require("../../config/paths");
const ragService_1 = require("./ragService");
const CATEGORY_LABEL = {
    academic_stress: '学业压力',
    interpersonal: '人际关系',
    trauma: '危机干预',
    emotion_regulation: '情绪调节',
    family_relationship: '家庭关系',
    romantic_relationship: '恋爱关系',
    other: '其他'
};
exports.CATEGORY_LABEL = CATEGORY_LABEL;
function resolveKnowledgePath() {
    return (0, paths_1.resolveDataFile)('mental_dataset.json');
}
function readDataset() {
    const path = resolveKnowledgePath();
    if (!fs.existsSync(path)) {
        return { knowledge: [] };
    }
    const raw = JSON.parse(fs.readFileSync(path, 'utf-8'));
    return Object.assign(Object.assign({}, raw), { knowledge: raw.knowledge || [] });
}
function writeDataset(data) {
    fs.writeFileSync(resolveKnowledgePath(), JSON.stringify(data, null, 2), 'utf-8');
    (0, ragService_1.reloadKnowledgeBase)();
}
function matchesCategory(item, category) {
    var _a, _b, _c, _d;
    if (category === 'all')
        return true;
    if (category === 'crisis') {
        const text = `${item.question} ${item.answer}`;
        return (((_b = (_a = item.tags) === null || _a === void 0 ? void 0 : _a.problems) === null || _b === void 0 ? void 0 : _b.includes('trauma')) ||
            /自杀|自伤|危机|热线|安全计划/.test(text));
    }
    return Boolean((_d = (_c = item.tags) === null || _c === void 0 ? void 0 : _c.problems) === null || _d === void 0 ? void 0 : _d.includes(category));
}
function listKnowledgeCatalog(params) {
    const category = params.category || 'all';
    const q = (params.q || '').trim().toLowerCase();
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(50, Math.max(5, params.pageSize || 20));
    let items = readDataset().knowledge.map((item, index) => {
        var _a;
        return (Object.assign(Object.assign({}, item), { index, categoryLabels: (((_a = item.tags) === null || _a === void 0 ? void 0 : _a.problems) || ['other']).map((p) => CATEGORY_LABEL[p] || p) }));
    });
    items = items.filter((item) => matchesCategory(item, category));
    if (q) {
        items = items.filter((item) => item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q));
    }
    const total = items.length;
    const start = (page - 1) * pageSize;
    return {
        total,
        page,
        pageSize,
        items: items.slice(start, start + pageSize)
    };
}
function appendKnowledgeEntry(input) {
    var _a;
    const question = input.question.trim();
    const answer = input.answer.trim();
    if (!question || !answer) {
        throw new Error('问题与回答不能为空');
    }
    let problems = ['other'];
    if (input.category === 'academic_stress')
        problems = ['academic_stress'];
    else if (input.category === 'interpersonal')
        problems = ['interpersonal'];
    else if (input.category === 'family_relationship')
        problems = ['family_relationship'];
    else if (input.category === 'emotion_regulation')
        problems = ['emotion_regulation'];
    else if (input.category === 'crisis')
        problems = ['trauma', 'emotion_regulation'];
    const item = {
        question,
        answer,
        tags: {
            problems,
            emotions: ((_a = input.emotions) === null || _a === void 0 ? void 0 : _a.length) ? input.emotions : ['neutral'],
            interventionTypes: input.category === 'crisis' ? ['crisis', 'safety'] : ['support']
        }
    };
    const data = readDataset();
    data.knowledge.push(item);
    writeDataset(data);
    return item;
}
