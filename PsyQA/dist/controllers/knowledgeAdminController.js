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
exports.knowledgeAdminMiddleware = exports.postKnowledgeUpdate = exports.getKnowledgeUpdateStatus = void 0;
const authMiddleware_1 = require("../middleware/authMiddleware");
const knowledgeScheduler_1 = require("../services/knowledgeScheduler");
const ragService_1 = require("../services/ragService");
const vectorDBService_1 = require("../services/vectorDBService");
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
