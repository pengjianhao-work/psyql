"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitKnowledgeReview = submitKnowledgeReview;
exports.listKnowledgeReviews = listKnowledgeReviews;
exports.exportReviewsForFineTune = exportReviewsForFineTune;
const jsonFileStore_1 = require("../../utils/jsonFileStore");
const paths_1 = require("../../config/paths");
const dataPath = (0, paths_1.resolveDataFile)('knowledge_reviews.json');
function readAll() {
    return (0, jsonFileStore_1.readJsonFileSync)(dataPath, { entries: [] });
}
function writeAll(data) {
    (0, jsonFileStore_1.writeJsonFileSync)(dataPath, data);
}
function submitKnowledgeReview(input) {
    const data = readAll();
    const entry = Object.assign(Object.assign({ id: `kr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }, input), { createdAt: new Date().toISOString() });
    data.entries.unshift(entry);
    if (data.entries.length > 2000)
        data.entries = data.entries.slice(0, 2000);
    writeAll(data);
    return entry;
}
function listKnowledgeReviews(limit = 50) {
    return readAll().entries.slice(0, limit);
}
function exportReviewsForFineTune() {
    return readAll()
        .entries.filter((e) => e.verdict === 'correct' || e.verdict === 'partial')
        .map((e) => ({
        instruction: e.knowledgeQuestion,
        output: e.knowledgeAnswerPreview,
        label: e.verdict
    }));
}
