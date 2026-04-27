import type { Logger, LogLevel } from '../types/index.js';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

const COLORS = {
  debug: '\x1b[36m',  // cyan
  info: '\x1b[32m',   // green
  warn: '\x1b[33m',   // yellow
  error: '\x1b[31m',  // red
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

/**
 * Creates a prefixed, level-aware logger.
 */
export function createLogger(prefix: string, level: LogLevel = 'info'): Logger {
  const threshold = LOG_LEVELS[level];
  const timestamp = () => new Date().toISOString();

  const log = (logLevel: Exclude<LogLevel, 'silent'>, message: string, ...args: unknown[]) => {
    if (LOG_LEVELS[logLevel] < threshold) return;

    const color = COLORS[logLevel];
    const tag = `${COLORS.dim}${timestamp()}${COLORS.reset} ${color}[${logLevel.toUpperCase()}]${COLORS.reset} ${COLORS.bold}[${prefix}]${COLORS.reset}`;

    switch (logLevel) {
      case 'debug':
        console.debug(tag, message, ...args);
        break;
      case 'info':
        console.info(tag, message, ...args);
        break;
      case 'warn':
        console.warn(tag, message, ...args);
        break;
      case 'error':
        console.error(tag, message, ...args);
        break;
    }
  };

  return {
    debug: (message: string, ...args: unknown[]) => log('debug', message, ...args),
    info: (message: string, ...args: unknown[]) => log('info', message, ...args),
    warn: (message: string, ...args: unknown[]) => log('warn', message, ...args),
    error: (message: string, ...args: unknown[]) => log('error', message, ...args),
  };
}

/** A no-op logger that silences all output. */
export const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
