import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  USER_AUDIO_UPLOAD_MAX_BYTES,
  USER_UPLOAD_PROVIDER,
} from '@/constants/uploads'
import { FAKE_DB_USER, FAKE_GENERATION } from '@/test/api-helpers'

vi.mock('server-only', () => ({}))
vi.mock('@/services/user.service', () => ({ ensureUser: vi.fn() }))
vi.mock('@/services/generation.service', () => ({ createGeneration: vi.fn() }))
vi.mock('@/services/storage/r2', () => ({
  createPresignedR2PutUrl: vi.fn(),
  deleteFromR2: vi.fn(),
  generateStorageKey: vi.fn(
    () => 'generations/db_user_123/audio/2026-08-30_abc.mp3',
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
import {
  completeUserAudioDirectUpload,
  createUserAudioDirectUpload,
  detectTrustedAudioMime,
} from '@/services/upload-audio.service'
import { ensureUser } from '@/services/user.service'

const mockEnsureUser = vi.mocked(ensureUser)
const mockCreateGeneration = vi.mocked(createGeneration)
const mockCreatePresigned = vi.mocked(createPresignedR2PutUrl)
const mockGetR2ObjectMetadata = vi.mocked(getR2ObjectMetadata)
const mockGetR2ObjectRange = vi.mocked(getR2ObjectRange)
const mockDeleteFromR2 = vi.mocked(deleteFromR2)

function mp3Buffer(): Buffer {
  return Buffer.concat([
    Buffer.from('ID3', 'ascii'),
    Buffer.from([4, 0, 0, 0, 0, 0, 0]),
    Buffer.from('audio-bytes', 'ascii'),
  ])
}

describe('direct R2 user audio upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnsureUser.mockResolvedValue(FAKE_DB_USER)
    mockCreatePresigned.mockResolvedValue(
      'https://r2.example.com/audio?signature=ok',
    )
    mockCreateGeneration.mockResolvedValue(FAKE_GENERATION)
    mockDeleteFromR2.mockResolvedValue(undefined)
  })

  it('recognizes MP3, WAV, FLAC, OGG, M4A, and WebM signatures', () => {
    expect(detectTrustedAudioMime(mp3Buffer())).toBe('audio/mpeg')
    expect(
      detectTrustedAudioMime(
        Buffer.concat([
          Buffer.from('RIFF', 'ascii'),
          Buffer.alloc(4),
          Buffer.from('WAVE', 'ascii'),
        ]),
      ),
    ).toBe('audio/wav')
    expect(detectTrustedAudioMime(Buffer.from('fLaCaudio'))).toBe('audio/flac')
    expect(detectTrustedAudioMime(Buffer.from('OggSaudio'))).toBe('audio/ogg')
    expect(
      detectTrustedAudioMime(
        Buffer.concat([Buffer.alloc(4), Buffer.from('ftypM4A ', 'ascii')]),
      ),
    ).toBe('audio/mp4')
    expect(
      detectTrustedAudioMime(
        Buffer.concat([
          Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
          Buffer.from('webm', 'ascii'),
        ]),
      ),
    ).toBe('audio/webm')
  })

  it('prepares a content-type-bound browser-direct upload', async () => {
    const result = await createUserAudioDirectUpload('clerk-1', {
      fileName: 'track.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: 2048,
    })

    expect(mockCreatePresigned).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'generations/db_user_123/audio/2026-08-30_abc.mp3',
        mimeType: 'audio/mpeg',
      }),
    )
    expect(result).toMatchObject({
      uploadUrl: 'https://r2.example.com/audio?signature=ok',
      headers: { 'Content-Type': 'audio/mpeg', 'If-None-Match': '*' },
      maxBytes: USER_AUDIO_UPLOAD_MAX_BYTES,
    })
  })

  it('validates only metadata and signature bytes before creating an AUDIO generation', async () => {
    const buffer = mp3Buffer()
    const storedSizeBytes = 80 * 1024 * 1024
    mockGetR2ObjectMetadata.mockResolvedValue({
      sizeBytes: storedSizeBytes,
      mimeType: 'audio/mpeg',
    })
    mockGetR2ObjectRange.mockResolvedValue({
      buffer,
      mimeType: 'audio/mpeg',
    })

    await completeUserAudioDirectUpload('clerk-1', {
      storageKey: 'generations/db_user_123/audio/2026-08-30_abc.mp3',
      mimeType: 'audio/mpeg',
      sizeBytes: storedSizeBytes,
      duration: 120.5,
      projectId: 'project-1',
    })

    expect(mockCreateGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        outputType: 'AUDIO',
        mimeType: 'audio/mpeg',
        width: 0,
        height: 0,
        duration: 120.5,
        provider: USER_UPLOAD_PROVIDER,
        model: USER_UPLOAD_PROVIDER,
        userId: 'db_user_123',
        projectId: 'project-1',
      }),
    )
    expect(mockGetR2ObjectRange).toHaveBeenCalledWith({
      key: 'generations/db_user_123/audio/2026-08-30_abc.mp3',
      startByte: 0,
      endByteInclusive: 4095,
    })
  })

  it('cleans up bytes that do not match the claimed audio type', async () => {
    const buffer = Buffer.from('not an audio file')
    mockGetR2ObjectMetadata.mockResolvedValue({
      sizeBytes: buffer.byteLength,
      mimeType: 'audio/mpeg',
    })
    mockGetR2ObjectRange.mockResolvedValue({
      buffer,
      mimeType: 'audio/mpeg',
    })

    await expect(
      completeUserAudioDirectUpload('clerk-1', {
        storageKey: 'generations/db_user_123/audio/2026-08-30_abc.mp3',
        mimeType: 'audio/mpeg',
        sizeBytes: buffer.byteLength,
      }),
    ).rejects.toMatchObject({ status: 400 })

    expect(mockDeleteFromR2).toHaveBeenCalledWith(
      'generations/db_user_123/audio/2026-08-30_abc.mp3',
    )
    expect(mockCreateGeneration).not.toHaveBeenCalled()
  })
})
