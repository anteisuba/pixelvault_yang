import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mockAuthenticated,
  mockUnauthenticated,
  createPOST,
  parseJSON,
} from '@/test/api-helpers'

vi.mock('@/services/story.service', () => ({
  listStories: vi.fn(),
  createStory: vi.fn(),
}))

import { GET, POST } from '@/app/api/stories/route'
import { listStories, createStory } from '@/services/story.service'
import type { StoryListItem, StoryRecord } from '@/types'

const mockListStories = vi.mocked(listStories)
const mockCreateStory = vi.mocked(createStory)

const FAKE_STORY_LIST_ITEM = {
  id: 'story_1',
  title: 'My Story',
  displayMode: 'scroll',
  isPublic: false,
  panelCount: 3,
  coverImageUrl: 'https://example.com/cover.png',
  createdAt: '2026-01-01T00:00:00.000Z',
} as unknown as StoryListItem

const FAKE_STORY = {
  id: 'story_1',
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

describe('GET /api/stories', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const res = await GET()
    expect(res.status).toBe(401)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('returns story list on success', async () => {
    mockAuthenticated()
    mockListStories.mockResolvedValue([FAKE_STORY_LIST_ITEM])

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await parseJSON(res)
    expect(body).toEqual({
      success: true,
      data: [FAKE_STORY_LIST_ITEM],
    })
    expect(mockListStories).toHaveBeenCalledWith('clerk_test_user')
  })
})

describe('POST /api/stories', () => {
  it('returns 401 when unauthenticated', async () => {
    mockUnauthenticated()
    const req = createPOST('/api/stories', {
      title: 'Test',
      generationIds: ['gen_1'],
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('returns 400 for invalid body', async () => {
    mockAuthenticated()
    const req = createPOST('/api/stories', { title: '' })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = (await parseJSON(res)) as Record<string, unknown>
    expect(body.success).toBe(false)
    expect(body.error).toBeDefined()
  })

  it('returns created story on success', async () => {
    mockAuthenticated()
    mockCreateStory.mockResolvedValue(FAKE_STORY)

    const req = createPOST('/api/stories', {
      title: 'My Story',
      generationIds: ['gen_1', 'gen_2'],
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await parseJSON(res)
    expect(body).toEqual({ success: true, data: FAKE_STORY })
    expect(mockCreateStory).toHaveBeenCalledWith(
      'clerk_test_user',
      'My Story',
      ['gen_1', 'gen_2'],
    )
  })
})
