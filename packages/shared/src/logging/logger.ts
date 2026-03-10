import { inspect } from 'node:util';

import type { RuntimeConfig } from '../config/runtime-config.ts';
import { redactSecrets } from '../config/runtime-config.ts';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogResult = 'ok' | 'fail';

export interface LogContext {
  runId?: string;
  taskId?: string;
  milestoneId?: string;
  role?: string;
  stage?: string;
}

export interface LogEntry extends LogContext {
  timestamp: string;
  level: LogLevel;
  message: string;
  event?: string;
  durationMs?: number;
  result?: LogResult;
  reason?: string;
  data?: unknown;
}

export interface Logger {
  debug: (message: string, entry?: Partial<LogEntry>) => void;
  info: (message: string, entry?: Partial<LogEntry>) => void;
  warn: (message: string, entry?: Partial<LogEntry>) => void;
  error: (message: string, entry?: Partial<LogEntry>) => void;
  withContext: (context: LogContext) => Logger;
}

export interface LoggerOptions {
  sink?: (line: string) => void;
  now?: () => Date;
}

const levelWeight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function createLogger(config: RuntimeConfig, options: LoggerOptions = {}): Logger {
  return createChildLogger(config.logging.level, {}, options);
}

function createChildLogger(level: LogLevel, context: LogContext, options: LoggerOptions): Logger {
  const sink = options.sink ?? ((line: string) => {
    console.log(line);
  });
  const now = options.now ?? (() => new Date());

  const write = (entryLevel: LogLevel, message: string, entry: Partial<LogEntry> = {}): void => {
    if (levelWeight[entryLevel] < levelWeight[level]) {
      return;
    }

    const payload: LogEntry = redactSecrets({
      timestamp: now().toISOString(),
      level: entryLevel,
      message,
      ...context,
      ...entry,
    });

    sink(JSON.stringify(payload, replacer));
  };

  return {
    debug: (message, entry) => {
      write('debug', message, entry);
    },
    info: (message, entry) => {
      write('info', message, entry);
    },
    warn: (message, entry) => {
      write('warn', message, entry);
    },
    error: (message, entry) => {
      write('error', message, entry);
    },
    withContext(childContext) {
      return createChildLogger(level, { ...context, ...childContext }, options);
    },
  };
}

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'function') {
    return inspect(value);
  }

  return value;
}
