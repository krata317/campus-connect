type Level = 'info' | 'warn' | 'error';

const write = (level: Level, message: string, meta?: Record<string, unknown>) => {
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;
  if (meta && Object.keys(meta).length > 0) {
    console[level === 'info' ? 'log' : level](line, meta);
    return;
  }
  console[level === 'info' ? 'log' : level](line);
};

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => write('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write('error', message, meta),
};
