/**
 * Logging helper: only in __DEV__, with levels. Never log tokens or huge objects.
 * debug: off by default (set to true locally to enable subscription debug logs).
 */
const DEBUG_SUBSCRIPTIONS = false;

type Level = 'debug' | 'info' | 'warn' | 'error';

function shouldLog(level: Level): boolean {
  if (!__DEV__) return false;
  if (level === 'debug') return DEBUG_SUBSCRIPTIONS;
  return true;
}

function safeString(value: unknown, maxLen = 200): string {
  if (value == null) return String(value);
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return s.length <= maxLen ? s : s.slice(0, maxLen) + '...';
}

export const log = {
  debug: (...args: unknown[]) => {
    if (shouldLog('debug')) console.log('[subs]', ...args.map(a => safeString(a)));
  },
  info: (...args: unknown[]) => {
    if (shouldLog('info')) console.log('[subs]', ...args.map(a => safeString(a)));
  },
  success: (...args: unknown[]) => {
    if (shouldLog('info')) console.log('[subs]', ...args.map(a => safeString(a)));
  },
  warn: (...args: unknown[]) => {
    if (shouldLog('warn')) console.warn('[subs]', ...args.map(a => safeString(a)));
  },
  error: (...args: unknown[]) => {
    if (shouldLog('error')) console.error('[subs]', ...args.map(a => safeString(a)));
  },
};

/** Alias used by GlobalWineCatalogScreen, GlobalWineCatalogService, etc. .log() maps to info. */
export const logger = {
  log: (...args: unknown[]) => log.info(...args),
  debug: log.debug,
  info: log.info,
  success: log.success,
  warn: log.warn,
  error: log.error,
};
