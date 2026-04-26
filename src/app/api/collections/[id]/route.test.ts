import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createGET,
  createPUT,
  createDELETE,
  parseJSON,
  FAKE_DB_USER,
} from '@/test/api-helpers'

vi.mock('server-only', () => ({}))

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
  getUserByClerkId: vi.fn(),
}))

vi.mock('@/services/collection.service', () => ({
  getCollectionById: vi.fn(),
  updateCollection: vi.fn(),
  deleteCollection: vi.fn(),
}))

import { GET, PUT, DELETE } from './route'
import { ensureUser, getUserByClerkId } from '@/services/user.service'
import {
  getCollectionById,
  updateCollection,
  deleteCollection,
} from '@/services/collection.service'

const mockEnsureUser = vi.mocked(ensureUser)
const mockGetUserByClerkId = vi.mocked(getUserByClerkId)
const mockGetCollectionById = vi.mocked(getCollectionById)
const mockUpdateCollection = vi.mocked(updateCollection)
const mockDeleteCollection = vi.mocked(deleteCollection)

const COLLECTION_ID = 'col_123'
const routeParams = { params: Promise.resolve({ id: COLLECTION_ID }) }
const CREATED_AT = new Date('2026-01-01T00:00:00.000Z')

const FAKE_COLLECTION = {
  id: COLLECTION_ID,
  name: 'Favorites',
  description: null,
  coverUrl: null,
  isPublic: true,
  itemCount: 0,
  generations: [],
  total: 0,
  hasMore: false,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticated()
  mockEnsureUser.mockResolvedValue(FAKE_DB_USER)
  mockGetUserByClerkId.mockResolvedValue(FAKE_DB_USER)
  mockGetCollectionById.mockResolvedValue(FAKE_COLLECTION as never)
  mockUpdateCollection.mockResolvedValue(FAKE_COLLECTION as never)
  mockDeleteCollection.mockResolvedValue(true)
})

describe('GET /api/collections/[id]', () => {
  it('allows unauthenticated access and passes a null viewer id', async () => {
    mockUnauthenticated()

    const res = await GET(
      createGET(`/api/collections/${COLLECTION_ID}`),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean; data: unknown }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mockGetCollectionById).toHaveBeenCalledWith(
      COLLECTION_ID,
      null,
      1,
      20,
    )
  })

  it('passes authenticated viewer id and pagination query', async () => {
    const res = await GET(
      createGET(`/api/collections/${COLLECTION_ID}`, {
        page: '2',
        limit: '10',
      }),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean; data: unknown }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mockGetUserByClerkId).toHaveBeenCalledWith('clerk_test_user')
    expect(mockGetCollectionById).toHaveBeenCalledWith(
      COLLECTION_ID,
      FAKE_DB_USER.id,
      2,
      10,
    )
  })

  it('returns 404 when the collection is not found or inaccessible', async () => {
    mockGetCollectionById.mockResolvedValue(null)

    const res = await GET(
      createGET(`/api/collections/${COLLECTION_ID}`),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(404)
    expect(body.success).toBe(false)
  })
})

describe('PUT /api/collections/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()

    const res = await PUT(
      createPUT(`/api/collections/${COLLECTION_ID}`, { name: 'Updated' }),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(mockUpdateCollection).not.toHaveBeenCalled()
  })

  it('returns 400 for invalid update body', async () => {
    const res = await PUT(
      createPUT(`/api/collections/${COLLECTION_ID}`, { name: '' }),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
  })

  it('updates a collection for the owner', async () => {
    const res = await PUT(
      createPUT(`/api/collections/${COLLECTION_ID}`, { name: 'Updated' }),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean; data: unknown }>(res)

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mockUpdateCollection).toHaveBeenCalledWith(COLLECTION_ID, FAKE_DB_USER.id, {
      name: 'Updated',
    })
  })
})

describe('DELETE /api/collections/[id]', () => {
  it('deletes a collection for the owner', async () => {
    const res = await DELETE(
      createDELETE(`/api/collections/${COLLECTION_ID}`),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean; data: null }>(res)

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true, data: null })
    expect(mockDeleteCollection).toHaveBeenCalledWith(
      COLLECTION_ID,
      FAKE_DB_USER.id,
    )
  })
})
