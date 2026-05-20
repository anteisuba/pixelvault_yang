import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockFindMany = vi.fn()
const mockCreate = vi.fn()
const mockFindUnique = vi.fn()
const mockDelete = vi.fn()
const mockGenerationFindUnique = vi.fn()
vi.mock('@/lib/db', () => ({
  db: {
    extractedElement: {
      findMany: (...a: unknown[]) => mockFindMany(...a),
      create: (...a: unknown[]) => mockCreate(...a),
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      delete: (...a: unknown[]) => mockDelete(...a),
    },
    generation: {
      findUnique: (...a: unknown[]) => mockGenerationFindUnique(...a),
    },
  },
}))

// Storage / R2 — every function we call inside the service is stubbed to a
// deterministic value so we can assert pure behaviour without touching R2.
const mockFetchAsBuffer = vi.fn()
const mockUploadToR2 = vi.fn()
const mockCreateImagePreviewAssets = vi.fn()
const mockGenerateStorageKey = vi.fn()
const mockDeleteFromR2 = vi.fn()
vi.mock('@/services/storage/r2', () => ({
  fetchAsBuffer: (...a: unknown[]) => mockFetchAsBuffer(...a),
  uploadToR2: (...a: unknown[]) => mockUploadToR2(...a),
  createImagePreviewAssets: (...a: unknown[]) =>
    mockCreateImagePreviewAssets(...a),
  generateStorageKey: (...a: unknown[]) => mockGenerateStorageKey(...a),
  deleteFromR2: (...a: unknown[]) => mockDeleteFromR2(...a),
}))

import {
  createExtractedElement,
  deleteExtractedElement,
  listExtractedElementsForUser,
} from './extracted-element.service'

// 1x1 PNG so sharp.metadata() can resolve dimensions inside the service.
const TINY_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchAsBuffer.mockResolvedValue({
    buffer: TINY_PNG_BUFFER,
    mimeType: 'image/png',
  })
  mockGenerateStorageKey.mockReturnValue(
    'generations/user_1/image/2026-05-20_abc.png',
  )
  mockUploadToR2.mockResolvedValue('https://cdn.example.com/extracted.png')
  mockCreateImagePreviewAssets.mockResolvedValue({
    thumbnailUrl: 'https://cdn.example.com/thumb.webp',
    thumbnailStorageKey: 'generations/user_1/image/2026-05-20_abc_thumb.webp',
    previewUrl: 'https://cdn.example.com/preview.webp',
    previewStorageKey: 'generations/user_1/image/2026-05-20_abc_preview.webp',
  })
})

describe('createExtractedElement', () => {
  it('re-uploads the cutout to R2 and infers provider from the model id', async () => {
    mockCreate.mockResolvedValue({
      id: 'ext_1',
      userId: 'user_1',
      sourceGenerationId: null,
      sourceImageUrl: 'https://example.com/source.png',
      extractedUrl: 'https://cdn.example.com/extracted.png',
      extractedStorageKey: 'generations/user_1/image/2026-05-20_abc.png',
      thumbnailUrl: 'https://cdn.example.com/thumb.webp',
      thumbnailStorageKey: 'generations/user_1/image/2026-05-20_abc_thumb.webp',
      width: 1,
      height: 1,
      name: 'the red dress',
      prompt: 'the red dress',
      invert: false,
      provider: 'openai',
      modelId: 'gpt-image-2',
      createdAt: new Date('2026-05-20T06:00:00Z'),
    })

    const record = await createExtractedElement({
      userId: 'user_1',
      extractedImageUrl: 'data:image/png;base64,ZmFrZQ==',
      sourceImageUrl: 'https://example.com/source.png',
      prompt: 'the red dress',
      invert: false,
      modelId: 'gpt-image-2',
    })

    expect(mockUploadToR2).toHaveBeenCalledTimes(1)
    expect(mockCreateImagePreviewAssets).toHaveBeenCalledTimes(1)
    const createCall = mockCreate.mock.calls[0][0] as {
      data: Record<string, unknown>
    }
    expect(createCall.data.provider).toBe('openai')
    expect(createCall.data.modelId).toBe('gpt-image-2')
    expect(createCall.data.userId).toBe('user_1')
    expect(record.provider).toBe('openai')
    expect(record.id).toBe('ext_1')
    expect(record.createdAt).toBe('2026-05-20T06:00:00.000Z')
  })

  it('falls back to the prompt as the asset name when none is supplied', async () => {
    mockCreate.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'ext_2',
        userId: 'user_1',
        sourceGenerationId: null,
        sourceImageUrl: 'https://example.com/source.png',
        extractedUrl: 'https://cdn.example.com/extracted.png',
        extractedStorageKey: 'k',
        thumbnailUrl: null,
        thumbnailStorageKey: null,
        width: 1,
        height: 1,
        name: data.name,
        prompt: data.prompt,
        invert: data.invert,
        provider: data.provider,
        modelId: data.modelId,
        createdAt: new Date(),
      }),
    )

    const record = await createExtractedElement({
      userId: 'user_1',
      extractedImageUrl: 'data:image/png;base64,ZmFrZQ==',
      sourceImageUrl: 'https://example.com/source.png',
      prompt: 'the red dress',
      invert: false,
      modelId: 'gemini-3-pro-image-preview',
    })

    expect(record.name).toBe('the red dress')
    expect(record.provider).toBe('gemini')
  })

  it('infers fal provider for unknown model ID prefixes', async () => {
    mockCreate.mockResolvedValue({
      id: 'ext_3',
      userId: 'user_1',
      sourceGenerationId: null,
      sourceImageUrl: 'https://example.com/source.png',
      extractedUrl: 'https://cdn.example.com/extracted.png',
      extractedStorageKey: 'k',
      thumbnailUrl: null,
      thumbnailStorageKey: null,
      width: 1,
      height: 1,
      name: 'clothing',
      prompt: 'clothing',
      invert: false,
      provider: 'fal',
      modelId: 'fal-ai/sam-3/image',
      createdAt: new Date(),
    })

    await createExtractedElement({
      userId: 'user_1',
      extractedImageUrl: 'data:image/png;base64,ZmFrZQ==',
      sourceImageUrl: 'https://example.com/source.png',
      prompt: 'clothing',
      invert: false,
      modelId: 'fal-ai/sam-3/image',
    })

    const createCall = mockCreate.mock.calls[0][0] as {
      data: Record<string, unknown>
    }
    expect(createCall.data.provider).toBe('fal')
  })

  it('keeps sourceGenerationId when the caller owns the generation', async () => {
    mockGenerationFindUnique.mockResolvedValue({ userId: 'user_1' })
    mockCreate.mockResolvedValue({
      id: 'ext_owned',
      userId: 'user_1',
      sourceGenerationId: 'gen_42',
      sourceImageUrl: 'https://example.com/source.png',
      extractedUrl: 'https://cdn.example.com/extracted.png',
      extractedStorageKey: 'k',
      thumbnailUrl: null,
      thumbnailStorageKey: null,
      width: 1,
      height: 1,
      name: 'x',
      prompt: 'x',
      invert: false,
      provider: 'fal',
      modelId: 'fal-ai/sam-3/image',
      createdAt: new Date(),
    })

    await createExtractedElement({
      userId: 'user_1',
      extractedImageUrl: 'data:image/png;base64,ZmFrZQ==',
      sourceImageUrl: 'https://example.com/source.png',
      sourceGenerationId: 'gen_42',
      prompt: 'x',
      invert: false,
      modelId: 'fal-ai/sam-3/image',
    })

    expect(mockGenerationFindUnique).toHaveBeenCalledWith({
      where: { id: 'gen_42' },
      select: { userId: true },
    })
    const createCall = mockCreate.mock.calls[0][0] as {
      data: Record<string, unknown>
    }
    expect(createCall.data.sourceGenerationId).toBe('gen_42')
  })

  it('strips sourceGenerationId when the generation belongs to another user', async () => {
    // Defensive against a client POSTing someone else's generation ID to
    // forge a cross-user origin link on their cutout.
    mockGenerationFindUnique.mockResolvedValue({ userId: 'attacker' })
    mockCreate.mockResolvedValue({
      id: 'ext_stripped',
      userId: 'victim',
      sourceGenerationId: null,
      sourceImageUrl: 'https://example.com/source.png',
      extractedUrl: 'https://cdn.example.com/extracted.png',
      extractedStorageKey: 'k',
      thumbnailUrl: null,
      thumbnailStorageKey: null,
      width: 1,
      height: 1,
      name: 'x',
      prompt: 'x',
      invert: false,
      provider: 'fal',
      modelId: 'fal-ai/sam-3/image',
      createdAt: new Date(),
    })

    await createExtractedElement({
      userId: 'victim',
      extractedImageUrl: 'data:image/png;base64,ZmFrZQ==',
      sourceImageUrl: 'https://example.com/source.png',
      sourceGenerationId: 'gen_belonging_to_attacker',
      prompt: 'x',
      invert: false,
      modelId: 'fal-ai/sam-3/image',
    })

    const createCall = mockCreate.mock.calls[0][0] as {
      data: Record<string, unknown>
    }
    expect(createCall.data.sourceGenerationId).toBeNull()
  })

  it('strips sourceGenerationId when the generation does not exist', async () => {
    mockGenerationFindUnique.mockResolvedValue(null)
    mockCreate.mockResolvedValue({
      id: 'ext_missing',
      userId: 'user_1',
      sourceGenerationId: null,
      sourceImageUrl: 'https://example.com/source.png',
      extractedUrl: 'https://cdn.example.com/extracted.png',
      extractedStorageKey: 'k',
      thumbnailUrl: null,
      thumbnailStorageKey: null,
      width: 1,
      height: 1,
      name: 'x',
      prompt: 'x',
      invert: false,
      provider: 'fal',
      modelId: 'fal-ai/sam-3/image',
      createdAt: new Date(),
    })

    await createExtractedElement({
      userId: 'user_1',
      extractedImageUrl: 'data:image/png;base64,ZmFrZQ==',
      sourceImageUrl: 'https://example.com/source.png',
      sourceGenerationId: 'gen_does_not_exist',
      prompt: 'x',
      invert: false,
      modelId: 'fal-ai/sam-3/image',
    })

    const createCall = mockCreate.mock.calls[0][0] as {
      data: Record<string, unknown>
    }
    expect(createCall.data.sourceGenerationId).toBeNull()
  })
})

describe('listExtractedElementsForUser', () => {
  it('paginates via cursor and returns the next cursor when more rows exist', async () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({
      id: `ext_${i}`,
      userId: 'user_1',
      sourceGenerationId: null,
      sourceImageUrl: 'https://example.com/source.png',
      extractedUrl: `https://cdn.example.com/extracted_${i}.png`,
      extractedStorageKey: `k${i}`,
      thumbnailUrl: null,
      thumbnailStorageKey: null,
      width: 1,
      height: 1,
      name: `Cutout ${i}`,
      prompt: 'x',
      invert: false,
      provider: 'openai',
      modelId: 'gpt-image-2',
      createdAt: new Date(2026, 4, 20 - i),
    }))
    mockFindMany.mockResolvedValue(rows)

    const result = await listExtractedElementsForUser('user_1', { limit: 24 })

    expect(result.items).toHaveLength(24)
    expect(result.nextCursor).toBe(rows[23].createdAt.toISOString())
  })

  it('returns null nextCursor when the result fits in one page', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'ext_1',
        userId: 'user_1',
        sourceGenerationId: null,
        sourceImageUrl: 'https://example.com/source.png',
        extractedUrl: 'https://cdn.example.com/extracted.png',
        extractedStorageKey: 'k',
        thumbnailUrl: null,
        thumbnailStorageKey: null,
        width: 1,
        height: 1,
        name: 'Only',
        prompt: 'x',
        invert: false,
        provider: 'openai',
        modelId: 'gpt-image-2',
        createdAt: new Date('2026-05-20T06:00:00Z'),
      },
    ])

    const result = await listExtractedElementsForUser('user_1')

    expect(result.items).toHaveLength(1)
    expect(result.nextCursor).toBeNull()
  })
})

describe('deleteExtractedElement', () => {
  it('refuses to delete records belonging to a different user', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'ext_1',
      userId: 'someone_else',
      extractedStorageKey: 'k',
      thumbnailStorageKey: null,
    })

    const result = await deleteExtractedElement('user_1', 'ext_1')

    expect(result.deleted).toBe(false)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('deletes the row and schedules R2 cleanup for the owned record', async () => {
    mockFindUnique.mockResolvedValue({
      id: 'ext_1',
      userId: 'user_1',
      extractedStorageKey: 'k1',
      thumbnailStorageKey: 'k2',
    })
    mockDeleteFromR2.mockResolvedValue(undefined)

    const result = await deleteExtractedElement('user_1', 'ext_1')

    expect(result.deleted).toBe(true)
    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'ext_1' } })
  })

  it('returns deleted=false for a missing id without throwing', async () => {
    mockFindUnique.mockResolvedValue(null)
    const result = await deleteExtractedElement('user_1', 'ext_does_not_exist')
    expect(result.deleted).toBe(false)
  })
})
