import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LORA_TRAINING_IMAGE_MAX_BYTES } from '@/constants/uploads'

const r2Mocks = vi.hoisted(() => ({
  createPresignedR2PutUrl: vi.fn(),
  deleteFromR2: vi.fn(),
  detectTrustedImageMime: vi.fn(),
  getR2ObjectBuffer: vi.fn(),
  getR2PublicUrl: vi.fn(),
  parseOwnedStorageKey: vi.fn(),
  uploadToR2: vi.fn(),
}))

vi.mock('@/services/storage/r2', () => r2Mocks)
vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn(async () => ({ id: 'user-1' })),
}))

import {
  completeTrainingImageDirectUpload,
  createTrainingImageDirectUpload,
  LoraTrainingError,
  mapLoraTrainingError,
} from './lora-training.service'

describe('LoraTrainingError', () => {
  it('serializes to a structured wire body via toJSON()', () => {
    const err = new LoraTrainingError(
      'NAMING_CONFLICT',
      'A LoRA named "X" already exists',
      'name',
    )
    const body = err.toJSON()
    expect(body).toMatchObject({
      success: false,
      code: 'NAMING_CONFLICT',
      fieldKey: 'name',
      messageKey: 'errorNamingConflict',
      errorCode: 'LORA_TRAINING_NAMING_CONFLICT',
    })
  })

  it('maps each code to a sensible HTTP status', () => {
    expect(new LoraTrainingError('IMAGE_TOO_LARGE', 'x').httpStatus).toBe(413)
    expect(new LoraTrainingError('NAMING_CONFLICT', 'x').httpStatus).toBe(409)
    expect(new LoraTrainingError('UPSTREAM_TIMEOUT', 'x').httpStatus).toBe(504)
    expect(new LoraTrainingError('RATE_LIMIT', 'x').httpStatus).toBe(429)
    expect(new LoraTrainingError('API_KEY_INVALID', 'x').httpStatus).toBe(401)
  })
})

describe('mapLoraTrainingError', () => {
  it('passes through LoraTrainingError instances unchanged', () => {
    const original = new LoraTrainingError(
      'INSUFFICIENT_CREDITS',
      'Need more credits',
    )
    const mapped = mapLoraTrainingError(original)
    expect(mapped.code).toBe('INSUFFICIENT_CREDITS')
    expect(mapped.messageKey).toBe('errorInsufficientCredits')
  })

  it('maps timeout substrings to UPSTREAM_TIMEOUT', () => {
    expect(
      mapLoraTrainingError(new Error('Civitai request timeout')).code,
    ).toBe('UPSTREAM_TIMEOUT')
    expect(mapLoraTrainingError(new Error('fetch timed out')).code).toBe(
      'UPSTREAM_TIMEOUT',
    )
  })

  it('maps 429 / rate-limit strings to RATE_LIMIT', () => {
    expect(mapLoraTrainingError(new Error('HTTP 429')).code).toBe('RATE_LIMIT')
    expect(mapLoraTrainingError(new Error('Rate Limit exceeded')).code).toBe(
      'RATE_LIMIT',
    )
    expect(mapLoraTrainingError(new Error('429 Too Many Requests')).code).toBe(
      'RATE_LIMIT',
    )
  })

  it('maps 401 / unauthorized strings to API_KEY_INVALID', () => {
    expect(mapLoraTrainingError(new Error('401 Unauthorized')).code).toBe(
      'API_KEY_INVALID',
    )
    expect(mapLoraTrainingError(new Error('Invalid API key')).code).toBe(
      'API_KEY_INVALID',
    )
  })

  it('maps quota strings to QUOTA_EXCEEDED', () => {
    expect(mapLoraTrainingError(new Error('quota exceeded')).code).toBe(
      'QUOTA_EXCEEDED',
    )
    expect(
      mapLoraTrainingError(new Error('insufficient balance on account')).code,
    ).toBe('QUOTA_EXCEEDED')
  })

  it('falls through to INTERNAL for unknown errors', () => {
    expect(mapLoraTrainingError(new Error('some random oops')).code).toBe(
      'INTERNAL',
    )
    expect(mapLoraTrainingError('string error').code).toBe('INTERNAL')
  })

  it('always returns a messageKey that exists for every code', () => {
    const codes = [
      'INSUFFICIENT_CREDITS',
      'IMAGE_TOO_LARGE',
      'BASE_MODEL_UNSUPPORTED',
      'NAMING_CONFLICT',
      'UPSTREAM_TIMEOUT',
      'RATE_LIMIT',
      'QUOTA_EXCEEDED',
      'API_KEY_INVALID',
      'INTERNAL',
    ] as const
    for (const code of codes) {
      const result = mapLoraTrainingError(new LoraTrainingError(code, 'msg'))
      expect(result.messageKey).toMatch(/^error/)
    }
  })
})

describe('training image direct upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    r2Mocks.createPresignedR2PutUrl.mockResolvedValue('https://r2/put?sig=1')
    r2Mocks.deleteFromR2.mockResolvedValue(undefined)
    r2Mocks.getR2PublicUrl.mockImplementation(
      (key: string) => `https://cdn.test.com/${key}`,
    )
  })

  it('presigns a PUT under the user-scoped training prefix', async () => {
    const prepare = await createTrainingImageDirectUpload('clerk-1', {
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
    })

    expect(prepare.uploadUrl).toBe('https://r2/put?sig=1')
    expect(prepare.storageKey).toMatch(
      /^lora-training\/user-1\/\d+-[0-9a-f]{12}\.jpg$/,
    )
    expect(prepare.headers).toEqual({
      'Content-Type': 'image/jpeg',
      'If-None-Match': '*',
    })
    expect(prepare.maxBytes).toBe(LORA_TRAINING_IMAGE_MAX_BYTES)
    expect(r2Mocks.createPresignedR2PutUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        key: prepare.storageKey,
        mimeType: 'image/jpeg',
      }),
    )
  })

  it('rejects an oversized pick with the localizable typed error', async () => {
    await expect(
      createTrainingImageDirectUpload('clerk-1', {
        mimeType: 'image/png',
        sizeBytes: LORA_TRAINING_IMAGE_MAX_BYTES + 1,
      }),
    ).rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE', httpStatus: 413 })
    expect(r2Mocks.createPresignedR2PutUrl).not.toHaveBeenCalled()
  })

  it('confirms an upload with the format derived from magic bytes', async () => {
    r2Mocks.getR2ObjectBuffer.mockResolvedValue({ buffer: Buffer.alloc(64) })
    r2Mocks.detectTrustedImageMime.mockResolvedValue({
      format: 'png',
      mimeType: 'image/png',
      width: 512,
      height: 768,
    })

    const uploaded = await completeTrainingImageDirectUpload('clerk-1', {
      storageKey: 'lora-training/user-1/1-abc.png',
      sizeBytes: 64,
    })

    expect(uploaded).toEqual({
      url: 'https://cdn.test.com/lora-training/user-1/1-abc.png',
      storageKey: 'lora-training/user-1/1-abc.png',
      mimeType: 'image/png',
      width: 512,
      height: 768,
      sizeBytes: 64,
    })
    expect(r2Mocks.deleteFromR2).not.toHaveBeenCalled()
  })

  it("rejects a storage key outside the caller's own prefix", async () => {
    await expect(
      completeTrainingImageDirectUpload('clerk-1', {
        storageKey: 'lora-training/user-2/1-abc.png',
        sizeBytes: 64,
      }),
    ).rejects.toMatchObject({ code: 'IMAGE_INVALID', httpStatus: 400 })
    expect(r2Mocks.getR2ObjectBuffer).not.toHaveBeenCalled()
  })

  it('deletes the object and fails when the real size disagrees', async () => {
    r2Mocks.getR2ObjectBuffer.mockResolvedValue({ buffer: Buffer.alloc(99) })

    await expect(
      completeTrainingImageDirectUpload('clerk-1', {
        storageKey: 'lora-training/user-1/1-abc.png',
        sizeBytes: 64,
      }),
    ).rejects.toMatchObject({ code: 'IMAGE_INVALID' })
    expect(r2Mocks.deleteFromR2).toHaveBeenCalledWith(
      'lora-training/user-1/1-abc.png',
    )
    expect(r2Mocks.detectTrustedImageMime).not.toHaveBeenCalled()
  })

  it('deletes the object and fails when the bytes are not a usable image', async () => {
    r2Mocks.getR2ObjectBuffer.mockResolvedValue({ buffer: Buffer.alloc(64) })
    r2Mocks.detectTrustedImageMime.mockRejectedValue(
      new Error('Unsupported or corrupted image file'),
    )

    await expect(
      completeTrainingImageDirectUpload('clerk-1', {
        storageKey: 'lora-training/user-1/1-abc.png',
        sizeBytes: 64,
      }),
    ).rejects.toMatchObject({
      code: 'IMAGE_INVALID',
      message: 'Unsupported or corrupted image file',
    })
    expect(r2Mocks.deleteFromR2).toHaveBeenCalled()
  })
})
