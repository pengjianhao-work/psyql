"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordAnalytics = recordAnalytics;
exports.readRecentAnalytics = readRecentAnalytics;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const paths_1 = require("../../config/paths");
const logPath = path_1.default.join(path_1.default.dirname((0, paths_1.resolveDataFile)('analytics.jsonl')), 'analytics.jsonl');
function recordAnalytics(event, userId, meta) {
    if (process.env.PSYQA_ANALYTICS === '0')
        return;
    const line = { event, userId, meta, at: new Date().toISOString() };
    try {
        const dir = path_1.default.dirname(logPath);
        if (!fs_1.default.existsSync(dir))
            fs_1.default.mkdirSync(dir, { recursive: true });
        fs_1.default.appendFileSync(logPath, `${JSON.stringify(line)}\n`, 'utf8');
    }
    catch (_a) {
        /* best-effort */
    }
}
function readRecentAnalytics(limit = 100) {
    try {
        if (!fs_1.default.existsSync(logPath))
            return [];
        const lines = fs_1.default.readFileSync(logPath, 'utf8').trim().split('\n').slice(-limit);
        return lines.map((l) => JSON.parse(l));
    }
    catch (_a) {
        return [];
    }
}
