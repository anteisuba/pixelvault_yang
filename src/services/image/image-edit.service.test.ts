import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GenerationValidationError, SafetyFilterError } from '@/lib/errors'
import { ProviderError } from '@/services/providers/types'

import {
  compileAnnotationPrompt,
  extractElement,
  inpaintImage,
  removeBackground,
  replaceObjects,
  streamImageEdit,
  submitIdeogramImageEdit,
  upscaleImage,
} from './image-edit.service'

function mockFetchJson(body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(body),
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('image-edit.service', () => {
  it('normalizes fal upscale responses through the schema', async () => {
    mockFetchJson({
      image: {
        url: 'https://cdn.example.com/upscaled.png',
        width: 2048,
        height: 2048,
      },
    })

    const result = await upscaleImage('https://example.com/source.png', 'key')

    expect(result).toEqual({
      imageUrl: 'https://cdn.example.com/upscaled.png',
      width: 2048,
      height: 2048,
    })
  })

  it('normalizes fal background-removal responses through the schema', async () => {
    mockFetchJson({
      image: {
        url: 'https://cdn.example.com/cutout.png',
        width: 1024,
        height: 768,
      },
    })

    const result = await removeBackground(
      'https://example.com/source.png',
      'key',
    )

    expect(result).toEqual({
      imageUrl: 'https://cdn.example.com/cutout.png',
      width: 1024,
      height: 768,
    })
  })

  it('rejects malformed provider responses instead of trusting a cast', async () => {
    mockFetchJson({ image: { url: 'not-a-url', width: 0, height: 768 } })

    await expect(
      upscaleImage('https://example.com/source.png', 'key'),
    ).rejects.toBeInstanceOf(ProviderError)
  })

  it('keeps provider HTTP failures classified as ProviderError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve('rate limited'),
      }),
    )

    await expect(
      removeBackground('https://example.com/source.png', 'key'),
    ).rejects.toBeInstanceOf(ProviderError)
  })

  it('inpaints images with the fal fill endpoint', async () => {
    mockFetchJson({
      images: [
        {
          url: 'https://cdn.example.com/inpainted.png',
          width: 1024,
          height: 1024,
        },
      ],
    })

    const result = await inpaintImage({
      userId: 'user-1',
      imageUrl: 'https://example.com/source.png',
      maskImageUrl: 'data:image/png;base64,mask',
      prompt: 'replace with flowers',
      negativePrompt: 'blur',
      apiKey: 'key',
    })

    expect(result).toEqual({
      imageUrl: 'https://cdn.example.com/inpainted.png',
      width: 1024,
      height: 1024,
    })
    expect(global.fetch).toHaveBeenCalledWith(
      'https://fal.run/fal-ai/flux-pro/v1/fill',
      expect.objectContaining({
        body: JSON.stringify({
          image_url: 'https://example.com/source.png',
          mask_url: 'data:image/png;base64,mask',
          prompt: 'replace with flowers',
          negative_prompt: 'blur',
        }),
      }),
    )
  })

  it('keeps inpaint provider failures classified as ProviderError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('bad mask'),
      }),
    )

    await expect(
      inpaintImage({
        userId: 'user-1',
        imageUrl: 'https://example.com/source.png',
        maskImageUrl: 'data:image/png;base64,mask',
        prompt: 'replace with flowers',
        apiKey: 'key',
      }),
    ).rejects.toBeInstanceOf(ProviderError)
  })

  // 1x1 transparent PNG. Tiny but a real decodable PNG so sharp can read
  // its metadata, which is what readBufferDimensions does at the end of the
  // Gemini path (and what we'd otherwise have to mock out).
  const TINY_PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

  // ⚠ 这段措辞不是随手写的，是 2026-08-19 三选一实测跑通的那一版（任务包
  // §7.11）：「一次全改」「其余不动」「输出不带任何标注」三句缺一不可 ——
  // 少了最后一句，模型有可能把编号画进成品，而「成品无标注痕」正是 owner
  // 07-10 那个验收场景的硬要求。
  describe('compileAnnotationPrompt', () => {
    it('keeps the three clauses the bake-off validated', () => {
      const prompt = compileAnnotationPrompt([
        { index: 1, instruction: 'change the jacket to red' },
      ])

      expect(prompt).toContain('in a single pass')
      expect(prompt).toContain('keep every other part of the image unchanged')
      expect(prompt).toContain('no annotations, numbers, boxes or markings')
    })

    it('numbers the list in ①②③ order regardless of input order', () => {
      const prompt = compileAnnotationPrompt([
        { index: 3, instruction: 'remove the necklace' },
        { index: 1, instruction: 'change the jacket to red' },
        { index: 2, instruction: 'bare feet' },
      ])
      const body = prompt.split('\n').filter((line) => /^\d\./.test(line))

      expect(body).toEqual([
        '1. change the jacket to red',
        '2. bare feet',
        '3. remove the necklace',
      ])
    })

    it('turns a box into a coarse bearing, never coordinates', () => {
      const prompt = compileAnnotationPrompt([
        {
          index: 1,
          instruction: 'change the jacket to red',
          area: { x: 0.05, y: 0.05, width: 0.2, height: 0.2 },
        },
        {
          index: 2,
          instruction: 'bare feet',
          area: { x: 0.7, y: 0.8, width: 0.2, height: 0.15 },
        },
      ])

      expect(prompt).toContain('1. (upper-left area) change the jacket to red')
      expect(prompt).toContain('2. (lower-right area) bare feet')
      // 框不是 mask，像素坐标不该出现在 prompt 里。
      expect(prompt).not.toMatch(/\d{3,}/)
    })
  })

  it('routes GPT extract requests to the OpenAI /edits endpoint with a transparent-output prompt', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ b64_json: TINY_PNG_BASE64 }] }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    const result = await extractElement({
      userId: 'user-1',
      imageUrl: `data:image/png;base64,${TINY_PNG_BASE64}`,
      prompt: 'the red dress',
      apiKey: 'sk-test',
      modelId: 'gpt-image-2',
    })

    expect(result.imageUrl.startsWith('data:image/png;base64,')).toBe(true)
    const [calledUrl, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(calledUrl).toContain('/edits')
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer sk-test',
    )
    // FormData body — verify the prompt the model receives carries the
    // transparent-background instruction (the whole point of routing here).
    const formData = init.body as FormData
    const prompt = formData.get('prompt') as string
    expect(prompt).toContain('the red dress')
    expect(prompt).toMatch(/transparent/i)
    expect(prompt).not.toMatch(/Remove only the/) // not the invert variant
  })

  it('flips the extract prompt when invert=true so the subject is removed instead', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ b64_json: TINY_PNG_BASE64 }] }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    await extractElement({
      userId: 'user-1',
      imageUrl: `data:image/png;base64,${TINY_PNG_BASE64}`,
      prompt: 'person',
      apiKey: 'sk-test',
      modelId: 'gpt-image-2',
      invert: true,
    })

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const formData = init.body as FormData
    const prompt = formData.get('prompt') as string
    // Inverse variant should describe keeping everything EXCEPT the subject —
    // exact phrasing is intentionally softer than "remove" to avoid tripping
    // OpenAI's image moderation. Just check the semantics, not the wording.
    expect(prompt).toMatch(
      /except the person|previously occupied by the person/i,
    )
    expect(prompt).toMatch(/transparent/i)
  })

  it('routes Gemini extract requests to generateContent with inlineData parts', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: 'image/png',
                      data: TINY_PNG_BASE64,
                    },
                  },
                ],
              },
            },
          ],
        }),
    })
    vi.stubGlobal('fetch', fetchSpy)

    const result = await extractElement({
      userId: 'user-1',
      imageUrl: `data:image/png;base64,${TINY_PNG_BASE64}`,
      prompt: 'hair',
      apiKey: 'gem-key',
      modelId: 'gemini-3-pro-image',
    })

    expect(result.imageUrl).toBe(`data:image/png;base64,${TINY_PNG_BASE64}`)
    const [calledUrl, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(calledUrl).toContain('gemini-3-pro-image:generateContent')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(
      'gem-key',
    )
    const body = JSON.parse((init.body as string) ?? '{}') as {
      contents: Array<{ parts: unknown[] }>
    }
    expect(body.contents[0].parts.length).toBeGreaterThanOrEqual(2)
  })

  it('translates an OpenAI safety refusal into a SafetyFilterError, not a generic 500', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              error: {
                code: 'moderation_blocked',
                message: 'Content was filtered by the safety system.',
              },
            }),
          ),
      }),
    )

    await expect(
      extractElement({
        userId: 'user-1',
        imageUrl: `data:image/png;base64,${TINY_PNG_BASE64}`,
        prompt: 'person',
        apiKey: 'sk-test',
        modelId: 'gpt-image-2',
      }),
    ).rejects.toBeInstanceOf(SafetyFilterError)
  })

  it('carries the OpenAI moderation stage into the SafetyFilterError i18n key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              error: {
                type: 'image_generation_user_error',
                code: 'moderation_blocked',
                message: 'Your request was rejected by the safety system.',
                moderation_details: {
                  moderation_stage: 'output',
                  categories: ['other'],
                },
              },
            }),
          ),
      }),
    )

    const error = await extractElement({
      userId: 'user-1',
      imageUrl: `data:image/png;base64,${TINY_PNG_BASE64}`,
      prompt: 'person',
      apiKey: 'sk-test',
      modelId: 'gpt-image-2',
    }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(SafetyFilterError)
    expect((error as SafetyFilterError).i18nKey).toBe(
      'errors.provider.moderationBlockedOutput',
    )
  })

  it('detects Gemini safety blocks even when the response is 200 OK with no image', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }],
          }),
      }),
    )

    await expect(
      extractElement({
        userId: 'user-1',
        imageUrl: `data:image/png;base64,${TINY_PNG_BASE64}`,
        prompt: 'person',
        apiKey: 'gem-key',
        modelId: 'gemini-3-pro-image',
      }),
    ).rejects.toBeInstanceOf(SafetyFilterError)
  })
})

describe('GPT Image 2.5 editing', () => {
  it.each(['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'])(
    'sends %s quality and alpha masks while preserving image shape',
    async (modelId) => {
      const source = await sharp({
        create: { width: 2, height: 1, channels: 3, background: 'red' },
      })
        .png()
        .toBuffer()
      const mask = await sharp(Buffer.from([0, 255]), {
        raw: { width: 2, height: 1, channels: 1 },
      })
        .png()
        .toBuffer()
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ b64_json: source.toString('base64') }],
        }),
      })
      vi.stubGlobal('fetch', fetchSpy)
      const result = await inpaintImage({
        userId: 'user-1',
        modelId,
        apiKey: 'test',
        imageUrl: `data:image/png;base64,${source.toString('base64')}`,
        maskImageUrl: `data:image/png;base64,${mask.toString('base64')}`,
        prompt: 'Change only the sky',
        options: { quality: 'max', background: 'transparent' },
      })
      const form = fetchSpy.mock.calls[0][1].body as FormData
      expect(form.get('model')).toBe(modelId)
      expect(form.get('quality')).toBe('max')
      expect(form.get('background')).toBe('transparent')
      expect(form.get('size')).toBe('auto')
      const maskFile = form.get('mask') as Blob
      const { data } = await sharp(Buffer.from(await maskFile.arrayBuffer()))
        .raw()
        .toBuffer({ resolveWithObject: true })
      expect(data[3]).toBe(255)
      expect(data[7]).toBe(0)
      expect(result).toMatchObject({ width: 2, height: 1 })
    },
  )
})

describe('GPT Image 2.6 complexity', () => {
  const editWith = async (modelId: string, complexity: string | null) => {
    const source = await sharp({
      create: { width: 2, height: 1, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer()
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ b64_json: source.toString('base64') }] }),
    })
    vi.stubGlobal('fetch', fetchSpy)
    const mask = await sharp(Buffer.from([0, 255]), {
      raw: { width: 2, height: 1, channels: 1 },
    })
      .png()
      .toBuffer()
    const run = inpaintImage({
      userId: 'user-1',
      modelId,
      apiKey: 'test',
      imageUrl: `data:image/png;base64,${source.toString('base64')}`,
      maskImageUrl: `data:image/png;base64,${mask.toString('base64')}`,
      prompt: 'Change only the sky',
      ...(complexity === null
        ? {}
        : { options: { complexity: complexity as 'low' } }),
    })
    return { run, fetchSpy }
  }

  it.each(['gpt-image-2.6-flare', 'gpt-image-2.6-sunburst'])(
    'sends complexity to %s',
    async (modelId) => {
      const { run, fetchSpy } = await editWith(modelId, 'low')
      await run
      const form = fetchSpy.mock.calls[0][1].body as FormData
      expect(form.get('model')).toBe(modelId)
      expect(form.get('complexity')).toBe('low')
    },
  )

  it('defaults edits to complexity low when the user picked nothing', async () => {
    const { run, fetchSpy } = await editWith('gpt-image-2.6-flare', null)
    await run
    const form = fetchSpy.mock.calls[0][1].body as FormData
    expect(form.get('complexity')).toBe('low')
  })

  it('keeps an explicit complexity over the edit default', async () => {
    const { run, fetchSpy } = await editWith('gpt-image-2.6-flare', 'high')
    await run
    const form = fetchSpy.mock.calls[0][1].body as FormData
    expect(form.get('complexity')).toBe('high')
  })

  it('never sends complexity to 2.5 by default', async () => {
    const { run, fetchSpy } = await editWith('gpt-image-2.5-flare', null)
    await run
    const form = fetchSpy.mock.calls[0][1].body as FormData
    expect(form.get('complexity')).toBeNull()
  })

  it('sends a hashed safety_identifier, never the raw user id', async () => {
    const { run, fetchSpy } = await editWith('gpt-image-2.6-flare', null)
    await run
    const form = fetchSpy.mock.calls[0][1].body as FormData
    const id = form.get('safety_identifier')
    expect(id).toMatch(/^[0-9a-f]{64}$/)
    expect(id).not.toContain('user-1')
  })

  it('omits safety_identifier for gpt-image-2', async () => {
    const { run, fetchSpy } = await editWith('gpt-image-2', null)
    await run
    const form = fetchSpy.mock.calls[0][1].body as FormData
    expect(form.get('safety_identifier')).toBeNull()
  })

  it('rejects complexity on 2.5 before calling OpenAI', async () => {
    const { run, fetchSpy } = await editWith('gpt-image-2.5-flare', 'low')
    // ProviderError 的 message 会被换成用户文案；这里锁住它**不是**格式错。
    const error = await run.catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(Error)
    expect(String((error as Error).message)).not.toMatch(/JPEG|PNG|WebP/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('object-replace markup（GPT Image 2.5 / 2.6）', () => {
  const boxed = [
    {
      index: 1,
      instruction: 'change the jacket to red',
      area: { x: 0.1, y: 0.2, width: 0.4, height: 0.5 },
    },
  ]
  const replaceWith = async (
    modelId: string,
    annotations: Parameters<typeof replaceObjects>[0]['annotations'],
  ) => {
    const source = await sharp({
      create: { width: 40, height: 20, channels: 3, background: 'red' },
    })
      .png()
      .toBuffer()
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ b64_json: source.toString('base64') }] }),
    })
    vi.stubGlobal('fetch', fetchSpy)
    await replaceObjects({
      userId: 'user-1',
      modelId,
      apiKey: 'test',
      imageUrl: `data:image/png;base64,${source.toString('base64')}`,
      annotations,
    })
    return fetchSpy.mock.calls[0][1].body as FormData
  }

  it.each(['gpt-image-2.6-flare', 'gpt-image-2.5-sunburst'])(
    '%s：附一张与原图同宽高的透明标注层，prompt 说明红框在标注层上',
    async (modelId) => {
      const form = await replaceWith(modelId, boxed)
      const markup = form.get('markup')
      expect(markup).toBeInstanceOf(Blob)
      const meta = await sharp(
        Buffer.from(await (markup as Blob).arrayBuffer()),
      ).metadata()
      expect(meta).toMatchObject({ width: 40, height: 20, hasAlpha: true })
      expect(form.get('mask')).toBeNull()
      const prompt = form.get('prompt') as string
      expect(prompt).toContain('markup layer')
      expect(prompt).toContain('1. (inside red box 1) change the jacket to red')
      expect(prompt).toContain('Remove the red boxes and numbers')
    },
  )

  it('gpt-image-2 不认 markup：照旧只发文字清单', async () => {
    const form = await replaceWith('gpt-image-2', boxed)
    expect(form.get('markup')).toBeNull()
    expect(form.get('prompt') as string).not.toContain('markup layer')
  })

  it('没有一个框带位置：不附标注层', async () => {
    const form = await replaceWith('gpt-image-2.6-flare', [
      { index: 1, instruction: 'make it night' },
    ])
    expect(form.get('markup')).toBeNull()
    expect(form.get('prompt') as string).not.toContain('markup layer')
  })
})

describe('object-replace on fal edit endpoints', () => {
  const annotations = [{ index: 1, instruction: 'change the jacket to red' }]

  it('sends Kontext Max the image as image_urls', async () => {
    mockFetchJson({
      images: [
        {
          url: 'https://cdn.example.com/kontext.png',
          width: 1024,
          height: 768,
        },
      ],
    })

    const result = await replaceObjects({
      userId: 'user-1',
      imageUrl: 'https://example.com/source.png',
      annotations,
      apiKey: 'key',
      modelId: 'fal-ai/flux-pro/kontext/max/multi',
    })

    expect(result).toEqual({
      imageUrl: 'https://cdn.example.com/kontext.png',
      width: 1024,
      height: 768,
    })
    const [url, init] = vi.mocked(global.fetch).mock.calls[0]
    expect(url).toBe('https://fal.run/fal-ai/flux-pro/kontext/max/multi')
    const body = JSON.parse(String(init?.body))
    expect(body.image_urls).toEqual(['https://example.com/source.png'])
    expect(body).not.toHaveProperty('image_url')
  })

  it('measures a FLUX.2 Pro Edit result that comes back without a size', async () => {
    const result = await sharp({
      create: { width: 3, height: 2, channels: 3, background: 'blue' },
    })
      .png()
      .toBuffer()
    mockFetchJson({
      images: [{ url: `data:image/png;base64,${result.toString('base64')}` }],
    })

    const edited = await replaceObjects({
      userId: 'user-1',
      imageUrl: 'https://example.com/source.png',
      annotations,
      apiKey: 'key',
      modelId: 'fal-ai/flux-2-pro/edit',
    })

    expect(edited).toMatchObject({ width: 3, height: 2 })
  })
})

describe('SVG inputs are rejected before any provider call', () => {
  const svgUrl = 'https://cdn.example.com/u/1/gen.svg'
  const message = "SVG images can't be used as input. Convert it to PNG first."
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  async function expectRejected(run: () => Promise<unknown>) {
    const error = await run().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(GenerationValidationError)
    expect(error).toMatchObject({ httpStatus: 400, message })
    expect(fetchMock).not.toHaveBeenCalled()
  }

  it('upscaleImage', () => expectRejected(() => upscaleImage(svgUrl, 'key')))

  it('removeBackground', () =>
    expectRejected(() => removeBackground(svgUrl, 'key')))

  it('inpaintImage', () =>
    expectRejected(() =>
      inpaintImage({
        userId: 'user-1',
        imageUrl: svgUrl,
        maskImageUrl: 'data:image/png;base64,mask',
        prompt: 'flowers',
        apiKey: 'key',
      }),
    ))

  it('replaceObjects', () =>
    expectRejected(() =>
      replaceObjects({
        userId: 'user-1',
        imageUrl: svgUrl,
        annotations: [{ index: 1, instruction: 'make it red' }],
        apiKey: 'key',
      }),
    ))

  it('extractElement', () =>
    expectRejected(() =>
      extractElement({
        userId: 'user-1',
        imageUrl: svgUrl,
        prompt: 'cat',
        apiKey: 'key',
      }),
    ))

  it('submitIdeogramImageEdit checks references too', () =>
    expectRejected(() =>
      submitIdeogramImageEdit('clerk-1', {
        imageUrl: 'https://cdn.example.com/u/1/source.png',
        referenceImages: ['data:image/svg+xml;base64,PHN2Zy8+'],
        maskImageUrl: 'data:image/png;base64,mask',
        prompt: 'flowers',
      }),
    ))

  it('streamImageEdit rejects before opening the stream', () =>
    expectRejected(() =>
      streamImageEdit(
        'clerk-1',
        {
          action: 'inpaint',
          imageUrl: svgUrl,
          maskImageUrl: 'data:image/png;base64,mask',
          prompt: 'flowers',
          modelId: 'gpt-image-2',
        },
        new AbortController().signal,
      ),
    ))
})

// GIF 动图模型只看一帧：前端弹「用首帧继续？」；没有前端拦截的入口（助手 @、画布、
// API 直调）在这里 400，文案与 SVG 分开（先取首帧，不是先转 PNG）。
describe('GIF inputs are rejected before any provider call', () => {
  const gifUrl = 'https://cdn.example.com/u/1/gen.gif'
  const message =
    "GIF images can't be used as input. Extract its first frame as a PNG to continue."
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  async function expectRejected(run: () => Promise<unknown>) {
    const error = await run().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(GenerationValidationError)
    expect(error).toMatchObject({ httpStatus: 400, message })
    expect(fetchMock).not.toHaveBeenCalled()
  }

  it('upscaleImage', () => expectRejected(() => upscaleImage(gifUrl, 'key')))

  it('removeBackground', () =>
    expectRejected(() => removeBackground(gifUrl, 'key')))

  it('inpaintImage', () =>
    expectRejected(() =>
      inpaintImage({
        userId: 'user-1',
        imageUrl: gifUrl,
        maskImageUrl: 'data:image/png;base64,mask',
        prompt: 'flowers',
        apiKey: 'key',
      }),
    ))

  it('replaceObjects', () =>
    expectRejected(() =>
      replaceObjects({
        userId: 'user-1',
        imageUrl: gifUrl,
        annotations: [{ index: 1, instruction: 'make it red' }],
        apiKey: 'key',
      }),
    ))

  it('extractElement', () =>
    expectRejected(() =>
      extractElement({
        userId: 'user-1',
        imageUrl: gifUrl,
        prompt: 'cat',
        apiKey: 'key',
      }),
    ))

  it('submitIdeogramImageEdit checks references too', () =>
    expectRejected(() =>
      submitIdeogramImageEdit('clerk-1', {
        imageUrl: 'https://cdn.example.com/u/1/source.png',
        referenceImages: ['data:image/gif;base64,R0lGODlhAQABAAAAACw='],
        maskImageUrl: 'data:image/png;base64,mask',
        prompt: 'flowers',
      }),
    ))

  it('streamImageEdit rejects before opening the stream', () =>
    expectRejected(() =>
      streamImageEdit(
        'clerk-1',
        {
          action: 'inpaint',
          imageUrl: gifUrl,
          maskImageUrl: 'data:image/png;base64,mask',
          prompt: 'flowers',
          modelId: 'gpt-image-2',
        },
        new AbortController().signal,
      ),
    ))

  it('SVG wins when both SVG and GIF are present (convert-to-PNG message)', async () => {
    const error = await submitIdeogramImageEdit('clerk-1', {
      imageUrl: gifUrl,
      referenceImages: ['https://cdn.example.com/u/1/gen.svg'],
      maskImageUrl: 'data:image/png;base64,mask',
      prompt: 'flowers',
    }).catch((caught: unknown) => caught)
    expect(error).toMatchObject({
      httpStatus: 400,
      message: "SVG images can't be used as input. Convert it to PNG first.",
    })
  })
})
