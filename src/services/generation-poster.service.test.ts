import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FAKE_DB_USER, FAKE_GENERATION } from '@/test/api-helpers'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  db: {
    generation: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))
vi.mock('@/services/storage/r2', () => ({
  detectTrustedImageMime: vi.fn(),
  generateStorageKey: vi.fn(
    () => 'generations/db_user_123/image/2026-08-29_poster.png',
  ),
  uploadToR2: vi.fn(),
}))
vi.mock('@/services/user.service', () => ({ ensureUser: vi.fn() }))

import { db } from '@/lib/db'
import { uploadGenerationPoster } from '@/services/generation-poster.service'
import { detectTrustedImageMime, uploadToR2 } from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'

const mockFind = vi.mocked(db.generation.findUnique)
const mockUpdate = vi.mocked(db.generation.update)
const mockDetect = vi.mocked(detectTrustedImageMime)
const mockUpload = vi.mocked(uploadToR2)
const mockEnsureUser = vi.mocked(ensureUser)

describe('uploadGenerationPoster for video assets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER)
    mockFind.mockResolvedValue({
      ...FAKE_GENERATION,
      outputType: 'VIDEO',
      userId: FAKE_DB_USER.id,
      thumbnailUrl: null,
      thumbnailStorageKey: null,
    } as never)
    mockDetect.mockResolvedValue({
      format: 'webp',
      mimeType: 'image/webp',
      width: 640,
      height: 360,
    })
    mockUpload.mockResolvedValue('https://cdn.example.com/poster.webp')
    mockUpdate.mockResolvedValue({
      ...FAKE_GENERATION,
      outputType: 'VIDEO',
      thumbnailUrl: 'https://cdn.example.com/poster.webp',
      thumbnailStorageKey:
        'generations/db_user_123/image/2026-08-29_poster.png',
    } as never)
  })

  it('keeps the video URL and writes the captured frame to thumbnail fields', async () => {
    await uploadGenerationPoster(
      'clerk-1',
      FAKE_GENERATION.id,
      Buffer.from('poster-bytes'),
      'image/webp',
    )

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: FAKE_GENERATION.id },
      data: {
        thumbnailUrl: 'https://cdn.example.com/poster.webp',
        thumbnailStorageKey:
          'generations/db_user_123/image/2026-08-29_poster.png',
      },
    })
  })
})
