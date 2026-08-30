import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  USER_UPLOAD_PROVIDER,
  USER_VIDEO_UPLOAD_MAX_BYTES,
} from '@/constants/uploads'
import { FAKE_DB_USER, FAKE_GENERATION } from '@/test/api-helpers'

vi.mock('server-only', () => ({}))

vi.mock('@/services/user.service', () => ({ ensureUser: vi.fn() }))
vi.mock('@/services/generation.service', () => ({ createGeneration: vi.fn() }))
vi.mock('@/services/storage/r2', () => ({
  createPresignedR2PutUrl: vi.fn(),
  deleteFromR2: vi.fn(),
  generateStorageKey: vi.fn(
    () => 'generations/db_user_123/video/2026-08-29_abc.mp4',
  ),
  getR2ObjectMetadata: vi.fn(),
  getR2ObjectRange: vi.fn(),
  getR2PublicUrl: vi.fn((key: string) => `https://cdn.example.com/${key}`),
}))

import { createGeneration } from '@/services/generation.service'
import {
  createPresignedR2PutUrl,
  deleteFromR2,
  getR2ObjectMetadata,
  getR2ObjectRange,
} from '@/services/storage/r2'
import { ensureUser } from '@/services/user.service'
import {
  completeUserVideoDirectUpload,
  createUserVideoDirectUpload,
  detectTrustedVideoMime,
} from '@/services/upload-video.service'

const mockEnsureUser = vi.mocked(ensureUser)
const mockCreateGeneration = vi.mocked(createGeneration)
const mockCreatePresigned = vi.mocked(createPresignedR2PutUrl)
const mockGetR2ObjectMetadata = vi.mocked(getR2ObjectMetadata)
const mockGetR2ObjectRange = vi.mocked(getR2ObjectRange)
const mockDeleteFromR2 = vi.mocked(deleteFromR2)

function mp4Buffer(): Buffer {
  return Buffer.concat([
    Buffer.from([0, 0, 0, 24]),
    Buffer.from('ftypisom', 'ascii'),
    Buffer.from('mp42video-bytes', 'ascii'),
  ])
}

describe('direct R2 user video upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER)
    mockCreatePresigned.mockResolvedValue(
      'https://r2.example.com/video?signature=ok',
    )
    mockCreateGeneration.mockResolvedValue(FAKE_GENERATION)
    mockDeleteFromR2.mockResolvedValue(undefined)
  })

  it('recognizes an MP4 from its ISO-BMFF signature', () => {
    expect(detectTrustedVideoMime(mp4Buffer())).toBe('video/mp4')
  })

  it('prepares a content-type-bound browser-direct upload', async () => {
    const result = await createUserVideoDirectUpload('clerk-1', {
      fileName: 'clip.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 2048,
    })

    expect(mockCreatePresigned).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'generations/db_user_123/video/2026-08-29_abc.mp4',
        mimeType: 'video/mp4',
      }),
    )
    expect(result).toMatchObject({
      uploadUrl: 'https://r2.example.com/video?signature=ok',
      headers: { 'Content-Type': 'video/mp4', 'If-None-Match': '*' },
      maxBytes: USER_VIDEO_UPLOAD_MAX_BYTES,
    })
  })

  it('validates only metadata and signature bytes before creating a VIDEO generation', async () => {
    const buffer = mp4Buffer()
    const storedSizeBytes = 80 * 1024 * 1024
    mockGetR2ObjectMetadata.mockResolvedValue({
      sizeBytes: storedSizeBytes,
      mimeType: 'video/mp4',
    })
    mockGetR2ObjectRange.mockResolvedValue({
      buffer,
      mimeType: 'video/mp4',
    })

    await completeUserVideoDirectUpload('clerk-1', {
      storageKey: 'generations/db_user_123/video/2026-08-29_abc.mp4',
      mimeType: 'video/mp4',
      sizeBytes: storedSizeBytes,
      width: 1920,
      height: 1080,
      duration: 8.5,
      projectId: 'project-1',
    })

    expect(mockCreateGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        outputType: 'VIDEO',
        mimeType: 'video/mp4',
        width: 1920,
        height: 1080,
        duration: 8.5,
        provider: USER_UPLOAD_PROVIDER,
        model: USER_UPLOAD_PROVIDER,
        userId: 'db_user_123',
        projectId: 'project-1',
      }),
    )
    expect(mockGetR2ObjectRange).toHaveBeenCalledWith({
      key: 'generations/db_user_123/video/2026-08-29_abc.mp4',
      startByte: 0,
      endByteInclusive: 4095,
    })
  })

  it('cleans up a file whose bytes do not match the claimed video type', async () => {
    const buffer = Buffer.from('not a video')
    mockGetR2ObjectMetadata.mockResolvedValue({
      sizeBytes: buffer.byteLength,
      mimeType: 'video/mp4',
    })
    mockGetR2ObjectRange.mockResolvedValue({
      buffer,
      mimeType: 'video/mp4',
    })

    await expect(
      completeUserVideoDirectUpload('clerk-1', {
        storageKey: 'generations/db_user_123/video/2026-08-29_abc.mp4',
        mimeType: 'video/mp4',
        sizeBytes: buffer.byteLength,
        width: 0,
        height: 0,
      }),
    ).rejects.toMatchObject({ status: 400 })

    expect(mockDeleteFromR2).toHaveBeenCalledWith(
      'generations/db_user_123/video/2026-08-29_abc.mp4',
    )
    expect(mockCreateGeneration).not.toHaveBeenCalled()
  })
})
