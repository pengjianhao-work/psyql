"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.APP_ROOT = exports.SERVER_ROOT = void 0;
exports.serverDataPath = serverDataPath;
exports.serverPath = serverPath;
exports.appPath = appPath;
exports.firstExistingPath = firstExistingPath;
exports.resolveDataFile = resolveDataFile;
exports.userHistoryJsonPath = userHistoryJsonPath;
exports.psyqaFullJsonPath = psyqaFullJsonPath;
exports.vectorDbPath = vectorDbPath;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/** Absolute path to `PsyQA/server/` */
exports.SERVER_ROOT = path_1.default.resolve(path_1.default.join(__dirname, '..', '..'));
/** Absolute path to `PsyQA/` (repo app root, parent of server/) */
exports.APP_ROOT = path_1.default.resolve(path_1.default.join(exports.SERVER_ROOT, '..'));
function serverDataPath(...segments) {
    return path_1.default.join(exports.SERVER_ROOT, 'data', ...segments);
}
function serverPath(...segments) {
    return path_1.default.join(exports.SERVER_ROOT, ...segments);
}
function appPath(...segments) {
    return path_1.default.join(exports.APP_ROOT, ...segments);
}
function firstExistingPath(...candidates) {
    for (const candidate of candidates) {
        if (fs_1.default.existsSync(candidate))
            return candidate;
    }
    return undefined;
}
/** Resolve a file under `server/data/`, with cwd fallback for scripts. */
function resolveDataFile(name) {
    var _a;
    const primary = serverDataPath(name);
    const fromCwd = path_1.default.join(process.cwd(), 'server', 'data', name);
    return (_a = firstExistingPath(primary, fromCwd)) !== null && _a !== void 0 ? _a : primary;
}
function userHistoryJsonPath() {
    var _a;
    return ((_a = firstExistingPath(serverPath('user_history.json'), appPath('user_history.json'), path_1.default.join(exports.SERVER_ROOT, 'src', 'user_history.json'))) !== null && _a !== void 0 ? _a : serverPath('user_history.json'));
}
function psyqaFullJsonPath() {
    var _a;
    return ((_a = firstExistingPath(appPath('PsyQA_full.json'), path_1.default.join(process.cwd(), 'PsyQA_full.json'))) !== null && _a !== void 0 ? _a : appPath('PsyQA_full.json'));
}
function vectorDbPath() {
    var _a;
    return ((_a = firstExistingPath(appPath('vector_db'), serverPath('vector_db'))) !== null && _a !== void 0 ? _a : appPath('vector_db'));
}
