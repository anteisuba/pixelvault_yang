import { describe, it, expect } from 'vitest'

import { parseJSON } from '@/test/api-helpers'

import { GET } from './route'

describe('GET /api/health', () => {
  it('returns an ok liveness status', async () => {
    const res = await GET()
    const body = await parseJSON<{ status: string; timestamp: string }>(res)

    expect(res.status).toBe(200)
    expect(body.status).toBe('ok')
  })

  it('returns a parseable timestamp', async () => {
    const res = await GET()
    const body = await parseJSON<{ timestamp: string }>(res)

    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false)
  })

  it('does not require Clerk auth', async () => {
    const res = await GET()
    const body = await parseJSON<{ status: string }>(res)

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ status: 'ok' })
  })
})
