"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
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
