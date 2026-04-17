/**
 * WP-Storage-01 · R2 wrapper unit tests
 *
 * 5 exports fully covered, no real R2 calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks (must precede imports) ───────────────────────────────

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }))

vi.mock('@aws-sdk/client-s3', () => {
  // Must use `function` keyword for `new` — arrow functions are not constructors
  function MockS3Client() {
    return { send: mockSend }
  }
  function MockPutObjectCommand(params: unknown) {
    return { _type: 'put', params }
  }
  function MockDeleteObjectCommand(params: unknown) {
    return { _type: 'delete', params }
  }
  return {
    S3Client: MockS3Client,
    PutObjectCommand: MockPutObjectCommand,
    DeleteObjectCommand: MockDeleteObjectCommand,
  }
})

vi.mock('@aws-sdk/lib-storage', () => {
  function MockUpload() {
    return { done: () => Promise.resolve() }
  }
  return { Upload: MockUpload }
})

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@/lib/with-retry', () => ({
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}))

// Stub env
vi.stubEnv('R2_ACCOUNT_ID', 'test-account')
vi.stubEnv('R2_ACCESS_KEY_ID', 'test-key')
vi.stubEnv('R2_SECRET_ACCESS_KEY', 'test-secret')
vi.stubEnv('R2_BUCKET_NAME', 'test-bucket')
vi.stubEnv('NEXT_PUBLIC_STORAGE_BASE_URL', 'https://cdn.test.com')

// ─── Now import (after mocks) ───────────────────────────────────

import {
  generateStorageKey,
  fetchAsBuffer,
  uploadToR2,
  streamUploadToR2,
  deleteFromR2,
} from './r2'

// ─── Tests ──────────────────────────────────────────────────────

describe('generateStorageKey', () => {
  it('generates image key with correct format', () => {
    const key = generateStorageKey('IMAGE', 'user-123')
    expect(key).toMatch(
      /^generations\/user-123\/image\/\d{4}-\d{2}-\d{2}_[a-f0-9]{24}\.png$/,
    )
  })

  it('generates video key with .mp4 extension', () => {
    const key = generateStorageKey('VIDEO', 'user-456')
    expect(key).toMatch(/\/video\/.*\.mp4$/)
  })

  it('generates audio key with default .mp3 extension', () => {
    const key = generateStorageKey('AUDIO', 'user-789')
    expect(key).toMatch(/\/audio\/.*\.mp3$/)
  })

  it('generates audio key with .wav extension', () => {
    const key = generateStorageKey('AUDIO', 'user-789', 'wav')
    expect(key).toMatch(/\/audio\/.*\.wav$/)
  })

  it('generates audio key with .opus extension', () => {
    const key = generateStorageKey('AUDIO', 'user-789', 'opus')
    expect(key).toMatch(/\/audio\/.*\.opus$/)
  })

  it('generates unique keys on successive calls', () => {
    const k1 = generateStorageKey('IMAGE', 'u')
    const k2 = generateStorageKey('IMAGE', 'u')
    expect(k1).not.toBe(k2)
  })
})

describe('fetchAsBuffer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('parses data: URLs into buffer + mimeType', async () => {
    const b64 = Buffer.from('hello').toString('base64')
    const result = await fetchAsBuffer(`data:image/jpeg;base64,${b64}`)

    expect(result.mimeType).toBe('image/jpeg')
    expect(result.buffer.toString()).toBe('hello')
  })

  it('fetches https URL and returns buffer', async () => {
    const mockBody = new Uint8Array([1, 2, 3])
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockBody.buffer),
      headers: new Headers({ 'content-type': 'image/webp' }),
    })

    const result = await fetchAsBuffer('https://example.com/img.webp')

    expect(result.mimeType).toBe('image/webp')
    expect(result.buffer.length).toBe(3)
  })

  it('defaults mimeType to image/png if header missing', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)),
      headers: new Headers(),
    })

    const result = await fetchAsBuffer('https://example.com/img')
    expect(result.mimeType).toBe('image/png')
  })

  it('throws on non-OK response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 })

    await expect(fetchAsBuffer('https://example.com/nope')).rejects.toThrow(
      'Failed to fetch image (404)',
    )
  })
})

describe('uploadToR2', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSend.mockResolvedValue({})
  })

  it('returns public URL on success', async () => {
    const url = await uploadToR2({
      data: Buffer.from('test'),
      key: 'test/key.png',
      mimeType: 'image/png',
    })

    expect(url).toBe('https://cdn.test.com/test/key.png')
    expect(mockSend).toHaveBeenCalledOnce()
  })
})

describe('streamUploadToR2', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns public URL and sizeBytes', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream(),
      headers: new Headers({ 'content-length': '12345' }),
    })

    const result = await streamUploadToR2({
      sourceUrl: 'https://example.com/video.mp4',
      key: 'test/video.mp4',
      mimeType: 'video/mp4',
    })

    expect(result.publicUrl).toBe('https://cdn.test.com/test/video.mp4')
    expect(result.sizeBytes).toBe(12345)
  })

  it('returns sizeBytes 0 if content-length missing', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream(),
      headers: new Headers(),
    })

    const result = await streamUploadToR2({
      sourceUrl: 'https://example.com/file',
      key: 'test/file.mp4',
      mimeType: 'video/mp4',
    })

    expect(result.sizeBytes).toBe(0)
  })

  it('throws when source fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 })

    await expect(
      streamUploadToR2({
        sourceUrl: 'https://example.com/nope',
        key: 'test/nope.mp4',
        mimeType: 'video/mp4',
      }),
    ).rejects.toThrow('Failed to fetch video for upload (403)')
  })
})

describe('deleteFromR2', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSend.mockResolvedValue({})
  })

  it('sends DeleteObjectCommand', async () => {
    await deleteFromR2('test/key.png')
    expect(mockSend).toHaveBeenCalledOnce()
  })
})
