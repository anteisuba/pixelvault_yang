import { deflateRawSync } from 'node:zlib'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { generateNovelAiImage } from './image'

afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * NovelAI 出图驱动（`novelAiImageDriver`，步骤 `generate-novelai-image`）的真实现。
 * 断言请求字段对齐网页端、ZIP 拆图、种子回传、参考图 / 遮罩 / 角色布局的分支。
 */
describe('generateNovelAiImage', () => {
  const NOVELAI_V5_FULL = 'nai-diffusion-5-full'
  const NOVELAI_V45_FULL = 'nai-diffusion-4-5-full'

  /**
   * Builds a real ZIP archive (local header + central directory + EOCD),
   * optionally in NovelAI's actual shape: general-purpose bit 3 set and the
   * local header's sizes zeroed, with the true sizes only recoverable from
   * the central directory and a trailing data descriptor after the file
   * data. `extractNovelAiZipImage` must read sizes from the central
   * directory to handle this — see the fix note on that function.
   */
  function buildZip({
    fileName,
    fileData,
    compressedData,
    compressionMethod,
    streamedSizes,
  }: {
    fileName: string
    fileData: Uint8Array
    compressedData: Uint8Array
    compressionMethod: number
    streamedSizes: boolean
  }): ArrayBuffer {
    const fileNameBytes = new TextEncoder().encode(fileName)
    const generalPurposeFlag = streamedSizes ? 0x08 : 0

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(generalPurposeFlag, 6)
    localHeader.writeUInt16LE(compressionMethod, 8)
    localHeader.writeUInt32LE(0, 10)
    localHeader.writeUInt32LE(0, 14)
    localHeader.writeUInt32LE(streamedSizes ? 0 : compressedData.byteLength, 18)
    localHeader.writeUInt32LE(streamedSizes ? 0 : fileData.byteLength, 22)
    localHeader.writeUInt16LE(fileNameBytes.byteLength, 26)
    localHeader.writeUInt16LE(0, 28)

    const localSection = Buffer.concat([
      localHeader,
      Buffer.from(fileNameBytes),
      Buffer.from(compressedData),
    ])

    // Real NovelAI zips append a data descriptor after streamed entries —
    // included here so the extractor is proven not to depend on scanning
    // past it (the bug this replaces used to swallow these bytes).
    const dataDescriptor = Buffer.alloc(streamedSizes ? 12 : 0)
    if (streamedSizes) {
      dataDescriptor.writeUInt32LE(0, 0)
      dataDescriptor.writeUInt32LE(compressedData.byteLength, 4)
      dataDescriptor.writeUInt32LE(fileData.byteLength, 8)
    }

    const centralDirOffset = localSection.byteLength + dataDescriptor.byteLength

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(generalPurposeFlag, 8)
    centralHeader.writeUInt16LE(compressionMethod, 10)
    centralHeader.writeUInt32LE(0, 12)
    centralHeader.writeUInt32LE(0, 16)
    centralHeader.writeUInt32LE(compressedData.byteLength, 20)
    centralHeader.writeUInt32LE(fileData.byteLength, 24)
    centralHeader.writeUInt16LE(fileNameBytes.byteLength, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(0, 42)

    const centralSection = Buffer.concat([
      centralHeader,
      Buffer.from(fileNameBytes),
    ])

    const eocd = Buffer.alloc(22)
    eocd.writeUInt32LE(0x06054b50, 0)
    eocd.writeUInt16LE(0, 4)
    eocd.writeUInt16LE(0, 6)
    eocd.writeUInt16LE(1, 8)
    eocd.writeUInt16LE(1, 10)
    eocd.writeUInt32LE(centralSection.byteLength, 12)
    eocd.writeUInt32LE(centralDirOffset, 16)
    eocd.writeUInt16LE(0, 20)

    const bytes = Buffer.concat([
      localSection,
      dataDescriptor,
      centralSection,
      eocd,
    ])
    const zip = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(zip).set(bytes)
    return zip
  }

  function createStoredZip(
    fileName: string,
    fileData: Uint8Array,
  ): ArrayBuffer {
    return buildZip({
      fileName,
      fileData,
      compressedData: fileData,
      compressionMethod: 0,
      streamedSizes: false,
    })
  }

  function stubNovelAiZipResponse() {
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
    return fetchMock
  }

  function makeEnv() {
    return {
      GENERATION_BUCKET: { put: vi.fn().mockResolvedValue(undefined) },
      R2_PUBLIC_URL: 'https://cdn.example.com',
    } as unknown as Parameters<typeof generateNovelAiImage>[0]
  }

  function makeContext(externalModelId: string, referenceImages?: string[]) {
    return {
      runId: 'run-novelai-1',
      workflowId: 'IMAGE_QUEUE',
      outputType: 'IMAGE',
      providerId: 'novelai',
      callbackUrl: 'https://cb.example.com',
      resolveKeyUrl: 'https://resolve.example.com',
      timeoutMs: 60000,
      maxAttempts: 5,
      pollIntervalMs: 2000,
      providerInput: {
        prompt: 'masterpiece, best quality, 1girl, blue hair',
        modelId: externalModelId,
        externalModelId,
        aspectRatio: '1:1',
        referenceImages,
      },
    } as unknown as Parameters<typeof generateNovelAiImage>[1]
  }

  it('classifies a 402 (out of Anlas) as insufficient balance, not unknown', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            statusCode: 402,
            message:
              'Not enough Anlas and out of trial image generations. Required: 20, Available: 7',
          }),
          { status: 402, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )
    await expect(
      generateNovelAiImage(
        makeEnv(),
        makeContext(NOVELAI_V5_FULL),
        'nai-test-key',
      ),
    ).rejects.toMatchObject({
      errorCode: 'provider_insufficient_balance',
      message: expect.stringContaining('Required: 20, Available: 7'),
      providerMetadata: expect.objectContaining({ httpStatus: 402 }),
    })
  })

  it('routes precise character reference as generation without img2img fields', async () => {
    const fetchMock = stubNovelAiZipResponse()
    const context = makeContext(NOVELAI_V45_FULL, [
      'https://example.com/ref.png',
    ])
    fetchMock.mockResolvedValueOnce(
      new Response(Uint8Array.from([137, 80, 78, 71])),
    )
    context.providerInput.advancedParams = {
      novelAiReferenceMode: 'precise',
      preciseReferenceStrength: 0.8,
      preciseReferenceFidelity: 0.4,
      referenceStrength: 0.9,
      img2imgNoise: 0.6,
      cfgRescale: 0.2,
    }
    await generateNovelAiImage(makeEnv(), context, 'nai-test-key')
    const body = JSON.parse(String(fetchMock.mock.calls[1][1].body))
    expect(body.action).toBe('generate')
    expect(body.parameters).toMatchObject({
      director_reference_images: ['iVBORw=='],
      director_reference_descriptions: [
        {
          caption: { base_caption: 'character', char_captions: [] },
          legacy_uc: false,
        },
      ],
      director_reference_information_extracted: [1],
      director_reference_strength_values: [0.8],
      // 网页端发 1 − 保真度。
      director_reference_secondary_strength_values: [0.6],
      normalize_reference_strength_multiple: true,
      cfg_rescale: 0.2,
    })
    expect(body.parameters.image).toBeUndefined()
    expect(body.parameters.strength).toBeUndefined()
    expect(body.parameters.noise).toBeUndefined()
  })

  it('sends noise and CFG rescale for ordinary img2img without precise-reference fields', async () => {
    const fetchMock = stubNovelAiZipResponse()
    fetchMock.mockResolvedValueOnce(
      new Response(Uint8Array.from([137, 80, 78, 71])),
    )
    const context = makeContext(NOVELAI_V5_FULL, [
      'https://example.com/ref.png',
    ])
    context.providerInput.advancedParams = {
      img2imgNoise: 0.3,
      cfgRescale: 0.25,
      referenceStrength: 0.8,
    }
    await generateNovelAiImage(makeEnv(), context, 'nai-test-key')
    const body = JSON.parse(String(fetchMock.mock.calls[1][1].body))
    expect(body.action).toBe('img2img')
    expect(body.parameters.noise).toBe(0.3)
    expect(body.parameters.cfg_rescale).toBe(0.25)
    expect(body.parameters.strength).toBeCloseTo(0.2)
    // 网页端带底图时固定 seed - 1。
    expect(body.parameters.extra_noise_seed).toBe(body.parameters.seed - 1)
    expect(body.parameters.color_correct).toBe(false)
    expect(body.parameters.director_reference_images).toBeUndefined()
  })

  it('rejects precise reference on V5 before fetching', async () => {
    const fetchMock = stubNovelAiZipResponse()
    const context = makeContext(NOVELAI_V5_FULL, [
      'https://example.com/ref.png',
    ])
    context.providerInput.advancedParams = { novelAiReferenceMode: 'precise' }
    await expect(
      generateNovelAiImage(makeEnv(), context, 'nai-test-key'),
    ).rejects.toThrow('Precise character reference requires')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each(['manual', 'auto'])(
    'maps V5 character prompts with %s positioning',
    async (positioning) => {
      const fetchMock = stubNovelAiZipResponse()
      const context = makeContext(NOVELAI_V5_FULL)
      context.providerInput.advancedParams = {
        novelAiLayout: {
          positioning,
          characters: [
            {
              prompt: 'girl, blue hair',
              negativePrompt: 'hat',
              position: { x: 0.2, y: 0.7 },
            },
            {
              prompt: 'boy, red hair',
              negativePrompt: 'glasses',
              position: { x: 0.8, y: 0.4 },
            },
          ],
        },
      }
      await generateNovelAiImage(makeEnv(), context, 'nai-test-key')
      const body = JSON.parse(
        String((fetchMock.mock.calls[0]?.[1] as { body: string }).body),
      )
      expect(body.parameters.v4_prompt).toMatchObject({
        use_coords: positioning === 'manual',
        use_order: true,
        caption: {
          char_captions: [
            { char_caption: 'girl, blue hair', centers: [{ x: 0.2, y: 0.7 }] },
            { char_caption: 'boy, red hair', centers: [{ x: 0.8, y: 0.4 }] },
          ],
        },
      })
      expect(body.parameters.v4_negative_prompt.caption.char_captions).toEqual([
        { char_caption: 'hat', centers: [{ x: 0.2, y: 0.7 }] },
        { char_caption: 'glasses', centers: [{ x: 0.8, y: 0.4 }] },
      ])
    },
  )

  it('writes interactions into both character captions and attributes dialogue by position', async () => {
    const fetchMock = stubNovelAiZipResponse()
    const context = makeContext(NOVELAI_V5_FULL)
    context.providerInput.advancedParams = {
      novelAiLayout: {
        positioning: 'auto',
        characters: [
          {
            prompt: 'girl, blonde hair',
            negativePrompt: '',
            position: { x: 0.5, y: 0.5 },
            interactions: [{ tag: 'headpat', target: 1 }],
            dialogue: "You're late!",
          },
          {
            prompt: 'girl, black hair',
            negativePrompt: '',
            position: { x: 0.5, y: 0.5 },
            dialogue: 'Good morning!',
          },
        ],
      },
    }
    await generateNovelAiImage(makeEnv(), context, 'nai-test-key')
    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as { body: string }).body),
    )
    expect(
      body.parameters.v4_prompt.caption.char_captions.map(
        (caption: { char_caption: string }) => caption.char_caption,
      ),
    ).toEqual([
      'girl, blonde hair, source#headpat',
      'girl, black hair, target#headpat',
    ])
    expect(body.input).toBe(
      'masterpiece, best quality, 1girl, blue hair, text, english text, speech bubble. The girl on the left says "You\'re late!" and the girl on the right says "Good morning!", Text: You\'re late!\n\nGood morning!',
    )
    expect(body.parameters.v4_prompt.caption.base_caption).toBe(body.input)
  })

  it('rejects an interaction that points at a missing character', async () => {
    const fetchMock = stubNovelAiZipResponse()
    const context = makeContext(NOVELAI_V5_FULL)
    context.providerInput.advancedParams = {
      novelAiLayout: {
        positioning: 'auto',
        characters: [
          {
            prompt: 'girl',
            negativePrompt: '',
            position: { x: 0.5, y: 0.5 },
            interactions: [{ tag: 'hug', target: 3 }],
          },
        ],
      },
    }
    await expect(
      generateNovelAiImage(makeEnv(), context, 'nai-test-key'),
    ).rejects.toThrow('Invalid NovelAI character layout')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects invalid V5 coordinates before making a request', async () => {
    const fetchMock = stubNovelAiZipResponse()
    const context = makeContext(NOVELAI_V5_FULL)
    context.providerInput.advancedParams = {
      novelAiLayout: {
        positioning: 'manual',
        characters: [
          { prompt: 'girl', negativePrompt: '', position: { x: 2, y: 0 } },
        ],
      },
    }
    await expect(
      generateNovelAiImage(makeEnv(), context, 'nai-test-key'),
    ).rejects.toThrow('Invalid NovelAI character layout')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends params_version 4 for V5 models', async () => {
    const fetchMock = stubNovelAiZipResponse()

    await generateNovelAiImage(
      makeEnv(),
      makeContext(NOVELAI_V5_FULL),
      'nai-test-key',
    )

    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as { body: string }).body),
    ) as { model: string; parameters: Record<string, unknown> }
    expect(body.model).toBe(NOVELAI_V5_FULL)
    expect(body.parameters.params_version).toBe(4)
  })

  it('omits skip_cfg_above_sigma for V5 models', async () => {
    const fetchMock = stubNovelAiZipResponse()

    await generateNovelAiImage(
      makeEnv(),
      makeContext(NOVELAI_V5_FULL),
      'nai-test-key',
    )

    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as { body: string }).body),
    ) as { parameters: Record<string, unknown> }
    expect(body.parameters).not.toHaveProperty('skip_cfg_above_sigma')
  })

  it('contrast: V4.5 sends params_version 4 too and keeps skip_cfg_above_sigma', async () => {
    // 网页端所有模型都发 4（NAI Launcher 2026-10-23）；skip_cfg_above_sigma
    // 仍只在 V4.5 上带。
    const fetchMock = stubNovelAiZipResponse()

    await generateNovelAiImage(
      makeEnv(),
      makeContext(NOVELAI_V45_FULL),
      'nai-test-key',
    )

    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as { body: string }).body),
    ) as { parameters: Record<string, unknown> }
    expect(body.parameters.params_version).toBe(4)
    expect(body.parameters).toHaveProperty('skip_cfg_above_sigma')
  })

  it('rejects a V5 request carrying more than one reference image', async () => {
    // src's novelai.adapter.ts throws specifically for `hasMultiRef && useV5`
    // ('NovelAI V5 does not support multi-image Character Reference yet.'),
    // leaving V4/V4.5 multi-ref (Director mode) to go through
    // buildMultiRefParams. The worker's generateNovelAiImage rejects ANY
    // NovelAI model with more than one reference image
    // ('NovelAI multi-reference Director generation is not worker-migrated
    // yet.') — broader than src's V5-only rule, so this specific case still
    // throws, but for a different reason. See the drift note in the Step 1
    // report; not asserting the exact message here since the two forks
    // disagree on it.
    await expect(
      generateNovelAiImage(
        makeEnv(),
        makeContext(NOVELAI_V5_FULL, [
          'https://example.com/a.png',
          'https://example.com/b.png',
        ]),
        'nai-test-key',
      ),
    ).rejects.toThrow()
  })

  // 质量标签与 UC 预设是**标签串**（不是 API 字段）；画面文字翻成一句自然语言，
  // 内容进最末的 `Text:`；有字时质量标签去掉 `no text`（2026-10-07 实测）。
  it('appends the V5 quality tag string without no text and keeps Text: last', async () => {
    const fetchMock = stubNovelAiZipResponse()
    const context = makeContext(NOVELAI_V5_FULL)
    context.providerInput.advancedParams = {
      qualityToggle: 'standard',
      novelAiSceneTexts: [{ kind: 'other', text: 'Hello world' }],
    }

    await generateNovelAiImage(makeEnv(), context, 'nai-test-key')

    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as { body: string }).body),
    ) as { input: string; parameters: Record<string, unknown> }
    const expected =
      'masterpiece, best quality, 1girl, blue hair, text, english text. The text "Hello world" appears in the image, very aesthetic, masterpiece, Text: Hello world'
    expect(body.parameters.prompt).toBe(expected)
    expect(body.input).toBe(expected)
    expect(
      (
        body.parameters.v4_prompt as {
          caption: { base_caption: string }
        }
      ).caption.base_caption,
    ).toBe(expected)
    // 标签串我们自己拼；payload 只带网页端那套记账字段。
    expect(body.parameters).not.toHaveProperty('qualityToggle')
    expect(body.parameters.qualityPresetId).toBe('standard')
    expect(body.parameters.tag_hint_qt).toBe(1)
  })

  it.each([
    [
      'nai-diffusion-4-5-full',
      ', location, very aesthetic, masterpiece, no text',
    ],
    [
      'nai-diffusion-4-5-curated',
      ', location, masterpiece, no text, -0.8::feet::, rating:general',
    ],
  ])('uses model-specific quality tags for %s', async (model, suffix) => {
    const fetchMock = stubNovelAiZipResponse()
    const context = makeContext(model)
    context.providerInput.advancedParams = { qualityToggle: 'standard' }
    await generateNovelAiImage(makeEnv(), context, 'nai-test-key')
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(body.input).toBe(context.providerInput.prompt + suffix)
    expect(body.parameters.v4_prompt.caption.base_caption).toBe(body.input)
    expect(body.parameters.qualityPresetId).toBe('standard')
  })

  it('leaves the prompt untouched on the default quality tag option', async () => {
    const fetchMock = stubNovelAiZipResponse()
    const context = makeContext(NOVELAI_V5_FULL)
    context.providerInput.advancedParams = { qualityToggle: 'off' }

    await generateNovelAiImage(makeEnv(), context, 'nai-test-key')

    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as { body: string }).body),
    ) as { parameters: Record<string, unknown> }
    expect(body.parameters.prompt).toBe(
      'masterpiece, best quality, 1girl, blue hair',
    )
  })

  it('prefixes the UC preset tags before the user negative prompt', async () => {
    const fetchMock = stubNovelAiZipResponse()
    const context = makeContext(NOVELAI_V5_FULL)
    context.providerInput.advancedParams = {
      ucPreset: 'light',
      negativePrompt: 'hat',
    }

    await generateNovelAiImage(makeEnv(), context, 'nai-test-key')

    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as { body: string }).body),
    ) as { parameters: Record<string, unknown> }
    expect(body.parameters.negative_prompt).toBe(
      'lowres, bad hands, bad anatomy, artistic error, sepia, white haze, worst quality, very displeasing, jpeg artifacts, 0::ai-generated::, hat',
    )
    expect(body.parameters).not.toHaveProperty('ucPreset')
    expect(body.parameters.ucPresetId).toBe('light')
    expect(body.parameters.tag_hint_uc_preset).toBe(3)
  })

  it('uses the V4.5 Curated UC text, not the V5 one', async () => {
    const fetchMock = stubNovelAiZipResponse()
    const context = makeContext('nai-diffusion-4-5-curated')
    context.providerInput.advancedParams = { ucPreset: 'light' }
    await generateNovelAiImage(makeEnv(), context, 'nai-test-key')
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(body.parameters.negative_prompt).toMatch(
      /^blurry, lowres, upscaled, artistic error, scan artifacts/,
    )
  })

  // 对齐网页端的请求体（NAI Launcher 2026-10-23 核对）。
  it('matches the web client defaults on a plain V5 request', async () => {
    const fetchMock = stubNovelAiZipResponse()
    await generateNovelAiImage(
      makeEnv(),
      makeContext(NOVELAI_V5_FULL),
      'nai-test-key',
    )
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(body.use_new_shared_trial).toBe(true)
    expect(body.parameters).toMatchObject({
      scale: 4,
      steps: 28,
      sampler: 'k_euler_ancestral',
      deliberate_euler_ancestral_bug: false,
      prefer_brownian: true,
      autoSmea: false,
      image_format: 'png',
      legacy_uc: false,
      ucPresetId: 'none',
      qualityPresetId: 'none',
      tag_hint_uc_preset: 0,
      tag_hint_qt: 0,
    })
    expect(body.parameters).not.toHaveProperty('sm')
    expect(body.parameters).not.toHaveProperty('sm_dyn')
    expect(body.parameters).not.toHaveProperty('extra_noise_seed')
  })

  // 进度表 26 切片 2。NovelAI 的 infill 是换模型 + 换 action，不是加参数。
  it('switches to the inpainting model and infill action when a mask is set', async () => {
    const fetchMock = stubNovelAiZipResponse()
    const context = makeContext(NOVELAI_V5_FULL, [
      'data:image/png;base64,c291cmNl',
    ])
    context.providerInput.advancedParams = {
      inpaintMask: 'data:image/png;base64,bWFzaw==',
    }

    await generateNovelAiImage(makeEnv(), context, 'nai-test-key')

    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as { body: string }).body),
    ) as { model: string; action: string; parameters: Record<string, unknown> }
    expect(body.model).toBe('nai-diffusion-5-full-inpainting')
    expect(body.action).toBe('infill')
    expect(body.parameters.mask).toBe('bWFzaw==')
    expect(body.parameters.add_original_image).toBe(true)
    expect(body.parameters.inpaintImg2ImgStrength).toBe(1)
  })

  it('falls back to the V4.5 Curated inpainting model for V5 Curated', async () => {
    const fetchMock = stubNovelAiZipResponse()
    const context = makeContext('nai-diffusion-5-curated', [
      'data:image/png;base64,c291cmNl',
    ])
    context.providerInput.advancedParams = {
      inpaintMask: 'data:image/png;base64,bWFzaw==',
    }

    await generateNovelAiImage(makeEnv(), context, 'nai-test-key')

    const body = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as { body: string }).body),
    ) as { model: string; action: string }
    expect(body.model).toBe('nai-diffusion-4-5-curated-inpainting')
    expect(body.action).toBe('infill')
  })

  // 遮罩没有底图 = 没有可重绘的东西；⛔ 不能默默退回普通文生图。
  it('rejects a mask with no source image', async () => {
    const fetchMock = stubNovelAiZipResponse()
    const context = makeContext(NOVELAI_V5_FULL)
    context.providerInput.advancedParams = {
      inpaintMask: 'data:image/png;base64,bWFzaw==',
    }

    await expect(
      generateNovelAiImage(makeEnv(), context, 'nai-test-key'),
    ).rejects.toThrow('NovelAI inpainting needs one source image')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends V4.5 Full to its own inpainting model', async () => {
    const fetchMock = stubNovelAiZipResponse()
    const context = makeContext(NOVELAI_V45_FULL, [
      'data:image/png;base64,c291cmNl',
    ])
    context.providerInput.advancedParams = {
      inpaintMask: 'data:image/png;base64,bWFzaw==',
    }
    await generateNovelAiImage(makeEnv(), context, 'nai-test-key')
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(body.model).toBe('nai-diffusion-4-5-full-inpainting')
    expect(body.action).toBe('infill')
  })

  it('rejects a mask on a model with no inpainting counterpart', async () => {
    const context = makeContext('nai-diffusion-3', [
      'data:image/png;base64,c291cmNl',
    ])
    context.providerInput.advancedParams = {
      inpaintMask: 'data:image/png;base64,bWFzaw==',
    }

    await expect(
      generateNovelAiImage(makeEnv(), context, 'nai-test-key'),
    ).rejects.toThrow('NovelAI inpainting needs one source image')
  })

  it('extracts the image from a deflate-compressed, streamed-size ZIP (real NovelAI shape)', async () => {
    // Regression test: NovelAI's actual response is deflate-compressed
    // (method 8) with the local header's sizes zeroed (general-purpose bit
    // 3, "streamed"). The old extractor guessed the compressed length by
    // scanning forward for the next `PK` signature, which is unsound
    // against arbitrary compressed bytes and threw "trailing bytes after
    // end of compressed data" / "Called close() on a decompression stream
    // with incomplete data" against real responses. This exercises the
    // fixed central-directory-based path end to end.
    const fileData = Uint8Array.from(
      Buffer.from('a'.repeat(4000) + 'fake-png-bytes' + 'b'.repeat(4000)),
    )
    const compressedData = new Uint8Array(deflateRawSync(Buffer.from(fileData)))
    const fakeZip = buildZip({
      fileName: 'image_0.png',
      fileData,
      compressedData,
      compressionMethod: 8,
      streamedSizes: true,
    })
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(fakeZip, {
        status: 200,
        headers: { 'content-type': 'application/zip' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const env = makeEnv()

    await generateNovelAiImage(
      env,
      makeContext(NOVELAI_V5_FULL),
      'nai-test-key',
    )

    const putCall = (
      env.GENERATION_BUCKET.put as unknown as {
        mock: { calls: unknown[][] }
      }
    ).mock.calls[0]
    const uploadedBytes = new Uint8Array(putCall[1] as ArrayBuffer)
    expect(uploadedBytes).toEqual(fileData)
  })
})
