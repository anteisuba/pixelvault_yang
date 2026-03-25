import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mockAuthenticated,
  mockUnauthenticated,
  createGET,
  createPUT,
  createDELETE,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/services/story.service', () => ({
  getStoryById: vi.fn(),
  getPublicStoryById: vi.fn(),
  updateStory: vi.fn(),
  deleteStory: vi.fn(),
}))

import { GET, PUT, DELETE } from '@/app/api/stories/[id]/route'
import {
  getStoryById,
  getPublicStoryById,
  updateStory,
  deleteStory,
} from '@/services/story.service'
import type { StoryRecord } from '@/types'

const mockGetStoryById = vi.mocked(getStoryById)
const mockGetPublicStoryById = vi.mocked(getPublicStoryById)
const mockUpdateStory = vi.mocked(updateStory)
const mockDeleteStory = vi.mocked(deleteStory)

const STORY_ID = 'story_abc'
const routeParams = { params: Promise.resolve({ id: STORY_ID }) }

const FAKE_STORY = {
  id: STORY_ID,
  title: 'My Story',
  displayMode: 'scroll',
  isPublic: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  panels: [],
} as unknown as StoryRecord

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/stories/[id]', () => {
  it('returns owner story when authenticated', async () => {
    mockAuthenticated()
    mockGetStoryById.mockResolvedValue(FAKE_STORY)

    const req = createGET(`/api/stories/${STORY_ID}`)
    const res = await GET(req, routeParams)
    expect(res.status).toBe(200)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: true, data: FAKE_STORY })
    expect(mockGetStoryById).toHaveBeenCalledWith(STORY_ID, 'clerk_test_user')
  })

  it('falls back to public story when not owner', async () => {
    mockAuthenticated()
    mockGetStoryById.mockResolvedValue(null)
    mockGetPublicStoryById.mockResolvedValue({
      ...FAKE_STORY,
      isPublic: true,
    })

    const req = createGET(`/api/stories/${STORY_ID}`)
    const res = await GET(req, routeParams)
    expect(res.status).toBe(200)
    const body = await parseJSON(res)
    expect(body).toEqual({
      success: true,
      data: { ...FAKE_STORY, isPublic: true },
    })
    expect(mockGetPublicStoryById).toHaveBeenCalledWith(STORY_ID)
  })

  it('returns 404 when story not found', async () => {
    mockUnauthenticated()
    mockGetPublicStoryById.mockResolvedValue(null)

    const req = createGET(`/api/stories/${STORY_ID}`)
    const res = await GET(req, routeParams)
    expect(res.status).toBe(404)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: false, error: 'Story not found' })
  })
})

describe('PUT /api/stories/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createPUT(`/api/stories/${STORY_ID}`, { title: 'Updated' })
    const res = await PUT(req, routeParams)
    expect(res.status).toBe(401)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('returns 400 for invalid body', async () => {
    mockAuthenticated()
    const req = createPUT(`/api/stories/${STORY_ID}`, {
      displayMode: 'invalid_mode',
    })
    const res = await PUT(req, routeParams)
    expect(res.status).toBe(400)
    const body = (await parseJSON(res)) as Record<string, unknown>
    expect(body.success).toBe(false)
    expect(body.error).toBeDefined()
  })

  it('returns updated story on success', async () => {
    mockAuthenticated()
    const updated = { ...FAKE_STORY, title: 'Updated Title' }
    mockUpdateStory.mockResolvedValue(updated)

    const req = createPUT(`/api/stories/${STORY_ID}`, {
      title: 'Updated Title',
    })
    const res = await PUT(req, routeParams)
    expect(res.status).toBe(200)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: true, data: updated })
    expect(mockUpdateStory).toHaveBeenCalledWith(STORY_ID, 'clerk_test_user', {
      title: 'Updated Title',
    })
  })
})

describe('DELETE /api/stories/[id]', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createDELETE(`/api/stories/${STORY_ID}`)
    const res = await DELETE(req, routeParams)
    expect(res.status).toBe(401)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('returns 204 on success', async () => {
    mockAuthenticated()
    mockDeleteStory.mockResolvedValue(undefined)

    const req = createDELETE(`/api/stories/${STORY_ID}`)
    const res = await DELETE(req, routeParams)
    expect(res.status).toBe(204)
    expect(mockDeleteStory).toHaveBeenCalledWith(STORY_ID, 'clerk_test_user')
  })
})
