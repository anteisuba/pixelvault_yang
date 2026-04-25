import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockEnsureUser = vi.fn()

vi.mock('@/services/user.service', () => ({
  ensureUser: (...a: unknown[]) => mockEnsureUser(...a),
}))

const mockLlmCompletion = vi.fn()
const mockResolveLlmRoute = vi.fn()

vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: (...a: unknown[]) => mockLlmCompletion(...a),
  resolveLlmTextRoute: (...a: unknown[]) => mockResolveLlmRoute(...a),
}))

const mockStoryCreate = vi.fn()
const mockStoryFindUnique = vi.fn()
const mockStoryUpdate = vi.fn()
const mockStoryDelete = vi.fn()
const mockGenCount = vi.fn()

vi.mock('@/lib/db', () => ({
  db: {
    story: {
      create: (...a: unknown[]) => mockStoryCreate(...a),
      findUnique: (...a: unknown[]) => mockStoryFindUnique(...a),
      update: (...a: unknown[]) => mockStoryUpdate(...a),
      delete: (...a: unknown[]) => mockStoryDelete(...a),
    },
    generation: {
      count: (...a: unknown[]) => mockGenCount(...a),
    },
  },
}))

import {
  createStory,
  getStoryById,
  updateStory,
  deleteStory,
} from '@/services/story.service'

const FAKE_USER = { id: 'db_user_1', clerkId: 'clerk_1' }
const FAKE_STORY = {
  id: 'story_1',
  title: 'My Story',
  displayMode: 'scroll',
  isPublic: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  userId: 'db_user_1',
  panels: [],
}

describe('createStory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockGenCount.mockResolvedValue(2)
    mockStoryCreate.mockResolvedValue(FAKE_STORY)
  })

  it('creates a story with panels and returns a StoryRecord', async () => {
    const result = await createStory('clerk_1', 'My Story', ['gen_1', 'gen_2'])
    expect(result.id).toBe('story_1')
    expect(result.title).toBe('My Story')
    expect(mockStoryCreate).toHaveBeenCalled()
  })

  it('throws when duplicate generation IDs are provided', async () => {
    await expect(
      createStory('clerk_1', 'Dup', ['gen_1', 'gen_1']),
    ).rejects.toThrow('Duplicate generation IDs')
  })

  it('throws when not all generations are owned by the user', async () => {
    mockGenCount.mockResolvedValue(1)
    await expect(
      createStory('clerk_1', 'Story', ['gen_1', 'gen_2']),
    ).rejects.toThrow('One or more generations not found')
  })
})

describe('getStoryById', () => {
  it('returns null when story belongs to a different user', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockStoryFindUnique.mockResolvedValue({
      ...FAKE_STORY,
      userId: 'other_user',
    })
    const result = await getStoryById('story_1', 'clerk_1')
    expect(result).toBeNull()
  })
})

describe('updateStory', () => {
  it('throws Story not found when story does not belong to user', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockStoryFindUnique.mockResolvedValue({
      ...FAKE_STORY,
      userId: 'other_user',
    })
    await expect(
      updateStory('story_1', 'clerk_1', { title: 'New' }),
    ).rejects.toThrow('Story not found')
  })
})

describe('deleteStory', () => {
  it('deletes the story', async () => {
    mockEnsureUser.mockResolvedValue(FAKE_USER)
    mockStoryFindUnique.mockResolvedValue(FAKE_STORY)
    mockStoryDelete.mockResolvedValue({})
    await deleteStory('story_1', 'clerk_1')
    expect(mockStoryDelete).toHaveBeenCalledWith({ where: { id: 'story_1' } })
  })
})
