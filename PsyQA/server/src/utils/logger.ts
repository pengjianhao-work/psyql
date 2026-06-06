import fs from 'fs';
import path from 'path';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const logDir = process.env.LOG_DIR || path.join(process.cwd(), 'logs');

function appendFileLine(level: LogLevel, line: string): void {
  if (process.env.LOG_FILE === '0') return;
  try {
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const file = path.join(logDir, `psyqa-${day}.log`);
    fs.appendFileSync(file, `[${level}] ${line}\n`, 'utf8');
  } catch {
    /* ignore */
  }
}

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...meta
  };
  const line =
    process.env.NODE_ENV === 'production'
      ? JSON.stringify(payload)
      : `[${payload.ts}] ${level.toUpperCase()} ${message}${
          meta ? ` ${JSON.stringify(meta)}` : ''
        }`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
  appendFileLine(level, line);
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => emit('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit('error', message, meta),
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (process.env.LOG_LEVEL === 'debug') emit('debug', message, meta);
  }
};
