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
  createPresignedR2PutUrl: vi.fn(),
  deleteFromR2: vi.fn(),
  fetchAsBuffer: vi.fn(),
  getR2ObjectBuffer: vi.fn(),
  getR2PublicUrl: vi.fn((key: string) => `https://cdn.example.com/${key}`),
}))

import { ensureUser } from '@/services/user.service'
import { createGeneration } from '@/services/generation.service'
import {
  createImageThumbnailAsset,
  createPresignedR2PutUrl,
  deleteFromR2,
  detectTrustedImageMime,
  getR2ObjectBuffer,
  uploadToR2,
} from '@/services/storage/r2'
import {
  completeUserImageDirectUpload,
  createUserImageDirectUpload,
  uploadUserImageFile,
} from '@/services/upload-image.service'

const mockEnsureUser = vi.mocked(ensureUser)
const mockCreateGeneration = vi.mocked(createGeneration)
const mockDetect = vi.mocked(detectTrustedImageMime)
const mockUploadToR2 = vi.mocked(uploadToR2)
const mockThumbnail = vi.mocked(createImageThumbnailAsset)
const mockCreatePresigned = vi.mocked(createPresignedR2PutUrl)
const mockGetR2ObjectBuffer = vi.mocked(getR2ObjectBuffer)
const mockDeleteFromR2 = vi.mocked(deleteFromR2)

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
    mockCreatePresigned.mockResolvedValue(
      'https://r2.example.com/upload?signature=ok',
    )
    mockGetR2ObjectBuffer.mockResolvedValue({
      buffer: Buffer.from('uploaded png'),
      mimeType: 'image/png',
    })
    mockDeleteFromR2.mockResolvedValue(undefined)
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

describe('direct R2 user image upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER)
    mockDetect.mockResolvedValue({
      format: 'png',
      mimeType: 'image/png',
      width: 1600,
      height: 1200,
    })
    mockCreatePresigned.mockResolvedValue(
      'https://r2.example.com/upload?signature=ok',
    )
    mockThumbnail.mockResolvedValue({
      thumbnailUrl: 'https://cdn.example.com/r2/photo.thumbnail.webp',
      thumbnailStorageKey:
        'generations/db_user_123/image/2026-07-07_abc.thumbnail.webp',
    })
    mockCreateGeneration.mockResolvedValue(FAKE_GENERATION)
    mockDeleteFromR2.mockResolvedValue(undefined)
  })

  it('prepares a short-lived direct R2 upload for the authenticated user', async () => {
    const result = await createUserImageDirectUpload('clerk-1', {
      fileName: 'photo.png',
      mimeType: 'image/png',
      sizeBytes: 2048,
    })

    expect(mockCreatePresigned).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'generations/u1/image/2026-07-07_abc.png',
        mimeType: 'image/png',
      }),
    )
    expect(result).toMatchObject({
      uploadUrl: 'https://r2.example.com/upload?signature=ok',
      storageKey: 'generations/u1/image/2026-07-07_abc.png',
      publicUrl:
        'https://cdn.example.com/generations/u1/image/2026-07-07_abc.png',
      headers: { 'Content-Type': 'image/png', 'If-None-Match': '*' },
      maxBytes: USER_UPLOAD_MAX_BYTES,
    })
  })

  it('completes a user-owned direct upload after reading and validating R2 bytes', async () => {
    const buffer = Buffer.from('uploaded png')
    mockGetR2ObjectBuffer.mockResolvedValue({ buffer, mimeType: 'image/png' })

    await completeUserImageDirectUpload('clerk-1', {
      storageKey: 'generations/db_user_123/image/2026-07-07_abc.png',
      mimeType: 'image/png',
      sizeBytes: buffer.byteLength,
      note: 'holiday',
      projectId: 'proj-9',
    })

    expect(mockGetR2ObjectBuffer).toHaveBeenCalledWith({
      key: 'generations/db_user_123/image/2026-07-07_abc.png',
      maxBytes: USER_UPLOAD_MAX_BYTES,
    })
    expect(mockUploadToR2).not.toHaveBeenCalled()
    expect(mockThumbnail).toHaveBeenCalledWith({
      sourceBuffer: buffer,
      sourceStorageKey: 'generations/db_user_123/image/2026-07-07_abc.png',
    })

    const created = mockCreateGeneration.mock.calls[0][0]
    expect(created).toMatchObject({
      url: 'https://cdn.example.com/generations/db_user_123/image/2026-07-07_abc.png',
      storageKey: 'generations/db_user_123/image/2026-07-07_abc.png',
      mimeType: 'image/png',
      prompt: 'holiday',
      provider: USER_UPLOAD_PROVIDER,
      model: USER_UPLOAD_PROVIDER,
      projectId: 'proj-9',
      userId: 'db_user_123',
    })
  })

  it('rejects a direct upload storage key outside the authenticated user prefix', async () => {
    await expect(
      completeUserImageDirectUpload('clerk-1', {
        storageKey: 'generations/other-user/image/2026-07-07_abc.png',
        mimeType: 'image/png',
        sizeBytes: 12,
      }),
    ).rejects.toMatchObject({ status: 403 })

    expect(mockGetR2ObjectBuffer).not.toHaveBeenCalled()
    expect(mockCreateGeneration).not.toHaveBeenCalled()
  })

  it('cleans up and rejects when the uploaded object size differs from the prepared size', async () => {
    mockGetR2ObjectBuffer.mockResolvedValue({
      buffer: Buffer.from('larger than expected'),
      mimeType: 'image/png',
    })

    await expect(
      completeUserImageDirectUpload('clerk-1', {
        storageKey: 'generations/db_user_123/image/2026-07-07_abc.png',
        mimeType: 'image/png',
        sizeBytes: 3,
      }),
    ).rejects.toMatchObject({ status: 400 })

    expect(mockDeleteFromR2).toHaveBeenCalledWith(
      'generations/db_user_123/image/2026-07-07_abc.png',
    )
    expect(mockCreateGeneration).not.toHaveBeenCalled()
  })
})
