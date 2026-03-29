/**
 * Structured logging utility for PixelVault.
 *
 * Usage:
 *   import { logger } from '@/lib/logger'
 *   logger.info('Generation started', { userId, modelId })
 *   logger.error('Provider failed', { adapter, error: err.message })
 *
 * In development: pretty-printed to console.
 * In production: JSON lines for log aggregation (Vercel, Datadog, etc).
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  msg: string
  timestamp: string
  [key: string]: unknown
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const currentLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) ||
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug')

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel]
}

function formatEntry(entry: LogEntry): string {
  if (process.env.NODE_ENV === 'production') {
    return JSON.stringify(entry)
  }

  const { level, msg, timestamp, ...rest } = entry
  const prefix = `[${timestamp.slice(11, 19)}] ${level.toUpperCase().padEnd(5)}`
  const extra = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : ''
  return `${prefix} ${msg}${extra}`
}

function log(
  level: LogLevel,
  msg: string,
  context?: Record<string, unknown>,
): void {
  if (!shouldLog(level)) return

  const entry: LogEntry = {
    level,
    msg,
    timestamp: new Date().toISOString(),
    ...context,
  }

  const formatted = formatEntry(entry)

  switch (level) {
    case 'error':
      console.error(formatted)
      break
    case 'warn':
      console.warn(formatted)
      break
    default:
      console.log(formatted)
  }
}

export const logger = {
  debug: (msg: string, context?: Record<string, unknown>) =>
    log('debug', msg, context),
  info: (msg: string, context?: Record<string, unknown>) =>
    log('info', msg, context),
  warn: (msg: string, context?: Record<string, unknown>) =>
    log('warn', msg, context),
  error: (msg: string, context?: Record<string, unknown>) =>
    log('error', msg, context),

  /** Create a child logger with preset context fields */
  child: (defaultContext: Record<string, unknown>) => ({
    debug: (msg: string, ctx?: Record<string, unknown>) =>
      log('debug', msg, { ...defaultContext, ...ctx }),
    info: (msg: string, ctx?: Record<string, unknown>) =>
      log('info', msg, { ...defaultContext, ...ctx }),
    warn: (msg: string, ctx?: Record<string, unknown>) =>
      log('warn', msg, { ...defaultContext, ...ctx }),
    error: (msg: string, ctx?: Record<string, unknown>) =>
      log('error', msg, { ...defaultContext, ...ctx }),
  }),
}
