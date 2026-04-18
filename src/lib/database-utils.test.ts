import { describe, expect, it } from 'vitest'

import {
  isDatabaseQuotaExceededError,
  normalizeDatabaseConnectionString,
} from '@/lib/database-utils'

describe('normalizeDatabaseConnectionString', () => {
  it('upgrades legacy sslmode=require to verify-full', () => {
    const connectionString =
      'postgresql://user:pass@host/db?sslmode=require&channel_binding=require'

    expect(normalizeDatabaseConnectionString(connectionString)).toContain(
      'sslmode=verify-full',
    )
  })

  it('keeps the connection string unchanged when libpq compat is enabled', () => {
    const connectionString =
      'postgresql://user:pass@host/db?sslmode=require&uselibpqcompat=true'

    expect(normalizeDatabaseConnectionString(connectionString)).toBe(
      connectionString,
    )
  })

  it('returns invalid connection strings unchanged', () => {
    expect(normalizeDatabaseConnectionString('not-a-url')).toBe('not-a-url')
  })
})

describe('isDatabaseQuotaExceededError', () => {
  it('detects Neon data transfer quota errors', () => {
    expect(
      isDatabaseQuotaExceededError(
        new Error(
          'Your project has exceeded the data transfer quota. Upgrade your plan to increase limits.',
        ),
      ),
    ).toBe(true)
  })

  it('ignores unrelated database errors', () => {
    expect(
      isDatabaseQuotaExceededError(new Error('connect ECONNREFUSED 127.0.0.1')),
    ).toBe(false)
  })
})
