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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const compression_1 = __importDefault(require("compression"));
const path_1 = __importDefault(require("path"));
const question_1 = require("./routes/question");
const auth_1 = require("./routes/auth");
const school_1 = require("./routes/school");
const ollamaAvailability_1 = require("./services/ollamaAvailability");
const ollamaClient_1 = require("./services/ollamaClient");
const env_1 = require("./config/env");
const logger_1 = require("./utils/logger");
function mountApiRoutes(app, base) {
    app.use(`${base}/auth`, auth_1.authRouter);
    app.use(`${base}/questions`, question_1.questionRouter);
    app.use(`${base}/school`, school_1.schoolRouter);
}
function createApp() {
    const app = (0, express_1.default)();
    if (env_1.env.trustProxy) {
        app.set('trust proxy', 1);
    }
    app.disable('x-powered-by');
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        if (env_1.env.isProduction) {
            res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }
        next();
    });
    app.use((0, compression_1.default)({ threshold: 1024 }));
    app.use((req, res, next) => {
        const start = Date.now();
        const requestId = Math.random().toString(36).slice(2, 8);
        res.setHeader('X-Request-Id', requestId);
        res.on('finish', () => {
            const duration = Date.now() - start;
            logger_1.logger.info('http', {
                requestId,
                method: req.method,
                path: req.originalUrl,
                status: res.statusCode,
                durationMs: duration
            });
        });
        next();
    });
    app.use((0, cors_1.default)({
        origin: env_1.env.corsOrigin.length ? env_1.env.corsOrigin : true,
        credentials: env_1.env.corsOrigin.length > 0
    }));
    app.use((0, cookie_parser_1.default)());
    app.use(express_1.default.json({ limit: '1mb' }));
    app.use(express_1.default.urlencoded({ extended: false, limit: '64kb' }));
    mountApiRoutes(app, '/api');
    mountApiRoutes(app, '/api/v1');
    app.get('/api/metrics', (_req, res) => {
        if (!env_1.env.enableMetrics) {
            res.status(404).json({ error: 'Not found' });
            return;
        }
        res.json({
            uptimeSec: Math.round(process.uptime()),
            memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
            nodeEnv: env_1.env.nodeEnv,
            activeHandles: process
                ._getActiveHandles
                ? undefined
                : undefined
        });
    });
    app.get('/', (_req, res) => {
        res.json({ message: '心理港湾 - 温暖的心灵栖息地', version: '1.0.0' });
    });
    app.get('/health', (_req, res) => __awaiter(this, void 0, void 0, function* () {
        const useLlm = (0, ollamaAvailability_1.shouldUseOllamaLlm)();
        const model = (0, ollamaClient_1.getOllamaModel)();
        let ollamaAvailable = false;
        if (useLlm) {
            try {
                ollamaAvailable = yield (0, ollamaAvailability_1.isOllamaAvailable)(true);
            }
            catch (_a) {
                ollamaAvailable = false;
            }
        }
        const llmMode = !useLlm
            ? 'fast'
            : ollamaAvailable
                ? 'ollama'
                : 'fallback';
        res.json({
            status: 'ok',
            llmMode,
            ollamaAvailable,
            model,
            fastAnswer: process.env.PSYQA_FAST_ANSWER === '1',
            env: env_1.env.nodeEnv
        });
    }));
    app.get('/ready', (_req, res) => {
        res.json({ ready: true });
    });
    const clientBuildPath = path_1.default.join(__dirname, '..', '..', 'client', 'build');
    if (env_1.env.isProduction && env_1.env.serveClient) {
        app.use(express_1.default.static(clientBuildPath, {
            maxAge: '7d',
            index: false
        }));
        app.get('*', (req, res, next) => {
            if (req.path.startsWith('/api')) {
                next();
                return;
            }
            res.sendFile(path_1.default.join(clientBuildPath, 'index.html'), (err) => {
                if (err)
                    next();
            });
        });
    }
    app.use((err, _req, res, _next) => {
        logger_1.logger.error('unhandled', { message: err.message });
        if (!res.headersSent) {
            res.status(500).json({ error: '服务器内部错误' });
        }
    });
    return app;
}
