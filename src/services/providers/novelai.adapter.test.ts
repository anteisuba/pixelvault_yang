import { afterEach, describe, it, expect, vi } from 'vitest'

import { AI_PROVIDER_ENDPOINTS } from '@/constants/config'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { novelAiAdapter } from './novelai.adapter'

afterEach(() => vi.unstubAllGlobals())

const BASE_INPUT = {
  prompt: 'masterpiece, best quality, 1girl, blue hair',
  modelId: 'nai-diffusion-4-full',
  aspectRatio: '1:1' as const,
  providerConfig: { label: 'NovelAI', baseUrl: AI_PROVIDER_ENDPOINTS.NOVELAI },
  apiKey: 'nai-test-key',
}

function createStoredZip(fileName: string, fileData: Uint8Array): ArrayBuffer {
  const fileNameBytes = new TextEncoder().encode(fileName)
  const header = Buffer.alloc(30)
  header.writeUInt32LE(0x04034b50, 0)
  header.writeUInt16LE(20, 4)
  header.writeUInt16LE(0, 6)
  header.writeUInt16LE(0, 8)
  header.writeUInt32LE(0, 10)
  header.writeUInt32LE(0, 14)
  header.writeUInt32LE(fileData.byteLength, 18)
  header.writeUInt32LE(fileData.byteLength, 22)
  header.writeUInt16LE(fileNameBytes.byteLength, 26)
  header.writeUInt16LE(0, 28)

  const bytes = Buffer.concat([
    header,
    Buffer.from(fileNameBytes),
    Buffer.from(fileData),
  ])
  const zip = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(zip).set(bytes)
  return zip
}

describe('novelAiAdapter.generateImage', () => {
  it('sends request to NovelAI endpoint and returns base64 image', async () => {
    const fakeImageBuffer = Buffer.from('fake-novel-ai-image')
    const fakeZip = createStoredZip(
      'image.png',
      Uint8Array.from(fakeImageBuffer),
    )

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(fakeZip, {
          status: 200,
          headers: { 'content-type': 'application/zip' },
        }),
      ),
    )

    const result = await novelAiAdapter.generateImage(BASE_INPUT)

    expect(result.imageUrl).toMatch(/^data:image\/png;base64,/)
  })

  it('throws on non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Rate limited', { status: 429 })),
    )

    await expect(novelAiAdapter.generateImage(BASE_INPUT)).rejects.toThrow()
  })

  it('sends V4.5 structured prompt with skip_cfg_above_sigma', async () => {
    const fakeZip = createStoredZip(
      'image.png',
      Uint8Array.from(Buffer.from('fake-novel-ai-image')),
    )
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(fakeZip, {
        status: 200,
        headers: { 'content-type': 'application/zip' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await novelAiAdapter.generateImage({
      ...BASE_INPUT,
      modelId: 'nai-diffusion-4-5-full',
      externalModelId: 'nai-diffusion-4-5-full',
    })

    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as { body: string }).body),
    ) as {
      model: string
      parameters: Record<string, unknown>
    }
    expect(body.model).toBe('nai-diffusion-4-5-full')
    expect(body.parameters.params_version).toBe(3)
    expect(body.parameters.scale).toBe(5)
    expect(body.parameters).toHaveProperty('skip_cfg_above_sigma')
    expect(body.parameters.v4_prompt).toBeDefined()
  })

  it('sends V5 structured prompt without skip_cfg_above_sigma', async () => {
    const fakeZip = createStoredZip(
      'image.png',
      Uint8Array.from(Buffer.from('fake-novel-ai-image')),
    )
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(fakeZip, {
        status: 200,
        headers: { 'content-type': 'application/zip' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await novelAiAdapter.generateImage({
      ...BASE_INPUT,
      modelId: 'nai-diffusion-5-full',
      externalModelId: 'nai-diffusion-5-full',
    })

    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as { body: string }).body),
    ) as {
      model: string
      parameters: Record<string, unknown>
    }
    expect(body.model).toBe('nai-diffusion-5-full')
    expect(body.parameters.params_version).toBe(4)
    expect(body.parameters.scale).toBe(7)
    expect(body.parameters.steps).toBe(23)
    expect(body.parameters.v4_prompt).toBeDefined()
    expect(body.parameters).not.toHaveProperty('skip_cfg_above_sigma')
  })
})
