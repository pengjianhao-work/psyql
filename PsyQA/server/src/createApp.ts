import express, { Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import path from 'path';
import { questionRouter } from './routes/question';
import { authRouter } from './routes/auth';
import { schoolRouter } from './routes/school';
import { shouldUseOllamaLlm, isOllamaOnlyAvailable } from './services/ollamaAvailability';
import {
  getLlmStatus
} from './services/llm/llmClient';
import { isZhipuConfigured } from './services/llm/zhipuClient';
import { getChromaStatus } from './services/knowledge/chromaVectorService';
import { getKnowledgeEmbedStatus } from './services/knowledge/knowledgeStatus';
import { BUILD_INFO } from './config/buildInfo';
import { getAskLoadMetrics } from './controllers/questionController';
import { getReportQueueMetrics } from './services/common/reportQueue';
import { getSeasonalRagBoost } from './services/knowledge/seasonalRagPolicy';
import { env } from './config/env';
import { logger } from './utils/logger';

function mountApiRoutes(app: Express, base: string): void {
  app.use(`${base}/auth`, authRouter);
  app.use(`${base}/questions`, questionRouter);
  app.use(`${base}/school`, schoolRouter);
}

export function createApp(): Express {
  const app = express();

  if (env.trustProxy) {
    app.set('trust proxy', 1);
  }

  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (env.isProduction) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  app.use(compression({ threshold: 1024 }));

  app.use((req, res, next) => {
    const start = Date.now();
    const requestId = Math.random().toString(36).slice(2, 8);
    res.setHeader('X-Request-Id', requestId);

    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info('http', {
        requestId,
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs: duration
      });
    });
    next();
  });

  app.use(
    cors({
      origin: env.corsOrigin.length ? env.corsOrigin : true,
      credentials: env.corsOrigin.length > 0
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));

  mountApiRoutes(app, '/api');
  mountApiRoutes(app, '/api/v1');

  app.get('/api/metrics', (_req, res) => {
    if (!env.enableMetrics) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({
      uptimeSec: Math.round(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      nodeEnv: env.nodeEnv,
      activeHandles: (process as NodeJS.Process & { _getActiveHandles?: () => unknown[] })
        ._getActiveHandles
        ? undefined
        : undefined
    });
  });

  app.get('/', (_req, res) => {
    res.json({ message: '心理港湾 - 温暖的心灵栖息地', version: '1.0.0' });
  });

  app.get('/health', async (_req, res) => {
    const useLlm = shouldUseOllamaLlm();
    let llmMode: 'zhipu' | 'ollama' | 'fallback' | 'fast' = 'fast';
    let llmProvider: 'zhipu' | 'ollama' | null = null;
    let model: string | undefined;
    let loraFineTuned = false;
    let ollamaAvailable = false;

    if (useLlm) {
      try {
        const status = await getLlmStatus(true);
        llmMode = status.mode;
        llmProvider = status.provider;
        model = status.fineTuned ? `${status.model}+LoRA` : status.model;
        loraFineTuned = status.fineTuned;
        if (status.provider === 'ollama') {
          ollamaAvailable = true;
        } else {
          ollamaAvailable = await isOllamaOnlyAvailable(true);
        }
      } catch {
        llmMode = 'fallback';
      }
    }

    const chroma = await getChromaStatus();
    const knowledge = await getKnowledgeEmbedStatus();
    const load = getAskLoadMetrics();
    const reportQueue = getReportQueueMetrics();
    res.json({
      status: 'ok',
      llmMode,
      llmProvider,
      zhipuConfigured: isZhipuConfigured(),
      llmAvailable: llmMode === 'zhipu' || llmMode === 'ollama',
      ollamaAvailable,
      model,
      loraFineTuned,
      loraModel: loraFineTuned ? model?.replace('+LoRA', '') : undefined,
      chroma: {
        ...chroma,
        capacityHint: chroma.count != null ? `${chroma.count} vectors` : undefined
      },
      knowledge,
      load,
      reportQueue: {
        pending: reportQueue.pending,
        inFlight: reportQueue.inFlightKeys.length
      },
      seasonalRag: getSeasonalRagBoost(),
      dualLlm: process.env.PSYQA_DUAL_LLM === '1',
      build: BUILD_INFO,
      fastAnswer: process.env.PSYQA_FAST_ANSWER === '1',
      reactDemo: process.env.PSYQA_REACT_DEMO === '1',
      agentMode: (process.env.PSYQA_AGENT_MODE || 'auto').trim().toLowerCase(),
      env: env.nodeEnv
    });
  });

  app.get('/ready', (_req, res) => {
    res.json({ ready: true });
  });

  const clientBuildPath = path.join(__dirname, '..', '..', 'client', 'build');
  if (env.isProduction && env.serveClient) {
    app.use(
      express.static(clientBuildPath, {
        maxAge: '7d',
        index: false
      })
    );
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        next();
        return;
      }
      res.sendFile(path.join(clientBuildPath, 'index.html'), (err) => {
        if (err) next();
      });
    });
  }

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('unhandled', { message: err.message });
    if (!res.headersSent) {
      res.status(500).json({ error: '服务器内部错误' });
    }
  });

  return app;
}
