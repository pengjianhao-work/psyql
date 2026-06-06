"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logDir = process.env.LOG_DIR || path_1.default.join(process.cwd(), 'logs');
function appendFileLine(level, line) {
    if (process.env.LOG_FILE === '0')
        return;
    try {
        if (!fs_1.default.existsSync(logDir))
            fs_1.default.mkdirSync(logDir, { recursive: true });
        const day = new Date().toISOString().slice(0, 10);
        const file = path_1.default.join(logDir, `psyqa-${day}.log`);
        fs_1.default.appendFileSync(file, `[${level}] ${line}\n`, 'utf8');
    }
    catch (_a) {
        /* ignore */
    }
}
function emit(level, message, meta) {
    const payload = Object.assign({ ts: new Date().toISOString(), level, msg: message }, meta);
    const line = process.env.NODE_ENV === 'production'
        ? JSON.stringify(payload)
        : `[${payload.ts}] ${level.toUpperCase()} ${message}${meta ? ` ${JSON.stringify(meta)}` : ''}`;
    if (level === 'error')
        console.error(line);
    else if (level === 'warn')
        console.warn(line);
    else
        console.log(line);
    appendFileLine(level, line);
}
exports.logger = {
    info: (message, meta) => emit('info', message, meta),
    warn: (message, meta) => emit('warn', message, meta),
    error: (message, meta) => emit('error', message, meta),
    debug: (message, meta) => {
        if (process.env.LOG_LEVEL === 'debug')
            emit('debug', message, meta);
    }
};
