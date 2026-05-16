import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { listVoices } from '@/services/fish-audio-voice.service'

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockResolvedValue(
    new Response(
      JSON.stringify({
        total: 1,
        items: [
          {
            _id: 'voice_1',
            title: 'Narrator',
            description: null,
            cover_image: 'coverimage/cover_hash',
            state: 'created',
            languages: ['en'],
            tags: ['narration'],
            samples: [
              {
                title: 'Sample',
                text: 'Hello',
                audio: 'audio/sample_hash',
              },
            ],
            like_count: 3,
            task_count: 12,
            visibility: 'public',
            created_at: '2026-01-01T00:00:00.000Z',
            author: {
              _id: 'author_1',
              nickname: 'Voice Maker',
              avatar: null,
            },
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('listVoices', () => {
  it('passes validated query options to Fish Audio', async () => {
    await listVoices('fish-key', {
      self: true,
      pageSize: 10,
      pageNumber: 2,
      title: 'narrator',
      language: 'en',
      sortBy: 'task_count',
    })

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.fish.audio/model?page_size=10&page_number=2&self=true&title=narrator&language=en&sort_by=task_count',
      { headers: { Authorization: 'Bearer fish-key' } },
    )
  })

  it('normalizes relative Fish Audio asset paths', async () => {
    const result = await listVoices('fish-key')

    expect(result.items[0]?.coverImage).toBe(
      'https://public-platform.r2.fish.audio/coverimage/cover_hash',
    )
    expect(result.items[0]?.samples[0]?.audio).toBe(
      'https://public-platform.r2.fish.audio/audio/sample_hash',
    )
  })
})
