import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getSystemCivitaiToken } from '@/lib/platform-keys'
import { fetchCivitaiModelFileSha256s } from '@/services/civitai-lora.service'
import {
  createPresignedR2GetUrl,
  R2SourceChecksumMismatchError,
  r2ObjectExists,
  uploadBufferedHttpToR2,
} from '@/services/storage/r2'

import {
  RUNNER_LORA_MAX_BYTES,
  deriveRunnerLoraFilename,
  deriveRunnerHuggingFaceLoraFilename,
  ensureCivitaiLoraInR2,
  ensureHuggingFaceLoraInR2,
  extractCivitaiModelVersionId,
  parseHuggingFaceLoraReference,
  prepareRunnerLoras,
} from './civitai-lora-to-r2.service'

vi.mock('@/services/storage/r2', () => ({
  r2ObjectExists: vi.fn(),
  uploadBufferedHttpToR2: vi.fn(),
  createPresignedR2GetUrl: vi.fn(),
  R2SourceChecksumMismatchError: class extends Error {
    constructor(
      readonly key: string,
      readonly actualSha256: string,
    ) {
      super(`SHA-256 mismatch for ${key}: got ${actualSha256}`)
    }
  },
}))
vi.mock('@/services/civitai-lora.service', () => ({
  fetchCivitaiModelFileSha256s: vi.fn(),
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
const mockCivitaiSha = vi.mocked(fetchCivitaiModelFileSha256s)
const mockFetch = vi.fn<typeof fetch>()
const PUBLISHED_SHA = 'ab'.repeat(32)

const URL_3118200 = 'https://civitai.com/api/download/models/3118200'
const R2_KEY = 'runner-loras/civitai-3118200.safetensors'
const HF_URL =
  'https://huggingface.co/example/anima-style/resolve/abc123/styles/anima.safetensors'

describe('civitai-lora-to-r2.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockToken.mockReturnValue('civitai-token')
    mockCivitaiSha.mockResolvedValue(null)
    mockFetch.mockResolvedValue(new Response(null, { status: 302 }))
    vi.stubGlobal('fetch', mockFetch)
  })

  it('derives a deterministic filename + version id', () => {
    expect(deriveRunnerLoraFilename(3118200)).toBe(
      'civitai-3118200.safetensors',
    )
    expect(extractCivitaiModelVersionId(URL_3118200)).toBe(3118200)
    expect(extractCivitaiModelVersionId('https://example.com/x')).toBeNull()
    expect(parseHuggingFaceLoraReference(HF_URL)).toEqual({
      repoId: 'example/anima-style',
      revision: 'abc123',
      filename: 'styles/anima.safetensors',
    })
    expect(
      parseHuggingFaceLoraReference(
        'https://huggingface.co/example/anima-style',
      ),
    ).toBeNull()
    expect(
      deriveRunnerHuggingFaceLoraFilename({
        repoId: 'example/anima-style',
        revision: 'abc123',
        filename: 'styles/anima.safetensors',
      }),
    ).toMatch(/^hf-[a-f0-9]{16}-anima\.safetensors$/)
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
        maxBytes: RUNNER_LORA_MAX_BYTES,
      }),
    )
  })

  it('checks the download against the SHA-256 Civitai publishes for the version', async () => {
    mockExists.mockResolvedValue(false)
    mockCivitaiSha.mockResolvedValue([PUBLISHED_SHA])
    mockUpload.mockResolvedValue({
      publicUrl: 'x',
      mimeType: 'application/octet-stream',
      sizeBytes: 123,
    })

    await ensureCivitaiLoraInR2(URL_3118200)

    expect(mockCivitaiSha).toHaveBeenCalledWith(3118200)
    expect(mockUpload).toHaveBeenCalledWith(
      expect.objectContaining({ acceptedSha256s: [PUBLISHED_SHA] }),
    )
  })

  it('maps a published-checksum mismatch to CHECKSUM_MISMATCH without trying other tokens', async () => {
    mockExists.mockResolvedValue(false)
    mockCivitaiSha.mockResolvedValue([PUBLISHED_SHA])
    mockUpload.mockRejectedValue(
      new R2SourceChecksumMismatchError(R2_KEY, 'cd'.repeat(32)),
    )

    await expect(
      ensureCivitaiLoraInR2(URL_3118200, 'user-token'),
    ).rejects.toMatchObject({
      code: 'CHECKSUM_MISMATCH',
      message: expect.stringContaining('SHA-256 mismatch'),
    })
    expect(mockUpload).toHaveBeenCalledTimes(1)
  })

  it('falls back from an invalid user token to the platform token', async () => {
    mockExists.mockResolvedValue(false)
    mockUpload
      .mockRejectedValueOnce(
        new Error(
          `Failed to fetch file for buffered upload (401): ${URL_3118200}`,
        ),
      )
      .mockResolvedValueOnce({
        publicUrl: 'x',
        mimeType: 'application/octet-stream',
        sizeBytes: 123,
      })

    await ensureCivitaiLoraInR2(URL_3118200, 'user-civitai-token')

    expect(mockUpload).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        fetchHeaders: { Authorization: 'Bearer user-civitai-token' },
      }),
    )
    expect(mockUpload).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
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

  it('classifies exhausted Civitai authentication attempts as AUTH_REQUIRED', async () => {
    mockExists.mockResolvedValue(false)
    mockUpload.mockRejectedValue(
      new Error(
        `Failed to fetch file for buffered upload (401): ${URL_3118200}`,
      ),
    )

    await expect(
      ensureCivitaiLoraInR2(URL_3118200, 'expired-user-token'),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
  })

  it('maps oversized remote files to TOO_LARGE (base checkpoint mis-attached as LoRA)', async () => {
    mockExists.mockResolvedValue(false)
    mockUpload.mockRejectedValue(
      new Error(
        `Remote file exceeds maximum size of ${RUNNER_LORA_MAX_BYTES} bytes (declared 4182218328).`,
      ),
    )

    await expect(ensureHuggingFaceLoraInR2(HF_URL)).rejects.toMatchObject({
      code: 'TOO_LARGE',
      message: expect.stringContaining('512 MB'),
    })
  })

  it('caches a public Hugging Face LoRA without a provider token', async () => {
    mockExists.mockResolvedValue(false)
    mockUpload.mockResolvedValue({
      publicUrl: 'x',
      mimeType: 'application/octet-stream',
      sizeBytes: 123,
    })

    const result = await ensureHuggingFaceLoraInR2(HF_URL)

    expect(result.filename).toMatch(/^hf-[a-f0-9]{16}-anima\.safetensors$/)
    expect(result.r2Key).toBe(`runner-loras/${result.filename}`)
    expect(result.downloaded).toBe(true)
    expect(mockUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: HF_URL,
        key: result.r2Key,
        maxBytes: RUNNER_LORA_MAX_BYTES,
      }),
    )
    expect(mockUpload.mock.calls[0]?.[0]).not.toHaveProperty('fetchHeaders')
    expect(mockUpload.mock.calls[0]?.[0]?.acceptedSha256s).toBeUndefined()
  })

  it('checks a Hugging Face LoRA against the SHA-256 in x-linked-etag', async () => {
    mockExists.mockResolvedValue(false)
    mockFetch.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { 'x-linked-etag': `"${PUBLISHED_SHA.toUpperCase()}"` },
      }),
    )
    mockUpload.mockResolvedValue({
      publicUrl: 'x',
      mimeType: 'application/octet-stream',
      sizeBytes: 123,
    })

    await ensureHuggingFaceLoraInR2(HF_URL)

    expect(mockFetch).toHaveBeenCalledWith(
      HF_URL,
      expect.objectContaining({ method: 'HEAD', redirect: 'manual' }),
    )
    expect(mockUpload).toHaveBeenCalledWith(
      expect.objectContaining({ acceptedSha256s: [PUBLISHED_SHA] }),
    )
  })

  it('maps a Hugging Face checksum mismatch to CHECKSUM_MISMATCH', async () => {
    mockExists.mockResolvedValue(false)
    mockUpload.mockRejectedValue(
      new R2SourceChecksumMismatchError('runner-loras/hf', 'cd'.repeat(32)),
    )

    await expect(ensureHuggingFaceLoraInR2(HF_URL)).rejects.toMatchObject({
      code: 'CHECKSUM_MISMATCH',
    })
  })

  it('rejects Hugging Face repository pages and non-SafeTensors files', async () => {
    await expect(
      ensureHuggingFaceLoraInR2('https://huggingface.co/example/anima-style'),
    ).rejects.toMatchObject({ code: 'INVALID_LORA_URL' })
    await expect(
      ensureHuggingFaceLoraInR2(
        'https://huggingface.co/example/anima-style/resolve/main/adapter.bin',
      ),
    ).rejects.toMatchObject({ code: 'INVALID_LORA_URL' })
    expect(mockUpload).not.toHaveBeenCalled()
  })

  describe('prepareRunnerLoras', () => {
    it('ensures each LoRA in R2 and returns filename + presigned URL + scale, in order', async () => {
      mockExists.mockResolvedValue(true) // both cached
      mockPresign.mockImplementation(async ({ key }) => `https://r2/${key}?sig`)

      const specs = await prepareRunnerLoras([
        { url: 'https://civitai.com/api/download/models/111', scale: 0.9 },
        { url: HF_URL, scale: null },
      ])

      expect(specs).toHaveLength(2)
      expect(specs[0]).toEqual({
        filename: 'civitai-111.safetensors',
        downloadUrl: 'https://r2/runner-loras/civitai-111.safetensors?sig',
        scale: 0.9,
      })
      expect(specs[1]).toMatchObject({
        filename: expect.stringMatching(/^hf-[a-f0-9]{16}-anima\.safetensors$/),
        downloadUrl: expect.stringMatching(/^https:\/\/r2\/runner-loras\/hf-/),
        scale: 1,
      })
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
