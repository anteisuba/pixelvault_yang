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

const REDACTED = '[REDACTED]'
const CIRCULAR = '[Circular]'
const SENSITIVE_FIELD_NAMES = new Set([
  'apikey',
  'authorization',
  'body',
  'clientsecret',
  'cookie',
  'credential',
  'encryptedkey',
  'keyvalue',
  'password',
  'payload',
  'privatekey',
  'prompt',
  'negativeprompt',
  'rawoutput',
  'refreshtoken',
  'secret',
  'setcookie',
  'signature',
  'token',
  'accesstoken',
])

const currentLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) ||
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug')

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel]
}

function normalizeFieldName(field: string): string {
  return field.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function isSensitiveField(field: string): boolean {
  const normalized = normalizeFieldName(field)
  if (SENSITIVE_FIELD_NAMES.has(normalized)) return true

  return (
    normalized.endsWith('password') ||
    normalized.endsWith('secret') ||
    normalized.endsWith('signature') ||
    normalized.endsWith('credential') ||
    (normalized.endsWith('token') && !normalized.endsWith('tokenid')) ||
    (normalized.endsWith('apikey') && !normalized.endsWith('apikeyid'))
  )
}

function redactUrl(value: string): string {
  try {
    const url = new URL(value)
    if (url.search.length > 0) {
      return `${url.origin}${url.pathname}?[REDACTED]`
    }
  } catch {
    // The caller may have supplied prose containing a URL. The outer string
    // sanitizer handles individual URLs and token-shaped fragments.
  }

  return value
}

function sanitizeString(value: string): string {
  return value
    .replace(/https?:\/\/[^\s"'<>]+/gi, (url) => redactUrl(url))
    .replace(/\b(Bearer|Basic)\s+[^\s,;]+/gi, `$1 ${REDACTED}`)
    .replace(
      /\b(?:sk-(?:proj-)?|sk_live_|sk_test_|rk_live_)[a-z0-9_-]{8,}\b/gi,
      REDACTED,
    )
}

function sanitizeLogValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return sanitizeString(value)
  if (
    value == null ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message),
    }
  }
  if (typeof value !== 'object') return String(value)
  if (seen.has(value)) return CIRCULAR

  seen.add(value)
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogValue(item, seen))
  }

  const result: Record<string, unknown> = {}
  for (const [key, nestedValue] of Object.entries(value)) {
    result[key] = isSensitiveField(key)
      ? REDACTED
      : sanitizeLogValue(nestedValue, seen)
  }
  return result
}

function sanitizeContext(
  context?: Record<string, unknown>,
): Record<string, unknown> {
  if (!context) return {}
  return sanitizeLogValue(context, new WeakSet()) as Record<string, unknown>
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
    msg: sanitizeString(msg),
    timestamp: new Date().toISOString(),
    ...sanitizeContext(context),
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
