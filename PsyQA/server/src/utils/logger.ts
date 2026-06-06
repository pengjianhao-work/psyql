type LogLevel = 'info' | 'warn' | 'error' | 'debug';

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
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => emit('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit('error', message, meta),
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (process.env.LOG_LEVEL === 'debug') emit('debug', message, meta);
  }
};
