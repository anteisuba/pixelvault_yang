import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FAKE_DB_USER, FAKE_GENERATION } from '@/test/api-helpers'
import {
  USER_UPLOAD_MAX_BYTES,
  USER_UPLOAD_PROVIDER,
} from '@/constants/uploads'

vi.mock('server-only', () => ({}))

vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(),
}))

vi.mock('@/services/generation.service', () => ({
  createGeneration: vi.fn(),
}))

vi.mock('@/services/storage/r2', () => ({
  detectTrustedImageMime: vi.fn(),
  generateStorageKey: vi.fn(() => 'generations/u1/image/2026-07-07_abc.png'),
  uploadToR2: vi.fn(),
  createImageThumbnailAsset: vi.fn(),
  fetchAsBuffer: vi.fn(),
}))

import { ensureUser } from '@/services/user.service'
import { createGeneration } from '@/services/generation.service'
import {
  createImageThumbnailAsset,
  detectTrustedImageMime,
  uploadToR2,
} from '@/services/storage/r2'
import { uploadUserImageFile } from '@/services/upload-image.service'

const mockEnsureUser = vi.mocked(ensureUser)
const mockCreateGeneration = vi.mocked(createGeneration)
const mockDetect = vi.mocked(detectTrustedImageMime)
const mockUploadToR2 = vi.mocked(uploadToR2)
const mockThumbnail = vi.mocked(createImageThumbnailAsset)

describe('uploadUserImageFile (multipart buffer path)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER)
    mockDetect.mockResolvedValue({
      format: 'png',
      mimeType: 'image/png',
      width: 1600,
      height: 1200,
    })
    mockUploadToR2.mockResolvedValue('https://cdn.example.com/r2/photo.png')
    mockThumbnail.mockResolvedValue({
      thumbnailUrl: 'https://cdn.example.com/r2/photo.thumbnail.webp',
      thumbnailStorageKey: 'generations/u1/image/2026-07-07_abc.thumbnail.webp',
    })
    mockCreateGeneration.mockResolvedValue(FAKE_GENERATION)
  })

  it('stores the original bytes as-is and derives only a thumbnail', async () => {
    const fileBuffer = Buffer.from('a real png would be here')

    await uploadUserImageFile('clerk-1', {
      fileBuffer,
      claimedMimeType: 'image/png',
      note: 'holiday',
      projectId: 'proj-9',
    })

    // Original stored untouched — same buffer, detected (not claimed) mime.
    expect(mockUploadToR2).toHaveBeenCalledWith(
      expect.objectContaining({ data: fileBuffer, mimeType: 'image/png' }),
    )
    // Only the thumbnail derivative is made — no 1280px preview.
    expect(mockThumbnail).toHaveBeenCalledWith(
      expect.objectContaining({ sourceBuffer: fileBuffer }),
    )

    const created = mockCreateGeneration.mock.calls[0][0]
    expect(created).toMatchObject({
      url: 'https://cdn.example.com/r2/photo.png',
      mimeType: 'image/png',
      thumbnailUrl: 'https://cdn.example.com/r2/photo.thumbnail.webp',
      width: 1600,
      height: 1200,
      prompt: 'holiday',
      provider: USER_UPLOAD_PROVIDER,
      model: USER_UPLOAD_PROVIDER,
      projectId: 'proj-9',
    })
    // No preview derivative persisted.
    expect(created.previewUrl).toBeUndefined()
    expect(created.previewStorageKey).toBeUndefined()
  })

  it('rejects a buffer over the size cap before touching R2', async () => {
    const tooBig = Buffer.alloc(USER_UPLOAD_MAX_BYTES + 1)

    await expect(
      uploadUserImageFile('clerk-1', { fileBuffer: tooBig }),
    ).rejects.toMatchObject({ status: 400 })

    expect(mockUploadToR2).not.toHaveBeenCalled()
    expect(mockCreateGeneration).not.toHaveBeenCalled()
  })

  it('rejects a buffer whose real format is not allowed', async () => {
    mockDetect.mockRejectedValue(new Error('Unsupported image format: tiff'))

    await expect(
      uploadUserImageFile('clerk-1', { fileBuffer: Buffer.from('nope') }),
    ).rejects.toMatchObject({ status: 400 })

    expect(mockUploadToR2).not.toHaveBeenCalled()
    expect(mockCreateGeneration).not.toHaveBeenCalled()
  })
})
