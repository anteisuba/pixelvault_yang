import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createGET,
  createPOST,
  parseJSON,
  FAKE_DB_USER,
} from '@/test/api-helpers'

vi.mock('server-only', () => ({}))

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
}))

vi.mock('@/services/collection.service', () => ({
  getUserCollections: vi.fn(),
  createCollection: vi.fn(),
}))

import { GET, POST } from './route'
import { ensureUser } from '@/services/user.service'
import {
  getUserCollections,
  createCollection,
} from '@/services/collection.service'

const mockEnsureUser = vi.mocked(ensureUser)
const mockGetUserCollections = vi.mocked(getUserCollections)
const mockCreateCollection = vi.mocked(createCollection)

const CREATED_AT = new Date('2026-01-01T00:00:00.000Z')

const FAKE_COLLECTION = {
  id: 'col_123',
  name: 'Favorites',
  description: null,
  coverUrl: null,
  isPublic: false,
  itemCount: 0,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
}

const VALID_BODY = {
  name: 'Favorites',
  description: 'Favorite outputs',
  isPublic: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticated()
  mockEnsureUser.mockResolvedValue(FAKE_DB_USER)
  mockGetUserCollections.mockResolvedValue([FAKE_COLLECTION])
  mockCreateCollection.mockResolvedValue(FAKE_COLLECTION)
})

describe('GET /api/collections', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()

    const res = await GET(createGET('/api/collections'))
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(mockGetUserCollections).not.toHaveBeenCalled()
  })

  it('lists collections for the authenticated user', async () => {
    const res = await GET(createGET('/api/collections'))
    const body = await parseJSON<{ success: boolean; data: unknown[] }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(1)
    expect(mockEnsureUser).toHaveBeenCalledWith('clerk_test_user')
    expect(mockGetUserCollections).toHaveBeenCalledWith(FAKE_DB_USER.id)
  })
})

describe('POST /api/collections', () => {
  it('returns 400 for invalid body', async () => {
    const res = await POST(createPOST('/api/collections', { name: '' }))
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockCreateCollection).not.toHaveBeenCalled()
  })

  it('creates a collection for the authenticated user', async () => {
    const res = await POST(createPOST('/api/collections', VALID_BODY))
    const body = await parseJSON<{ success: boolean; data: unknown }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toMatchObject({ id: 'col_123' })
    expect(mockCreateCollection).toHaveBeenCalledWith(
      FAKE_DB_USER.id,
      VALID_BODY,
    )
  })

  it('returns 422 when the collection limit is exceeded', async () => {
    mockCreateCollection.mockRejectedValue(new Error('MAX_COLLECTIONS_EXCEEDED'))

    const res = await POST(createPOST('/api/collections', VALID_BODY))
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(422)
    expect(body.success).toBe(false)
  })
})
