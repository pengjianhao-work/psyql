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
exports.knowledgeAdminMiddleware = exports.postKnowledgeUpdate = exports.getKnowledgeUpdateStatus = exports.postKnowledgeItem = exports.getKnowledgeItems = void 0;
const authMiddleware_1 = require("../middleware/authMiddleware");
const knowledgeScheduler_1 = require("../services/knowledge/knowledgeScheduler");
const ragService_1 = require("../services/knowledge/ragService");
const vectorDBService_1 = require("../services/knowledge/vectorDBService");
const knowledgeCatalogService_1 = require("../services/knowledge/knowledgeCatalogService");
const getKnowledgeItems = (req, res) => {
    const category = req.query.category || 'all';
    const q = req.query.q ? String(req.query.q) : undefined;
    const page = req.query.page ? Number(req.query.page) : 1;
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 20;
    res.json((0, knowledgeCatalogService_1.listKnowledgeCatalog)({ category, q, page, pageSize }));
};
exports.getKnowledgeItems = getKnowledgeItems;
const postKnowledgeItem = (req, res) => {
    var _a, _b, _c, _d;
    try {
        const item = (0, knowledgeCatalogService_1.appendKnowledgeEntry)({
            question: String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.question) || ''),
            answer: String(((_b = req.body) === null || _b === void 0 ? void 0 : _b.answer) || ''),
            category: ((_c = req.body) === null || _c === void 0 ? void 0 : _c.category) || 'academic_stress',
            emotions: (_d = req.body) === null || _d === void 0 ? void 0 : _d.emotions
        });
        res.status(201).json({ message: '已添加知识条目并热重载', item });
    }
    catch (e) {
        res.status(400).json({ error: e instanceof Error ? e.message : '添加失败' });
    }
};
exports.postKnowledgeItem = postKnowledgeItem;
const getKnowledgeUpdateStatus = (_req, res) => {
    const state = (0, knowledgeScheduler_1.readSchedulerState)();
    res.json({
        state,
        live: {
            knowledgeBaseCount: (0, ragService_1.getKnowledgeBaseCount)(),
            vectorDbCount: vectorDBService_1.vectorDb.getDocumentCount()
        },
        autoUpdateEnabled: process.env.KNOWLEDGE_AUTO_UPDATE === '1'
    });
};
exports.getKnowledgeUpdateStatus = getKnowledgeUpdateStatus;
const postKnowledgeUpdate = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const force = ((_a = req.body) === null || _a === void 0 ? void 0 : _a.force) === true;
    const result = yield (0, knowledgeScheduler_1.triggerKnowledgeUpdate)(force);
    res.status(result.ok ? 200 : 500).json(result);
});
exports.postKnowledgeUpdate = postKnowledgeUpdate;
exports.knowledgeAdminMiddleware = [authMiddleware_1.requireAuth, (0, authMiddleware_1.requireRole)('admin')];
