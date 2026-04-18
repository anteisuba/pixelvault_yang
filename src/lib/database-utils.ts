const DATABASE_QUOTA_ERROR_PATTERNS = [
  /exceeded the data transfer quota/i,
  /exceeded the logical size quota/i,
]

const LEGACY_SSL_MODES = new Set(['prefer', 'require', 'verify-ca'])
const SSLMODE_VERIFY_FULL = 'verify-full'
const USE_LIBPQ_COMPAT_PARAM = 'uselibpqcompat'

export function normalizeDatabaseConnectionString(
  connectionString: string,
): string {
  let parsed: URL

  try {
    parsed = new URL(connectionString)
  } catch {
    return connectionString
  }

  const sslMode = parsed.searchParams.get('sslmode')
  const usesLibpqCompat =
    parsed.searchParams.get(USE_LIBPQ_COMPAT_PARAM) === 'true'

  if (!sslMode || usesLibpqCompat || !LEGACY_SSL_MODES.has(sslMode)) {
    return connectionString
  }

  parsed.searchParams.set('sslmode', SSLMODE_VERIFY_FULL)
  return parsed.toString()
}

export function isDatabaseQuotaExceededError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return DATABASE_QUOTA_ERROR_PATTERNS.some((pattern) => pattern.test(message))
}
