import { NextRequest } from 'next/server'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  mockAuthenticated,
  mockUnauthenticated,
  createPOST,
  parseJSON,
  FAKE_DB_USER,
} from '@/test/api-helpers'

vi.mock('server-only', () => ({}))

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
}))

vi.mock('@/services/collection.service', () => ({
  addToCollection: vi.fn(),
  removeFromCollection: vi.fn(),
}))

import { POST, DELETE } from './route'
import { ensureUser } from '@/services/user.service'
import {
  addToCollection,
  removeFromCollection,
} from '@/services/collection.service'

const mockEnsureUser = vi.mocked(ensureUser)
const mockAddToCollection = vi.mocked(addToCollection)
const mockRemoveFromCollection = vi.mocked(removeFromCollection)

const COLLECTION_ID = 'col_123'
const routeParams = { params: Promise.resolve({ id: COLLECTION_ID }) }

function createJsonDELETE(path: string, body: unknown) {
  return new NextRequest(new URL(path, 'http://localhost:3000'), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuthenticated()
  mockEnsureUser.mockResolvedValue(FAKE_DB_USER)
  mockAddToCollection.mockResolvedValue(2)
  mockRemoveFromCollection.mockResolvedValue(true)
})

describe('POST /api/collections/[id]/items', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()

    const res = await POST(
      createPOST(`/api/collections/${COLLECTION_ID}/items`, {
        generationIds: ['gen_1'],
      }),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(mockAddToCollection).not.toHaveBeenCalled()
  })

  it('returns 400 for invalid body', async () => {
    const res = await POST(
      createPOST(`/api/collections/${COLLECTION_ID}/items`, {
        generationIds: [],
      }),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockAddToCollection).not.toHaveBeenCalled()
  })

  it('adds generation ids to the collection', async () => {
    const res = await POST(
      createPOST(`/api/collections/${COLLECTION_ID}/items`, {
        generationIds: ['gen_1', 'gen_2'],
      }),
      routeParams,
    )
    const body = await parseJSON<{
      success: boolean
      data: { added: number }
    }>(res)

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true, data: { added: 2 } })
    expect(mockAddToCollection).toHaveBeenCalledWith(
      COLLECTION_ID,
      FAKE_DB_USER.id,
      ['gen_1', 'gen_2'],
    )
  })
})

describe('DELETE /api/collections/[id]/items', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()

    const res = await DELETE(
      createJsonDELETE(`/api/collections/${COLLECTION_ID}/items`, {
        generationId: 'gen_1',
      }),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(401)
    expect(body.success).toBe(false)
    expect(mockRemoveFromCollection).not.toHaveBeenCalled()
  })

  it('returns 400 when generationId is missing', async () => {
    const res = await DELETE(
      createJsonDELETE(`/api/collections/${COLLECTION_ID}/items`, {}),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(mockRemoveFromCollection).not.toHaveBeenCalled()
  })

  it('removes an item from the collection', async () => {
    const res = await DELETE(
      createJsonDELETE(`/api/collections/${COLLECTION_ID}/items`, {
        generationId: 'gen_1',
      }),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean }>(res)

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true })
    expect(mockRemoveFromCollection).toHaveBeenCalledWith(
      COLLECTION_ID,
      FAKE_DB_USER.id,
      'gen_1',
    )
  })

  it('returns 404 when the item is not removed', async () => {
    mockRemoveFromCollection.mockResolvedValue(false)

    const res = await DELETE(
      createJsonDELETE(`/api/collections/${COLLECTION_ID}/items`, {
        generationId: 'gen_1',
      }),
      routeParams,
    )
    const body = await parseJSON<{ success: boolean; error: string }>(res)

    expect(res.status).toBe(404)
    expect(body.success).toBe(false)
  })
})
