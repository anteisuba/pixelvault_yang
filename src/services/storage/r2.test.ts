/**
 * WP-Storage-01 · R2 wrapper unit tests
 *
 * 5 exports fully covered, no real R2 calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import sharp from 'sharp'

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
  createImagePreviewAssets,
  createVideoPosterAsset,
  fetchAsBuffer,
  uploadToR2,
  streamUploadToR2,
  uploadBufferedHttpToR2,
  deleteFromR2,
  isOwnedStorageUrl,
  uploadFromHttpToR2,
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

  it('enforces maxBytes for data: URLs', async () => {
    const b64 = Buffer.from('hello').toString('base64')

    await expect(
      fetchAsBuffer(`data:image/jpeg;base64,${b64}`, { maxBytes: 4 }),
    ).rejects.toThrow('Image exceeds maximum size of 4 bytes')
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

  it('allows plain http URLs while still using URL guard checks', async () => {
    const mockBody = new Uint8Array([1])
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockBody.buffer),
      headers: new Headers({ 'content-type': 'image/png' }),
    })

    const result = await fetchAsBuffer('http://example.com/img.png')

    expect(result.mimeType).toBe('image/png')
    expect(result.buffer.length).toBe(1)
  })

  it('enforces maxBytes from content-length before downloading', async () => {
    const arrayBuffer = vi.fn()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer,
      headers: new Headers({
        'content-type': 'image/webp',
        'content-length': '5',
      }),
    })

    await expect(
      fetchAsBuffer('https://example.com/img.webp', { maxBytes: 4 }),
    ).rejects.toThrow('Image exceeds maximum size of 4 bytes')
    expect(arrayBuffer).not.toHaveBeenCalled()
  })

  it('enforces maxBytes against the actual downloaded size', async () => {
    const mockBody = new Uint8Array([1, 2, 3, 4, 5])
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(mockBody.buffer),
      headers: new Headers({ 'content-type': 'image/webp' }),
    })

    await expect(
      fetchAsBuffer('https://example.com/img.webp', { maxBytes: 4 }),
    ).rejects.toThrow('Image exceeds maximum size of 4 bytes')
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

describe('createImagePreviewAssets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSend.mockResolvedValue({})
  })

  it('uploads WebP thumbnail and preview derivatives next to the source key', async () => {
    const sourceBuffer = await sharp({
      create: {
        width: 32,
        height: 24,
        channels: 3,
        background: '#ff0000',
      },
    })
      .png()
      .toBuffer()

    const result = await createImagePreviewAssets({
      sourceBuffer,
      sourceStorageKey: 'generations/user-1/image/source.png',
    })

    expect(result).toEqual({
      thumbnailUrl:
        'https://cdn.test.com/generations/user-1/image/source.thumbnail.webp',
      thumbnailStorageKey: 'generations/user-1/image/source.thumbnail.webp',
      previewUrl:
        'https://cdn.test.com/generations/user-1/image/source.preview.webp',
      previewStorageKey: 'generations/user-1/image/source.preview.webp',
    })
    expect(mockSend).toHaveBeenCalledTimes(2)
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          Key: 'generations/user-1/image/source.thumbnail.webp',
          ContentType: 'image/webp',
        }),
      }),
    )
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          Key: 'generations/user-1/image/source.preview.webp',
          ContentType: 'image/webp',
        }),
      }),
    )
  })
})

describe('createVideoPosterAsset', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSend.mockResolvedValue({})
  })

  it('uploads a WebP video poster next to the source video key', async () => {
    const sourceBuffer = await sharp({
      create: {
        width: 64,
        height: 36,
        channels: 3,
        background: '#3366ff',
      },
    })
      .jpeg()
      .toBuffer()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () =>
        Promise.resolve(
          sourceBuffer.buffer.slice(
            sourceBuffer.byteOffset,
            sourceBuffer.byteOffset + sourceBuffer.byteLength,
          ),
        ),
      headers: new Headers({
        'content-type': 'image/jpeg',
        'content-length': String(sourceBuffer.byteLength),
      }),
    })

    const result = await createVideoPosterAsset({
      sourceUrl: 'https://provider.example.com/thumb.jpg',
      sourceStorageKey: 'generations/user-1/video/source.mp4',
      fetchHeaders: { Authorization: 'Bearer token' },
    })

    expect(result).toEqual({
      thumbnailUrl:
        'https://cdn.test.com/generations/user-1/video/source.thumbnail.webp',
      thumbnailStorageKey: 'generations/user-1/video/source.thumbnail.webp',
    })
    expect(global.fetch).toHaveBeenCalledWith(
      'https://provider.example.com/thumb.jpg',
      {
        headers: { Authorization: 'Bearer token' },
        redirect: 'manual',
      },
    )
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          Key: 'generations/user-1/video/source.thumbnail.webp',
          ContentType: 'image/webp',
        }),
      }),
    )
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

describe('uploadBufferedHttpToR2', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSend.mockResolvedValue({})
  })

  it('buffers a remote file before uploading it to R2', async () => {
    const body = new Uint8Array([1, 2, 3, 4])
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(body.buffer),
      headers: new Headers({ 'content-type': 'model/gltf-binary' }),
    })

    const result = await uploadBufferedHttpToR2({
      sourceUrl: 'https://example.com/model.glb',
      key: 'test/model.glb',
    })

    expect(result.publicUrl).toBe('https://cdn.test.com/test/model.glb')
    expect(result.mimeType).toBe('model/gltf-binary')
    expect(result.sizeBytes).toBe(4)
    expect(mockSend).toHaveBeenCalledOnce()
  })

  it('prefers explicit mimeType when provided', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new Uint8Array([1]).buffer),
      headers: new Headers({ 'content-type': 'application/octet-stream' }),
    })

    const result = await uploadBufferedHttpToR2({
      sourceUrl: 'https://example.com/model.glb',
      key: 'test/model.glb',
      mimeType: 'model/gltf-binary',
    })

    expect(result.mimeType).toBe('model/gltf-binary')
  })

  it('throws when source fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 })

    await expect(
      uploadBufferedHttpToR2({
        sourceUrl: 'https://example.com/nope.glb',
        key: 'test/nope.glb',
      }),
    ).rejects.toThrow('Failed to fetch file for buffered upload (403)')
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

describe('isOwnedStorageUrl', () => {
  it('returns true for the configured storage base URL host', () => {
    expect(isOwnedStorageUrl('https://cdn.test.com/foo/bar.png')).toBe(true)
  })

  it('returns true for the legacy r2.dev public domain', () => {
    expect(
      isOwnedStorageUrl(
        'https://pub-5346558f8dc549f9ba5217489fe5395e.r2.dev/x.png',
      ),
    ).toBe(true)
  })

  it('returns false for external hosts', () => {
    expect(isOwnedStorageUrl('https://fal.media/files/abc.png')).toBe(false)
    expect(isOwnedStorageUrl('https://replicate.delivery/x.png')).toBe(false)
  })

  it('returns false for data: URLs and malformed input', () => {
    expect(isOwnedStorageUrl('data:image/png;base64,AAAA')).toBe(false)
    expect(isOwnedStorageUrl('not a url')).toBe(false)
    expect(isOwnedStorageUrl('')).toBe(false)
  })
})

describe('uploadFromHttpToR2', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches the source and pipes the body into the multipart upload', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('payload', {
        status: 200,
        headers: { 'content-type': 'image/webp' },
      }),
    )

    const result = await uploadFromHttpToR2({
      sourceUrl: 'https://fal.media/files/img.webp',
      key: 'generations/u1/image/x.png',
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://fal.media/files/img.webp',
      expect.any(Object),
    )
    expect(result).toEqual({
      publicUrl: 'https://cdn.test.com/generations/u1/image/x.png',
      mimeType: 'image/webp',
    })
    fetchSpy.mockRestore()
  })

  it('falls back to image/png when the response omits content-type', async () => {
    // `new Response()` always sets content-type by default. Construct a
    // mock response with an empty Headers map to simulate an upstream that
    // strips the header.
    const headersWithout = new Headers()
    headersWithout.delete('content-type')
    const mockResponse = {
      ok: true,
      status: 200,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('payload'))
          controller.close()
        },
      }),
      headers: headersWithout,
    } as unknown as Response

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse)

    const result = await uploadFromHttpToR2({
      sourceUrl: 'https://fal.media/files/img.bin',
      key: 'k.png',
    })

    expect(result.mimeType).toBe('image/png')
    fetchSpy.mockRestore()
  })

  it('throws when the upstream fetch is not OK', async () => {
    const fetchSpy = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('nope', { status: 404 }))

    await expect(
      uploadFromHttpToR2({
        sourceUrl: 'https://fal.media/missing.png',
        key: 'k.png',
      }),
    ).rejects.toThrow(/404/)
    fetchSpy.mockRestore()
  })

  it('rejects private http URLs via the url-guard', async () => {
    await expect(
      uploadFromHttpToR2({
        sourceUrl: 'http://127.0.0.1/secret.png',
        key: 'k.png',
      }),
    ).rejects.toThrow(/Blocked private IPv4/)
  })
})
