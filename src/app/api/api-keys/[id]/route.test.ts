import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mockAuthenticated,
  mockUnauthenticated,
  createPUT,
  createDELETE,
  parseJSON,
  FAKE_DB_USER,
} from '@/test/api-helpers'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { UserApiKeyRecord } from '@/types'

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
}))

vi.mock('@/services/apiKey.service', () => ({
  updateApiKey: vi.fn(),
  deleteApiKey: vi.fn(),
}))

import { PUT, DELETE } from '@/app/api/api-keys/[id]/route'
import { ensureUser } from '@/services/user.service'
import { updateApiKey, deleteApiKey } from '@/services/apiKey.service'

const mockEnsureUser = vi.mocked(ensureUser)
const mockUpdateApiKey = vi.mocked(updateApiKey)
const mockDeleteApiKey = vi.mocked(deleteApiKey)

const KEY_ID = 'key_abc'
const routeParams = { params: Promise.resolve({ id: KEY_ID }) }

const FAKE_API_KEY = {
  id: KEY_ID,
  modelId: 'gpt-4',
  adapterType: 'openai' as AI_ADAPTER_TYPES,
  providerConfig: { label: 'OpenAI', baseUrl: 'https://api.openai.com' },
  label: 'My Key',
  maskedKey: 'sk-****abcd',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
} as unknown as UserApiKeyRecord

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PUT /api/api-keys/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createPUT(`/api/api-keys/${KEY_ID}`, { label: 'Updated' })
    const res = await PUT(req, routeParams)
    expect(res.status).toBe(401)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('returns updated key on success', async () => {
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER)
    const updated = { ...FAKE_API_KEY, label: 'Updated Label' }
    mockUpdateApiKey.mockResolvedValue(updated)

    const req = createPUT(`/api/api-keys/${KEY_ID}`, { label: 'Updated Label' })
    const res = await PUT(req, routeParams)
    expect(res.status).toBe(200)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: true, data: updated })
    expect(mockUpdateApiKey).toHaveBeenCalledWith(KEY_ID, FAKE_DB_USER.id, {
      label: 'Updated Label',
    })
  })
})

describe('DELETE /api/api-keys/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createDELETE(`/api/api-keys/${KEY_ID}`)
    const res = await DELETE(req, routeParams)
    expect(res.status).toBe(401)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('returns 204 on success', async () => {
    mockAuthenticated()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER)
    mockDeleteApiKey.mockResolvedValue(undefined)

    const req = createDELETE(`/api/api-keys/${KEY_ID}`)
    const res = await DELETE(req, routeParams)
    expect(res.status).toBe(204)
    expect(mockDeleteApiKey).toHaveBeenCalledWith(KEY_ID, FAKE_DB_USER.id)
  })
})
