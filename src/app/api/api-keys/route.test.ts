import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mockAuthenticated,
  mockUnauthenticated,
  createGET,
  createPOST,
  parseJSON,
  FAKE_DB_USER,
} from '@/test/api-helpers'

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
}))

vi.mock('@/services/apiKey.service', () => ({
  listUserApiKeys: vi.fn(),
  createApiKey: vi.fn(),
}))

import { GET, POST } from '@/app/api/api-keys/route'
import { ensureUser } from '@/services/user.service'
import { listUserApiKeys, createApiKey } from '@/services/apiKey.service'

const mockEnsureUser = vi.mocked(ensureUser)
const mockListUserApiKeys = vi.mocked(listUserApiKeys)
const mockCreateApiKey = vi.mocked(createApiKey)

const FAKE_API_KEY = {
  id: 'key_1',
  modelId: 'gpt-4',
  adapterType: 'openai' as const,
  providerConfig: { label: 'OpenAI', baseUrl: 'https://api.openai.com' },
  label: 'My Key',
  maskedKey: 'sk-****abcd',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/api-keys', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const res = await GET()
    expect(res.status).toBe(401)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('returns API key list on success', async () => {
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER)
    mockListUserApiKeys.mockResolvedValue([FAKE_API_KEY])

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: true, data: [FAKE_API_KEY] })
    expect(mockListUserApiKeys).toHaveBeenCalledWith(FAKE_DB_USER.id)
  })
})

describe('POST /api/api-keys', () => {
  const VALID_BODY = {
    adapterType: 'openai',
    providerConfig: { label: 'OpenAI', baseUrl: 'https://api.openai.com' },
    modelId: 'gpt-4',
    label: 'My Key',
    keyValue: 'sk-1234567890abcdef',
  }

  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createPOST('/api/api-keys', VALID_BODY)
    const res = await POST(req)
    expect(res.status).toBe(401)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('returns 400 for invalid body (missing required fields)', async () => {
    mockAuthenticated()
    const req = createPOST('/api/api-keys', { label: 'incomplete' })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await parseJSON(res)
    expect(body.success).toBe(false)
    expect(body.error).toBeDefined()
  })

  it('returns 201 with created key on success', async () => {
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER)
    mockCreateApiKey.mockResolvedValue(FAKE_API_KEY)

    const req = createPOST('/api/api-keys', VALID_BODY)
    const res = await POST(req)
    expect(res.status).toBe(201)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: true, data: FAKE_API_KEY })
    expect(mockCreateApiKey).toHaveBeenCalledWith(
      FAKE_DB_USER.id,
      'gpt-4',
      'openai',
      { label: 'OpenAI', baseUrl: 'https://api.openai.com' },
      'My Key',
      'sk-1234567890abcdef',
    )
  })
})
