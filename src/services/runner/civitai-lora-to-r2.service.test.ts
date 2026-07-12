import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getSystemCivitaiToken } from '@/lib/platform-keys'
import {
  createPresignedR2GetUrl,
  r2ObjectExists,
  uploadBufferedHttpToR2,
} from '@/services/storage/r2'

import {
  deriveRunnerLoraFilename,
  ensureCivitaiLoraInR2,
  extractCivitaiModelVersionId,
  prepareRunnerLoras,
} from './civitai-lora-to-r2.service'

vi.mock('@/services/storage/r2', () => ({
  r2ObjectExists: vi.fn(),
  uploadBufferedHttpToR2: vi.fn(),
  createPresignedR2GetUrl: vi.fn(),
}))
vi.mock('@/lib/platform-keys', () => ({
  getSystemCivitaiToken: vi.fn(),
}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

const mockExists = vi.mocked(r2ObjectExists)
const mockUpload = vi.mocked(uploadBufferedHttpToR2)
const mockToken = vi.mocked(getSystemCivitaiToken)
const mockPresign = vi.mocked(createPresignedR2GetUrl)

const URL_3118200 = 'https://civitai.com/api/download/models/3118200'
const R2_KEY = 'runner-loras/civitai-3118200.safetensors'

describe('civitai-lora-to-r2.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockToken.mockReturnValue('civitai-token')
  })

  it('derives a deterministic filename + version id', () => {
    expect(deriveRunnerLoraFilename(3118200)).toBe(
      'civitai-3118200.safetensors',
    )
    expect(extractCivitaiModelVersionId(URL_3118200)).toBe(3118200)
    expect(extractCivitaiModelVersionId('https://example.com/x')).toBeNull()
  })

  it('throws INVALID_LORA_URL for a non-Civitai-download URL', async () => {
    await expect(
      ensureCivitaiLoraInR2('https://example.com/x'),
    ).rejects.toMatchObject({ code: 'INVALID_LORA_URL' })
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('skips the download when the LoRA is already in R2 (dedup)', async () => {
    mockExists.mockResolvedValue(true)

    const result = await ensureCivitaiLoraInR2(URL_3118200)

    expect(result).toEqual({
      filename: 'civitai-3118200.safetensors',
      r2Key: R2_KEY,
      downloaded: false,
    })
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('downloads Civitai→R2 with the platform token when not cached', async () => {
    mockExists.mockResolvedValue(false)
    mockUpload.mockResolvedValue({
      publicUrl: 'x',
      mimeType: 'application/octet-stream',
      sizeBytes: 123,
    })

    const result = await ensureCivitaiLoraInR2(URL_3118200)

    expect(result).toEqual({
      filename: 'civitai-3118200.safetensors',
      r2Key: R2_KEY,
      downloaded: true,
    })
    expect(mockUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: URL_3118200,
        key: R2_KEY,
        fetchHeaders: { Authorization: 'Bearer civitai-token' },
      }),
    )
  })

  it('omits the auth header when no platform token is configured', async () => {
    mockExists.mockResolvedValue(false)
    mockToken.mockReturnValue(null)
    mockUpload.mockResolvedValue({
      publicUrl: 'x',
      mimeType: 'application/octet-stream',
      sizeBytes: 1,
    })

    await ensureCivitaiLoraInR2(URL_3118200)

    expect(mockUpload).toHaveBeenCalledWith(
      expect.objectContaining({ fetchHeaders: undefined }),
    )
  })

  it('wraps a download failure as DOWNLOAD_FAILED', async () => {
    mockExists.mockResolvedValue(false)
    mockUpload.mockRejectedValue(new Error('boom'))

    await expect(ensureCivitaiLoraInR2(URL_3118200)).rejects.toMatchObject({
      code: 'DOWNLOAD_FAILED',
    })
  })

  describe('prepareRunnerLoras', () => {
    it('ensures each LoRA in R2 and returns filename + presigned URL + scale, in order', async () => {
      mockExists.mockResolvedValue(true) // both cached
      mockPresign.mockImplementation(async ({ key }) => `https://r2/${key}?sig`)

      const specs = await prepareRunnerLoras([
        { url: 'https://civitai.com/api/download/models/111', scale: 0.9 },
        { url: 'https://civitai.com/api/download/models/222', scale: null },
      ])

      expect(specs).toEqual([
        {
          filename: 'civitai-111.safetensors',
          downloadUrl: 'https://r2/runner-loras/civitai-111.safetensors?sig',
          scale: 0.9,
        },
        {
          filename: 'civitai-222.safetensors',
          downloadUrl: 'https://r2/runner-loras/civitai-222.safetensors?sig',
          scale: 1,
        },
      ])
    })

    it('propagates a per-LoRA failure', async () => {
      mockExists.mockResolvedValue(false)
      mockUpload.mockRejectedValue(new Error('boom'))

      await expect(
        prepareRunnerLoras([{ url: URL_3118200, scale: 1 }]),
      ).rejects.toMatchObject({ code: 'DOWNLOAD_FAILED' })
    })
  })
})
