import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { POST } from './route'
import {
  createUser,
  softDeleteUser,
  syncUserFromClerk,
} from '@/services/user.service'
import { logger } from '@/lib/logger'

const verifiedEvent = vi.hoisted(() => ({ value: {} as object }))

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  headers: vi.fn(),
}))
vi.mock('svix', () => ({
  Webhook: vi.fn(function WebhookMock() {
    return {
      verify: vi.fn(() => verifiedEvent.value),
    }
  }),
}))
vi.mock('@/services/user.service', () => ({
  createUser: vi.fn(),
  syncUserFromClerk: vi.fn(),
  softDeleteUser: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

const VALID_SVIX_HEADERS: Record<string, string> = {
  'svix-id': 'msg_test',
  'svix-timestamp': String(Math.floor(Date.now() / 1000)),
  'svix-signature': 'v1,fake-sig',
}

function makeFakeRequest(body: object) {
  return new NextRequest('http://localhost/api/webhooks/clerk', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
    },
  })
}

function mockHeaders(extra: Record<string, string> = {}) {
  const map = { ...VALID_SVIX_HEADERS, ...extra }
  vi.mocked(headers).mockResolvedValue(
    new Headers(map) as Awaited<ReturnType<typeof headers>>,
  )
}

function mockWebhookVerify(result: object) {
  verifiedEvent.value = result
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CLERK_WEBHOOK_SECRET = 'test-secret'
})

describe('POST /api/webhooks/clerk', () => {
  it('returns 400 when svix headers are missing', async () => {
    vi.mocked(headers).mockResolvedValue(
      new Headers() as Awaited<ReturnType<typeof headers>>,
    )

    const res = await POST(makeFakeRequest({}))

    expect(res.status).toBe(400)
  })

  it('handles user.created and calls createUser', async () => {
    mockHeaders()
    mockWebhookVerify({
      type: 'user.created',
      data: {
        id: 'clerk_abc',
        email_addresses: [{ email_address: 'test@example.com' }],
        first_name: 'Test',
        last_name: 'User',
        image_url: null,
        username: null,
      },
    })

    const res = await POST(makeFakeRequest({}))

    expect(res.status).toBe(200)
    expect(createUser).toHaveBeenCalledWith({
      clerkId: 'clerk_abc',
      email: 'test@example.com',
    })
  })

  it('handles user.updated and calls syncUserFromClerk', async () => {
    mockHeaders()
    mockWebhookVerify({
      type: 'user.updated',
      data: {
        id: 'clerk_abc',
        first_name: 'Updated',
        last_name: 'Name',
        image_url: 'https://example.com/avatar.jpg',
        username: 'updateduser',
      },
    })

    const res = await POST(makeFakeRequest({}))

    expect(res.status).toBe(200)
    expect(syncUserFromClerk).toHaveBeenCalledWith('clerk_abc', {
      displayName: 'Updated Name',
      avatarUrl: 'https://example.com/avatar.jpg',
      username: 'updateduser',
    })
  })

  it('handles user.deleted and calls softDeleteUser', async () => {
    mockHeaders()
    mockWebhookVerify({
      type: 'user.deleted',
      data: { id: 'clerk_abc', deleted: true },
    })

    const res = await POST(makeFakeRequest({}))

    expect(res.status).toBe(200)
    expect(softDeleteUser).toHaveBeenCalledWith('clerk_abc')
  })

  it('returns 200 and ignores unknown event types', async () => {
    mockHeaders()
    mockWebhookVerify({ type: 'session.created', data: { id: 'session_abc' } })

    const res = await POST(makeFakeRequest({}))

    expect(res.status).toBe(200)
    expect(createUser).not.toHaveBeenCalled()
    expect(syncUserFromClerk).not.toHaveBeenCalled()
    expect(softDeleteUser).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith(
      'Unhandled Clerk webhook event ignored',
      { eventType: 'session.created' },
    )
  })
})
