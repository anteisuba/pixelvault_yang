import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { uploadToR2 } from '@/services/storage/r2'

import {
  REFERENCE_AUDIO_MAX_BYTES,
  uploadReferenceAudio,
  validateReferenceAudio,
} from './audio-reference.service'

vi.mock('@/services/storage/r2', () => ({
  uploadToR2: vi.fn(),
}))

describe('validateReferenceAudio', () => {
  it('rejects empty audio', () => {
    expect(validateReferenceAudio(Buffer.alloc(0), 'audio/mpeg')).toEqual({
      code: 'EMPTY_AUDIO',
      message: expect.any(String),
    })
  })

  it('rejects oversized audio', () => {
    const buffer = Buffer.alloc(REFERENCE_AUDIO_MAX_BYTES + 1)
    expect(validateReferenceAudio(buffer, 'audio/mpeg')).toEqual({
      code: 'AUDIO_TOO_LARGE',
      message: expect.stringContaining('25 MB'),
    })
  })

  it('rejects unsupported MIME types', () => {
    expect(validateReferenceAudio(Buffer.from('xx'), 'image/png')).toEqual({
      code: 'UNSUPPORTED_AUDIO_TYPE',
      message: expect.any(String),
    })
  })

  it('accepts mp3, wav, flac, m4a, webm, ogg', () => {
    for (const mime of [
      'audio/mpeg',
      'audio/wav',
      'audio/x-wav',
      'audio/flac',
      'audio/m4a',
      'audio/x-m4a',
      'audio/mp4',
      'audio/webm',
      'audio/ogg',
    ]) {
      expect(validateReferenceAudio(Buffer.from('ok'), mime)).toBeNull()
    }
  })
})

describe('uploadReferenceAudio', () => {
  const mockUpload = vi.mocked(uploadToR2)

  beforeEach(() => {
    mockUpload.mockResolvedValue(
      'https://cdn.example.com/audio-references/u1/file.mp3',
    )
  })

  afterEach(() => {
    mockUpload.mockReset()
  })

  it('writes to the audio-references prefix with a hashed key', async () => {
    const result = await uploadReferenceAudio({
      userId: 'user-1',
      fileBuffer: Buffer.from('payload'),
      mimeType: 'audio/mpeg',
    })

    expect(result.sizeBytes).toBe(Buffer.byteLength('payload'))
    expect(mockUpload).toHaveBeenCalledTimes(1)
    const args = mockUpload.mock.calls[0]![0]
    expect(args.key).toMatch(
      /^audio-references\/user-1\/\d{4}-\d{2}-\d{2}_[a-f0-9]{24}\.mp3$/,
    )
    expect(args.mimeType).toBe('audio/mpeg')
  })

  it('picks the right extension from the MIME type', async () => {
    await uploadReferenceAudio({
      userId: 'user-1',
      fileBuffer: Buffer.from('payload'),
      mimeType: 'audio/wav',
    })
    expect(mockUpload.mock.calls[0]![0].key).toMatch(/\.wav$/)

    mockUpload.mockClear()
    await uploadReferenceAudio({
      userId: 'user-1',
      fileBuffer: Buffer.from('payload'),
      mimeType: 'audio/flac',
    })
    expect(mockUpload.mock.calls[0]![0].key).toMatch(/\.flac$/)

    mockUpload.mockClear()
    await uploadReferenceAudio({
      userId: 'user-1',
      fileBuffer: Buffer.from('payload'),
      mimeType: 'audio/mp4',
    })
    expect(mockUpload.mock.calls[0]![0].key).toMatch(/\.m4a$/)
  })

  it('returns the public URL from R2', async () => {
    const result = await uploadReferenceAudio({
      userId: 'user-1',
      fileBuffer: Buffer.from('payload'),
      mimeType: 'audio/mpeg',
    })

    expect(result.url).toBe(
      'https://cdn.example.com/audio-references/u1/file.mp3',
    )
  })
})
