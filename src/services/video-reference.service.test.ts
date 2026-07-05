import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { uploadToR2 } from '@/services/storage/r2'

import {
  REFERENCE_VIDEO_MAX_BYTES,
  uploadReferenceVideo,
  validateReferenceVideo,
} from './video-reference.service'

vi.mock('@/services/storage/r2', () => ({
  uploadToR2: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

describe('validateReferenceVideo', () => {
  it('rejects empty video', () => {
    expect(validateReferenceVideo(Buffer.alloc(0), 'video/mp4')).toEqual({
      code: 'EMPTY_VIDEO',
      message: expect.any(String),
    })
  })

  it('rejects oversized video', () => {
    const buffer = Buffer.alloc(REFERENCE_VIDEO_MAX_BYTES + 1)
    expect(validateReferenceVideo(buffer, 'video/mp4')).toEqual({
      code: 'VIDEO_TOO_LARGE',
      message: expect.stringContaining('50 MB'),
    })
  })

  it('rejects unsupported MIME types', () => {
    expect(validateReferenceVideo(Buffer.from('xx'), 'image/png')).toEqual({
      code: 'UNSUPPORTED_VIDEO_TYPE',
      message: expect.any(String),
    })
  })

  it('accepts mp4, mov, webm', () => {
    for (const mime of [
      'video/mp4',
      'video/quicktime',
      'video/x-quicktime',
      'video/webm',
    ]) {
      expect(validateReferenceVideo(Buffer.from('ok'), mime)).toBeNull()
    }
  })
})

describe('uploadReferenceVideo', () => {
  const mockUpload = vi.mocked(uploadToR2)

  beforeEach(() => {
    mockUpload.mockImplementation(
      async ({ key }) => `https://cdn.example.com/${key}`,
    )
  })

  afterEach(() => {
    mockUpload.mockReset()
  })

  it('writes the clip to the video-references prefix with a hashed key', async () => {
    const result = await uploadReferenceVideo({
      userId: 'user-1',
      fileBuffer: Buffer.from('payload'),
      mimeType: 'video/mp4',
    })

    expect(result.sizeBytes).toBe(Buffer.byteLength('payload'))
    expect(mockUpload).toHaveBeenCalledTimes(1)
    const args = mockUpload.mock.calls[0]![0]
    expect(args.key).toMatch(
      /^video-references\/user-1\/\d{4}-\d{2}-\d{2}_[a-f0-9]{24}\.mp4$/,
    )
    expect(args.mimeType).toBe('video/mp4')
    expect(result.thumbnailUrl).toBeUndefined()
  })

  it('uploads the poster to a sibling -thumb.webp key when a thumbnail is supplied', async () => {
    const result = await uploadReferenceVideo({
      userId: 'user-1',
      fileBuffer: Buffer.from('clip'),
      mimeType: 'video/mp4',
      thumbnailBuffer: Buffer.from('poster'),
    })

    expect(mockUpload).toHaveBeenCalledTimes(2)
    const videoArgs = mockUpload.mock.calls[0]![0]
    const thumbArgs = mockUpload.mock.calls[1]![0]
    // The thumbnail key mirrors the clip's base key with a -thumb.webp suffix.
    expect(thumbArgs.key).toBe(videoArgs.key.replace(/\.mp4$/, '-thumb.webp'))
    expect(thumbArgs.mimeType).toBe('image/webp')
    expect(result.thumbnailUrl).toBe(`https://cdn.example.com/${thumbArgs.key}`)
  })

  it('skips the poster upload for an empty thumbnail buffer', async () => {
    const result = await uploadReferenceVideo({
      userId: 'user-1',
      fileBuffer: Buffer.from('clip'),
      mimeType: 'video/mp4',
      thumbnailBuffer: Buffer.alloc(0),
    })

    expect(mockUpload).toHaveBeenCalledTimes(1)
    expect(result.thumbnailUrl).toBeUndefined()
  })

  it('still returns the clip URL when the poster upload fails', async () => {
    mockUpload
      .mockResolvedValueOnce('https://cdn.example.com/clip.mp4')
      .mockRejectedValueOnce(new Error('R2 down'))

    const result = await uploadReferenceVideo({
      userId: 'user-1',
      fileBuffer: Buffer.from('clip'),
      mimeType: 'video/mp4',
      thumbnailBuffer: Buffer.from('poster'),
    })

    expect(result.url).toBe('https://cdn.example.com/clip.mp4')
    expect(result.thumbnailUrl).toBeUndefined()
  })
})
