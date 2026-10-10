import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

// Bypass withRetry so tests assert the service's own logic without the
// 3-attempt backoff chain. Production behavior of retry-on-timeout is
// already covered by with-retry.ts's own tests.
vi.mock('@/lib/with-retry', () => ({
  withRetry: <T>(fn: () => Promise<T>) => fn(),
}))

import {
  fetchCivitaiLoraDownloadPolicy,
  fetchCivitaiModelFileSha256s,
  findCivitaiLorasWithDownloadDisabled,
  getCivitaiModelDescription,
  mineCivitaiUserPrompts,
  resolveCivitaiCheckpointByReference,
  resolveCivitaiLoraByReference,
  resolveCivitaiModelPageUrlByVersion,
} from '@/services/civitai-lora.service'

const mockFetch = vi.fn<typeof fetch>()

beforeEach(() => {
  // mockReset clears queued mockResolvedValueOnce answers — clearAllMocks alone
  // leaves leftovers that pollute later tests once name-resolve fans out.
  mockFetch.mockReset()
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.useRealTimers()
})

// 作者示例图与社区图并行拉（作者图在前），有配方时再读一次作者说明补采样器。
function fetchedPaths(): string[] {
  return mockFetch.mock.calls.map((call) => new URL(String(call[0])).pathname)
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('resolveCivitaiModelPageUrlByVersion', () => {
  it('resolves a concrete Civitai model page from a model version id', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 2819970,
        modelId: 2508748,
        model: {
          name: '鸣潮 (Wuthering Waves) || 娜波摩 (Nivora)',
          type: 'LORA',
        },
      }),
    )

    const result = await resolveCivitaiModelPageUrlByVersion(2819970)

    expect(result).toBe(
      'https://civitai.com/models/2508748?modelVersionId=2819970',
    )
    expect(String(mockFetch.mock.calls[0]?.[0])).toBe(
      'https://civitai.com/api/v1/model-versions/2819970',
    )
  })

  it('falls back to nested model.id when modelId is omitted', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 2819970,
        model: { id: 2508748 },
      }),
    )

    await expect(resolveCivitaiModelPageUrlByVersion(2819970)).resolves.toBe(
      'https://civitai.com/models/2508748?modelVersionId=2819970',
    )
  })

  it('returns null when Civitai omits the owning model id', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 2819970, model: {} }))

    await expect(resolveCivitaiModelPageUrlByVersion(2819970)).resolves.toBe(
      null,
    )
  })
})

describe('mineCivitaiUserPrompts', () => {
  it.each([{ width: 672, height: 984 }, { 'Original Size': '672x984' }])(
    'preserves Sue source generation dimensions and hash with %j',
    async (dimensions) => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          id: 3139260,
          name: 'ILLU',
          images: [
            {
              url: 'https://image.civitai.com/sue-137001090.jpeg',
              width: 968,
              height: 1424,
              nsfwLevel: 2,
              meta: {
                ...dimensions,
                prompt:
                  'official style, <lora:detailed hand focus style illustriousXL v1.1:0.8>, <lora:EnchantingEyesIllustrious:0.8>, <lora:SueV1-Nuclear1811-IL:0.9>, Sue, cyan eyes, white background',
                Model: 'rinFlanimeIllustrious_v40',
                'Model hash': '29d5281e0a',
                steps: 25,
                cfgScale: 7,
                sampler: 'Euler a',
                'Hires upscale': '1.45',
                'Hires upscaler': 'Latent',
                'Denoising strength': '0.45',
                'Hires steps': '0',
                'Hires CFG Scale': '7',
                resources: [
                  {
                    hash: '0x3da78937ac',
                    name: 'EnchantingEyesIllustrious',
                    type: 'lora',
                    weight: 0.8,
                  },
                  {
                    hash: '7ceb528b2184',
                    name: 'SueV1-Nuclear1811-IL',
                    type: 'lora',
                    weight: 0.9,
                  },
                  {
                    hash: 'a53740627a72',
                    name: 'detailed hand focus style illustriousXL v1.1',
                    type: 'lora',
                    unmatched: true,
                  },
                  {
                    hash: '29d5281e0a',
                    name: 'rinFlanimeIllustrious_v40',
                    type: 'model',
                  },
                ],
              },
            },
          ],
        }),
      )
      const result = await mineCivitaiUserPrompts({
        modelId: 2786243,
        modelVersionId: 3139260,
        fileHashAutoV3: '7ceb528b2184',
      })
      expect(result.recipes?.[0]).toMatchObject({
        width: 968,
        height: 1424,
        baseWidth: 672,
        baseHeight: 984,
        checkpointHash: '29d5281e0a',
        loraWeight: 0.9,
        hiresUpscale: 1.45,
        hiresUpscaler: 'Latent',
        denoisingStrength: 0.45,
        hiresSteps: 0,
        hiresCfgScale: 7,
        extraLoras: expect.arrayContaining([
          {
            name: 'detailed hand focus style illustriousXL v1.1',
            hash: 'a53740627a72',
            weight: 0.8,
          },
        ]),
      })
      expect(result.recipes?.[0]?.extraLoras).toHaveLength(2)
    },
  )

  it.each([0, 0.35])(
    'keeps explicit resource weight %s instead of conflicting prompt-tag weight',
    async (weight) => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          id: 3139260,
          name: 'ILLU',
          images: [
            {
              url: 'https://image.civitai.com/sue-weight.jpeg',
              nsfwLevel: 1,
              meta: {
                prompt:
                  '<lora:SueV1-Nuclear1811-IL:0.9>, Sue, <lora:DetailedHands:0.8>',
                resources: [
                  {
                    name: 'SueV1-Nuclear1811-IL',
                    hash: '7ceb528b2184',
                    type: 'lora',
                    weight: 0.9,
                  },
                  {
                    name: 'DetailedHands',
                    hash: 'a53740627a72',
                    type: 'lora',
                    weight,
                  },
                ],
              },
            },
          ],
        }),
      )
      const result = await mineCivitaiUserPrompts({
        modelId: 2786243,
        modelVersionId: 3139260,
        fileHashAutoV3: '7ceb528b2184',
      })
      expect(result.recipes?.[0]?.extraLoras).toEqual([
        { name: 'DetailedHands', hash: 'a53740627a72', weight },
      ])
    },
  )

  it('prefers model-version source image prompts over the community images endpoint', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 2819970,
        name: 'v1',
        images: [
          {
            url: 'https://image.civitai.com/source-1.jpeg',
            width: 832,
            height: 1216,
            nsfwLevel: 1,
            meta: {
              prompt:
                'simple background, <lora:NivoraV1-Nuclear1811-IL:0.85>, Nivora, turquoise eyes, 2d style',
              negativePrompt: '3d, realistic',
              seed: 1234567890,
              steps: 28,
              cfgScale: 6.5,
              sampler: 'DPM++ 2M Karras',
              'Clip skip': '2',
              Size: '832x1216',
              Model: 'Illustrious-XL-v1.0',
              resources: [
                {
                  hash: '7353E384259C',
                  name: 'NivoraV1-Nuclear1811-IL',
                  type: 'lora',
                  weight: 0.85,
                },
                { name: 'detail-tweaker-xl', type: 'lora', weight: 0.4 },
              ],
            },
          },
          {
            url: 'https://image.civitai.com/source-2.jpeg',
            nsfwLevel: 1,
            meta: {
              prompt:
                'portrait, <lora:NivoraV1-Nuclear1811-IL:0.85>, Nivora, fur hood, anime illustration',
            },
          },
        ],
      }),
    )

    const result = await mineCivitaiUserPrompts({
      modelId: 2508748,
      modelVersionId: 2819970,
      fileHashAutoV3: '7353e384259c',
    })

    expect(result.outfits).toHaveLength(2)
    expect(result.outfits[0]?.label).toBe('')
    expect(result.outfits[0]?.source).toBe('model_version_image')
    expect(result.outfits[0]?.prompt).toBe(
      'simple background, Nivora, turquoise eyes, 2d style',
    )
    expect(result.outfits[1]?.source).toBe('model_version_image')
    expect(result.totalSampled).toBe(2)

    // Per-image recipes pair the image URL with the FULL generation params
    // (hash matching is case-insensitive) and surface stacked extra LoRAs.
    expect(result.recipes).toHaveLength(2)
    expect(result.recipes?.[0]).toMatchObject({
      imageUrl: 'https://image.civitai.com/source-1.jpeg',
      width: 832,
      height: 1216,
      source: 'model_version_image',
      negativePrompt: '3d, realistic',
      seed: 1234567890,
      steps: 28,
      cfgScale: 6.5,
      sampler: 'DPM++ 2M Karras',
      clipSkip: 2,
      sizeRaw: '832x1216',
      checkpoint: 'Illustrious-XL-v1.0',
      loraWeight: 0.85,
      extraLoras: [{ name: 'detail-tweaker-xl', weight: 0.4 }],
    })
    // Second image has bare meta (no resources) — recipe still exists, and
    // the weight is recovered from its single in-prompt `<lora:..:0.85>` tag.
    expect(result.recipes?.[1]).toMatchObject({
      imageUrl: 'https://image.civitai.com/source-2.jpeg',
      source: 'model_version_image',
      loraWeight: 0.85,
    })

    const requestUrl = new URL(String(mockFetch.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v1/model-versions/2819970')
  })

  it('mines source recipes from NSFW (XXX) model-version images', async () => {
    // hentai LoRA "一键同款"：来源图全是 XXX（nsfwLevel 16）。放开天花板后
    // 这些图仍应产出配方，而不是被过滤成 0 → 空态。
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 3001,
        name: 'v1',
        images: [
          {
            url: 'https://image.civitai.com/nsfw-source.jpeg',
            width: 832,
            height: 1216,
            nsfwLevel: 16,
            meta: {
              prompt: '<lora:ExpressiveH:0.8>, expressiveh, 1girl',
              resources: [
                {
                  hash: 'ABCDEF123456',
                  name: 'ExpressiveH',
                  type: 'lora',
                  weight: 0.8,
                },
              ],
            },
          },
        ],
      }),
    )

    const result = await mineCivitaiUserPrompts({
      modelId: 3000,
      modelVersionId: 3001,
      fileHashAutoV3: 'abcdef123456',
    })

    expect(result.recipes).toHaveLength(1)
    expect(result.recipes?.[0]).toMatchObject({
      imageUrl: 'https://image.civitai.com/nsfw-source.jpeg',
      source: 'model_version_image',
      loraWeight: 0.8,
    })
  })

  it('surfaces prompt-less model-version images as previewImages when no recipe exists anywhere', async () => {
    // 作者没在示例图 meta 里填生成参数 → 组不成配方，但应作为纯预览图兜底
    // 露出，而不是让推荐区空着。
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 3118191,
        name: 'v1.0',
        images: [
          {
            url: 'https://image.civitai.com/preview-1.jpeg',
            width: 832,
            height: 1216,
            nsfwLevel: 1,
            meta: {},
          },
          {
            url: 'https://image.civitai.com/preview-2.jpeg',
            width: 768,
            height: 1024,
            nsfwLevel: 2,
            meta: {},
          },
        ],
      }),
    )
    // model-version 无配方 → 回落 community /images，这里也挖不到 → recipes 空。
    mockFetch.mockResolvedValueOnce(jsonResponse({ items: [] }))
    // 无配方兜底还会拉 /models/:id 取描述（方案 B）——给个无描述的模型。
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: 2769783, name: 'Aemeath', description: null }),
    )

    const result = await mineCivitaiUserPrompts({
      modelId: 2769783,
      modelVersionId: 3118191,
      fileHashAutoV3: 'deadbeef0000',
    })

    expect(result.recipes).toHaveLength(0)
    expect(result.previewImages).toEqual([
      {
        imageUrl: 'https://image.civitai.com/preview-1.jpeg',
        width: 832,
        height: 1216,
        nsfwLevel: 1,
      },
      {
        imageUrl: 'https://image.civitai.com/preview-2.jpeg',
        width: 768,
        height: 1024,
        nsfwLevel: 2,
      },
    ])
    expect(result.descriptionText).toBeUndefined()
    // 三次请求：model-versions（无配方）→ community /images（空）→ models/:id（无描述）。
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('keeps prompt-less author images alongside community recipes', async () => {
    // 作者示例图都没 prompt → 回落社区挖到配方；作者的图仍要放上去，不能被顶掉。
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 3140926,
        name: 'v0.1',
        images: [
          {
            url: 'https://image.civitai.com/author.jpeg',
            width: 832,
            height: 1216,
            nsfwLevel: 1,
            meta: {},
          },
        ],
      }),
    )
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: 1,
            url: 'https://image.civitai.com/community.jpeg',
            type: 'image',
            width: 832,
            height: 1216,
            meta: {
              prompt: '<lora:TestLora:0.8>, 1girl',
              resources: [{ hash: 'AABBCCDDEEFF', name: 'TestLora' }],
            },
          },
        ],
      }),
    )
    mockFetch.mockResolvedValue(
      jsonResponse({ id: 2787553, description: null }),
    )

    const result = await mineCivitaiUserPrompts({
      modelId: 2787553,
      modelVersionId: 3140926,
      fileHashAutoV3: 'aabbccddeeff',
    })

    expect(result.recipes?.map((recipe) => recipe.imageUrl)).toEqual([
      'https://image.civitai.com/community.jpeg',
    ])
    expect(result.previewImages?.map((image) => image.imageUrl)).toEqual([
      'https://image.civitai.com/author.jpeg',
    ])
  })

  it('skips video example images when collecting previewImages', async () => {
    // 视频封面渲染不了 <img> —— 纯预览图兜底也要跳过 video 条目。
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 4001,
        name: 'v1',
        images: [
          {
            url: 'https://image.civitai.com/clip.mp4',
            type: 'video',
            nsfwLevel: 1,
            meta: {},
          },
          {
            url: 'https://image.civitai.com/still.jpeg',
            width: 512,
            height: 768,
            nsfwLevel: 1,
            meta: {},
          },
        ],
      }),
    )
    mockFetch.mockResolvedValueOnce(jsonResponse({ items: [] }))
    // 无配方兜底会拉 /models/:id 取描述（方案 B）——给个无描述的模型。
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: 4000, name: 'x', description: null }),
    )

    const result = await mineCivitaiUserPrompts({
      modelId: 4000,
      modelVersionId: 4001,
    })

    expect(result.previewImages).toEqual([
      {
        imageUrl: 'https://image.civitai.com/still.jpeg',
        width: 512,
        height: 768,
        nsfwLevel: 1,
      },
    ])
  })

  it('falls back to the author model description text when no recipe exists anywhere', async () => {
    // 方案 B：图片无 prompt + community 也挖不到 → 拉 /models/:id 取整段描述，
    // strip 成纯文本原样返回（作者把推荐词写在纯段落里）。
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: 3118191, name: 'v1.0', images: [] }),
    )
    // community /images 空
    mockFetch.mockResolvedValueOnce(jsonResponse({ items: [] }))
    // /models/:id 作者描述（纯段落，非 <pre><code>）
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 2769783,
        name: 'Aemeath',
        type: 'LORA',
        description:
          '<p>Lora提示词：</p><p>Aemeath</p><p>long hair, pink hair</p>',
      }),
    )

    const result = await mineCivitaiUserPrompts({
      modelId: 2769783,
      modelVersionId: 3118191,
    })

    expect(result.recipes).toHaveLength(0)
    expect(result.previewImages).toBeUndefined()
    expect(result.descriptionText).toBe(
      'Lora提示词：\nAemeath\nlong hair, pink hair',
    )
    // 三次请求：model-versions → community images → models/:id
    expect(mockFetch).toHaveBeenCalledTimes(3)
    const modelUrl = new URL(String(mockFetch.mock.calls[2]?.[0]))
    expect(modelUrl.pathname).toBe('/api/v1/models/2769783')
  })

  it('keeps author images without prompts next to the real recipes', async () => {
    // 作者的图必放：没 prompt 的示例图照样作为纯预览图返回。
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 5001,
        name: 'v1',
        images: [
          {
            url: 'https://image.civitai.com/no-prompt.jpeg',
            width: 512,
            height: 768,
            nsfwLevel: 1,
            meta: {},
          },
          {
            url: 'https://image.civitai.com/with-prompt.jpeg',
            width: 832,
            height: 1216,
            nsfwLevel: 1,
            meta: {
              prompt: '<lora:TestLora:0.8>, test subject, anime style',
              resources: [
                {
                  hash: 'AABBCCDDEEFF',
                  name: 'TestLora',
                  type: 'lora',
                  weight: 0.8,
                },
              ],
            },
          },
        ],
      }),
    )

    const result = await mineCivitaiUserPrompts({
      modelId: 5000,
      modelVersionId: 5001,
      fileHashAutoV3: 'aabbccddeeff',
    })

    expect(result.recipes).toHaveLength(1)
    expect(result.previewImages?.map((image) => image.imageUrl)).toEqual([
      'https://image.civitai.com/no-prompt.jpeg',
    ])
  })

  it('fills a missing sampler / scheduler from the author tested-with notes', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          id: 3372361,
          name: 'v1.0',
          images: [
            {
              url: 'https://image.civitai.com/malfoid.jpeg',
              width: 832,
              height: 1344,
              nsfwLevel: 1,
              meta: {
                prompt: '@m4lfoid, blonde hair',
                steps: 12,
                cfgScale: 1.8,
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ items: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          description:
            '<p>trigger word: @m4lfoid</p><p>tested with: er_sde_beta, cfg 1.8, step 12 (Turbo 1.1)</p>',
        }),
      )

    const result = await mineCivitaiUserPrompts({
      modelId: 2975496,
      modelVersionId: 3372361,
      fileHashAutoV3: null,
    })

    expect(result.recipes?.[0]).toMatchObject({
      sampler: 'er_sde',
      scheduler: 'beta',
    })
    expect(fetchedPaths()).toEqual([
      '/api/v1/model-versions/3372361',
      '/api/v1/images',
      '/api/v1/models/2975496',
    ])
  })

  it('appends community recipes after the author ones so stacked LoRAs show up', async () => {
    // 作者图大多只挂这一把；叠了别的 LoRA 的是站内生成的社区图，只写
    // civitaiResources（版本号）不写 resources[].hash——以前作者有配方就不看
    // 社区图、社区图又只认 hash，两头把它们全丢了。
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          id: 3342283,
          name: 'v01',
          images: [
            {
              url: 'https://image.civitai.com/xG1/c0b9c3b5-cd66-46f4-aa55-7cc2504db4da/original=true/143301117.jpeg',
              nsfwLevel: 1,
              meta: { prompt: '1girl, @sh1nj1r0, fashion' },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            // 作者那张在社区接口里又出现一次（URL 尾巴不同）——不重复。
            {
              id: 143301117,
              url: 'https://image.civitai.com/xG1/c0b9c3b5-cd66-46f4-aa55-7cc2504db4da/original=true/c0b9c3b5-cd66-46f4-aa55-7cc2504db4da.jpeg',
              meta: { prompt: '1girl, @sh1nj1r0, fashion' },
            },
            {
              id: 144323800,
              url: 'https://image.civitai.com/xG1/5d0c4a1e-1111-4222-8333-944455556666/original=true/144323800.jpeg',
              modelVersionIds: [2983680, 3001940, 3126711, 3342283],
              meta: {
                prompt: '1girl, @sh1nj1r0, cafe',
                civitaiResources: [
                  { type: 'checkpoint', modelVersionId: 2983680 },
                  { type: 'lora', weight: 1, modelVersionId: 3001940 },
                  { type: 'lora', weight: 0.5, modelVersionId: 3126711 },
                  { type: 'lora', weight: 0.5, modelVersionId: 3342283 },
                ],
              },
            },
          ],
        }),
      )

      // 站内生成只记版本号——按版本号补名字（拿不到的照旧显示版本号）。
      .mockResolvedValueOnce(
        jsonResponse({ id: 3001940, model: { name: 'Anima Turbo LoRA' } }),
      )
      .mockResolvedValueOnce(jsonResponse({ error: 'nope' }, 404))

    const result = await mineCivitaiUserPrompts({
      modelId: 2525160,
      modelVersionId: 3342283,
      fileHashAutoV3: null,
    })

    expect(result.recipes?.map((recipe) => recipe.source)).toEqual([
      'model_version_image',
      'community_image',
    ])
    expect(result.recipes?.[1]).toMatchObject({
      loraWeight: 0.5,
      checkpointVersionId: 2983680,
      extraLoras: [
        { name: 'Anima Turbo LoRA', weight: 1, modelVersionId: 3001940 },
        { weight: 0.5, modelVersionId: 3126711 },
      ],
    })
  })

  it('keeps author recipes when the community images call fails', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          id: 7,
          name: 'v1',
          images: [
            {
              url: 'https://image.civitai.com/author.jpeg',
              nsfwLevel: 1,
              meta: { prompt: '1girl', sampler: 'euler', scheduler: 'simple' },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ error: 'down' }, 503))

    const result = await mineCivitaiUserPrompts({
      modelId: 6,
      modelVersionId: 7,
      fileHashAutoV3: null,
    })

    expect(result.recipes).toHaveLength(1)
    expect(result.recipes?.[0]?.source).toBe('model_version_image')
  })

  it('clusters real activation segments from /api/v1/images by hash', async () => {
    // Two c1-outfit generations + one c2-outfit, mirroring the actual
    // wuthering-waves Denia shape. Hash comparison is case-insensitive
    // (Civitai uppercases AutoV3 in `version.files` but lowercases it
    // in image `meta.resources`).
    const FILE_HASH = '7353e384259c'
    const LORA_NAME = 'DeniaV1-Nuclear1811-IL'
    const c1Prompt = `intro tokens,\n<lora:${LORA_NAME}:0.9>,purple eyes,pink hair,c1,white dress,2d style,\nfull body,pose`
    const c2Prompt = `intro tokens,\n<lora:${LORA_NAME}:0.9>,black halo,purple eyes,c2,black dress,2d style,\nfull body,pose`

    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 2975273,
        name: 'v1',
        images: [],
      }),
    )
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: 1,
            url: 'https://image.civitai.com/community-1.jpeg',
            width: 512,
            height: 768,
            meta: {
              meta: {
                prompt: c1Prompt,
                resources: [
                  {
                    hash: FILE_HASH.toUpperCase(),
                    name: LORA_NAME,
                    type: 'lora',
                    weight: 0.9,
                  },
                ],
              },
            },
          },
          {
            id: 2,
            url: 'https://image.civitai.com/community-2.jpeg',
            meta: {
              meta: {
                prompt: c1Prompt,
                resources: [{ hash: FILE_HASH, name: LORA_NAME, type: 'lora' }],
              },
            },
          },
          {
            id: 3,
            meta: {
              meta: {
                prompt: c2Prompt,
                resources: [{ hash: FILE_HASH, name: LORA_NAME, type: 'lora' }],
              },
            },
          },
          // Noise: a generation that doesn't reference our LoRA — must
          // be ignored without crashing.
          { id: 4, meta: { meta: { prompt: 'no lora here', resources: [] } } },
          // Noise: missing meta entirely.
          { id: 5, meta: null },
        ],
      }),
    )

    const result = await mineCivitaiUserPrompts({
      modelId: 2649729,
      modelVersionId: 2975273,
      fileHashAutoV3: FILE_HASH,
    })

    // Two outfit clusters surfaced (c1 = 2 samples, c2 = 1)
    expect(result.outfits).toHaveLength(2)
    expect(result.outfits[0]?.label).toBe('')
    expect(result.outfits[0]?.source).toBe('community_image')
    expect(result.outfits[0]?.sampleCount).toBe(2)
    expect(result.outfits[0]?.prompt).toContain('c1')
    expect(result.outfits[1]?.sampleCount).toBe(1)
    expect(result.outfits[1]?.prompt).toContain('c2')
    // totalSampled counts every image with usable meta.prompt — the
    // 4-with-no-resources is still "considered", the 5-with-null-meta
    // is not.
    expect(result.totalSampled).toBe(4)

    // Community recipes: only images WITH a url and a prompt (items 1+2;
    // items 3+4 have no url, item 5 has no meta). Full prompt
    // (lora tag stripped), real weight from resources.
    expect(result.recipes).toHaveLength(2)
    expect(result.recipes?.[0]).toMatchObject({
      imageUrl: 'https://image.civitai.com/community-1.jpeg',
      width: 512,
      height: 768,
      source: 'community_image',
      loraWeight: 0.9,
    })
    expect(result.recipes?.[0]?.prompt).toContain('c1')
    expect(result.recipes?.[0]?.prompt).not.toContain('<lora:')

    // Verify the API was called with the right query params: version id
    // only (no modelId — Cloudflare timeout risk), withMeta=true (without
    // it meta is always null), browsingLevel instead of legacy nsfw.
    const requestUrl = new URL(String(mockFetch.mock.calls[1]?.[0]))
    expect(requestUrl.searchParams.get('modelId')).toBeNull()
    expect(requestUrl.searchParams.get('modelVersionId')).toBe('2975273')
    expect(requestUrl.searchParams.get('withMeta')).toBe('true')
    // 31 = 放开到 XXX（仍挡 Blocked），让 NSFW LoRA 的社区配方也进入挖掘。
    expect(requestUrl.searchParams.get('browsingLevel')).toBe('31')
    expect(requestUrl.searchParams.get('nsfw')).toBeNull()
    expect(requestUrl.searchParams.get('sort')).toBe('Most Reactions')
  })

  it('handles the single-layer meta variant Civitai returns when modelVersionId+sort are set', async () => {
    // /api/v1/images with `modelId&modelVersionId&sort=Most Reactions`
    // returns `meta.{prompt,resources}` flat — not nested under
    // `meta.meta`. Service must accept both shapes.
    const FILE_HASH = 'abc123def456'
    const LORA_NAME = 'TestLoRA'
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: 1,
            meta: {
              prompt: `<lora:${LORA_NAME}:1>,trigger_word,1girl`,
              resources: [{ hash: FILE_HASH, name: LORA_NAME, type: 'lora' }],
            },
          },
        ],
      }),
    )

    const result = await mineCivitaiUserPrompts({
      modelId: 1,
      fileHashAutoV3: FILE_HASH,
    })
    expect(result.outfits).toHaveLength(1)
    expect(result.outfits[0]?.prompt).toBe('trigger_word, 1girl')
    expect(result.totalSampled).toBe(1)

    // Legacy favorites without a version id fall back to modelId — the
    // meta/browsing params must still be present.
    const requestUrl = new URL(String(mockFetch.mock.calls[0]?.[0]))
    expect(requestUrl.searchParams.get('modelId')).toBe('1')
    expect(requestUrl.searchParams.get('modelVersionId')).toBeNull()
    expect(requestUrl.searchParams.get('withMeta')).toBe('true')
    expect(requestUrl.searchParams.get('browsingLevel')).toBe('31')
  })

  it('returns empty outfits without crashing when no generation references the LoRA', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: 1,
            meta: {
              meta: {
                prompt: 'just a generic prompt, 1girl',
                resources: [],
              },
            },
          },
        ],
      }),
    )

    const result = await mineCivitaiUserPrompts({
      modelId: 999,
      fileHashAutoV3: 'deadbeef',
    })
    expect(result.outfits).toEqual([])
    expect(result.recipes).toEqual([])
    expect(result.totalSampled).toBe(1)
  })

  it('recovers lora weight from the prompt tag when resources only list the checkpoint', async () => {
    // Live-verified shape (Detail Tweaker XL source images): resources has
    // ONLY the checkpoint; the LoRA weight lives in the in-prompt tag.
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 135867,
        name: 'v1',
        files: [
          { type: 'Model', primary: true, name: 'add-detail-xl.safetensors' },
        ],
        images: [
          {
            url: 'https://image.civitai.com/source-tag.jpeg',
            nsfwLevel: 1,
            meta: {
              prompt:
                'photo, 8k portrait, intricate, elegant, <lora:add-detail-xl:0.8>',
              resources: [
                { hash: '82b5f664ae', name: 'dreamshaperXL10', type: 'model' },
              ],
            },
          },
          {
            url: 'https://image.civitai.com/source-multitag.jpeg',
            nsfwLevel: 1,
            meta: {
              // Multi-tag prompt: ours is identified by the file-name stem;
              // the other tag becomes an extra (fidelity warning).
              prompt:
                '1girl, <lora:add-detail-xl:0.6>, <lora:other-style:0.5>, scenery',
            },
          },
        ],
      }),
    )

    const result = await mineCivitaiUserPrompts({
      modelId: 122359,
      modelVersionId: 135867,
      fileHashAutoV3: '9c783c8ce46c',
    })

    expect(result.recipes?.[0]?.loraWeight).toBe(0.8)
    expect(result.recipes?.[0]?.extraLoras).toBeUndefined()
    expect(result.recipes?.[1]?.loraWeight).toBe(0.6)
    expect(result.recipes?.[1]?.extraLoras).toEqual([
      { name: 'other-style', weight: 0.5 },
    ])
  })

  it('soft-matches WebUI instance suffix so the primary LoRA is not listed as an extra', async () => {
    // Live Stabilizer shape: published file stem ...v1.198 but gallery tags
    // use ...v1.198_1 (A1111 multi-copy suffix). Without soft match the
    // primary becomes an "extra" and loraWeight is lost.
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 2055853,
        name: 'v1.198',
        files: [
          {
            type: 'Model',
            primary: true,
            name: 'illustriousXLv01_stabilizer_v1.198.safetensors',
          },
        ],
        images: [
          {
            url: 'https://image.civitai.com/stabilizer-multi.jpeg',
            nsfwLevel: 1,
            meta: {
              prompt:
                '<lora:illustriousXLv01_stabilizer_v1.198_1:0.6><lora:illus01_style_collection_elpe_v0.22:0.2>1girl',
              resources: [
                {
                  name: 'illustriousXLv01_stabilizer_v1.198_1',
                  type: 'lora',
                  weight: 0.6,
                },
                {
                  name: 'illus01_style_collection_elpe_v0.22',
                  type: 'lora',
                  weight: 0.2,
                },
              ],
            },
          },
        ],
      }),
    )

    const result = await mineCivitaiUserPrompts({
      modelId: 971952,
      modelVersionId: 2055853,
      fileHashAutoV3: null,
    })

    expect(result.recipes?.[0]?.loraWeight).toBe(0.6)
    expect(result.recipes?.[0]?.extraLoras).toEqual([
      { name: 'illus01_style_collection_elpe_v0.22', weight: 0.2 },
    ])
  })

  it('recovers lora weight from civitaiResources by modelVersionId (onsite generations)', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 555,
        name: 'v1',
        images: [
          {
            url: 'https://image.civitai.com/onsite.jpeg',
            nsfwLevel: 1,
            meta: {
              prompt: 'masterpiece, 1girl, white dress',
              civitaiResources: [
                { type: 'checkpoint', modelVersionId: 999999 },
                { type: 'lora', weight: 0.75, modelVersionId: 555 },
              ],
            },
          },
        ],
      }),
    )

    const result = await mineCivitaiUserPrompts({
      modelId: 444,
      modelVersionId: 555,
      fileHashAutoV3: 'deadbeef0000',
    })

    expect(result.recipes?.[0]?.loraWeight).toBe(0.75)
    expect(result.recipes?.[0]?.extraLoras).toBeUndefined()
    // V3: the onsite checkpoint's modelVersionId is captured for precise
    // base-model resolution (civitaiResources[type=checkpoint]).
    expect(result.recipes?.[0]?.checkpointVersionId).toBe(999999)
  })

  it('extras carry their locators (hash / modelVersionId) for one-tap mounting', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 555,
        name: 'v1',
        images: [
          {
            url: 'https://image.civitai.com/stacked.jpeg',
            nsfwLevel: 1,
            meta: {
              prompt: 'masterpiece, 1girl',
              resources: [
                {
                  hash: 'AABBCCDDEEFF',
                  name: 'other-by-hash',
                  type: 'lora',
                  weight: 0.4,
                },
              ],
              civitaiResources: [
                { type: 'lora', weight: 0.75, modelVersionId: 555 }, // target
                { type: 'lora', weight: 0.3, modelVersionId: 777 }, // extra
              ],
            },
          },
        ],
      }),
    )

    const result = await mineCivitaiUserPrompts({
      modelId: 444,
      modelVersionId: 555,
      fileHashAutoV3: 'deadbeef0000',
    })

    expect(result.recipes?.[0]?.extraLoras).toEqual([
      { name: 'other-by-hash', weight: 0.4, hash: 'aabbccddeeff' },
      { weight: 0.3, modelVersionId: 777 },
    ])
  })

  it('repairs Civitai mojibake strings in source recipes and extra LoRAs', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 160,
        name: 'v1.6',
        files: [
          {
            type: 'Model',
            primary: true,
            name: 'waiIllustriousSDXL_v160.safetensors',
          },
        ],
        images: [
          {
            url: 'https://image.civitai.com/mojibake.jpeg',
            nsfwLevel: 1,
            meta: {
              prompt:
                '<lora:waiIllustriousSDXL_v160:0.9>, detached sleeves, dragon girl, <lora:ææ¥æ¹èç»æ«å°å²ä»£çäºº:0.8>, white dress',
              negativePrompt:
                'bad proportions,out of focus,username,text,bad anatomy',
              seed: '5536891017203',
              steps: '24',
              cfgScale: '3.5',
              sampler: 'DPM++ 2M Karras',
              Scheduler: 'Karras',
              Size: '832x1216',
              'Hires upscale': '2',
              'Hires upscaler': '4x-AnimeSharp',
              'Denoising strength': '0.35',
              'Hires steps': '12',
              Model: 'éç¨æ´æ°å¿«waiIllustriousSDXL_v160',
              resources: [
                {
                  hash: 'DEADBEEF0000',
                  name: 'waiIllustriousSDXL_v160',
                  type: 'lora',
                  weight: 0.9,
                },
                {
                  name: 'ææ¥æ¹èç»æ«å°å²ä»£çäºº',
                  type: 'lora',
                  weight: 0.8,
                },
              ],
            },
          },
        ],
      }),
    )

    const result = await mineCivitaiUserPrompts({
      modelId: 999,
      modelVersionId: 160,
      fileHashAutoV3: 'deadbeef0000',
    })

    expect(result.recipes?.[0]).toMatchObject({
      checkpoint: '通用更新快waiIllustriousSDXL_v160',
      seed: '5536891017203',
      steps: 24,
      cfgScale: 3.5,
      sampler: 'DPM++ 2M Karras',
      scheduler: 'Karras',
      sizeRaw: '832x1216',
      baseWidth: 832,
      baseHeight: 1216,
      hiresUpscale: 2,
      hiresUpscaler: '4x-AnimeSharp',
      denoisingStrength: 0.35,
      hiresSteps: 12,
      loraWeight: 0.9,
      extraLoras: [
        {
          name: '明日方舟终末地岁代理人',
          weight: 0.8,
        },
      ],
    })
    expect(result.recipes?.[0]?.prompt).toBe(
      'detached sleeves, dragon girl, white dress',
    )
  })

  // Search hits carry no file hash: meilisearch
  // search-hit LoRAs never carry a fileHashAutoV3 (hitToLibraryItem writes
  // null — the search index doesn't expose files[].hashes). Recipes must
  // still come back from the model-version source images using only
  // modelId+modelVersionId; the hash is not a gate.
  it('mines source recipes from model-version images when fileHashAutoV3 is null (search-hit LoRAs)', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 2050454,
        name: 'v1',
        images: [
          {
            url: 'https://image.civitai.com/phrolova-source.jpeg',
            width: 832,
            height: 1216,
            nsfwLevel: 1,
            meta: {
              prompt: '<lora:Phrolova:0.8>, phrolova, purple hair, wings',
              seed: 42,
            },
          },
        ],
      }),
    )

    const result = await mineCivitaiUserPrompts({
      modelId: 1494914,
      modelVersionId: 2050454,
      fileHashAutoV3: null,
    })

    expect(result.recipes).toHaveLength(1)
    expect(result.recipes?.[0]).toMatchObject({
      imageUrl: 'https://image.civitai.com/phrolova-source.jpeg',
      source: 'model_version_image',
      // No hash to match against resources[] — weight still recovers from
      // the sole in-prompt <lora:..> tag (resolveRecipeLoraSignals' single-
      // tag fallback), proving the null hash doesn't break weight recovery.
      loraWeight: 0.8,
    })
    expect(result.outfits).toHaveLength(1)
    // No crash from the null hash reaching resolveRecipeLoraSignals; the
    // author endpoint is still asked first.
    const requestUrl = new URL(String(mockFetch.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v1/model-versions/2050454')
  })

  it('mines source recipes when fileHashAutoV3 is omitted entirely (undefined, not just null)', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 999,
        name: 'v1',
        images: [
          {
            url: 'https://image.civitai.com/no-hash-field.jpeg',
            nsfwLevel: 1,
            meta: { prompt: 'a simple prompt, no lora tag at all' },
          },
        ],
      }),
    )

    const result = await mineCivitaiUserPrompts({
      modelId: 1,
      modelVersionId: 2,
      // fileHashAutoV3 omitted — exercises the `fileHashAutoV3?: string |
      // null | undefined` widened type end-to-end (undefined, not null).
    })

    expect(result.recipes).toHaveLength(1)
    expect(result.recipes?.[0]?.prompt).toBe(
      'a simple prompt, no lora tag at all',
    )
  })
})

describe('fetchCivitaiModelFileSha256s', () => {
  it('returns the published SHA-256 of every model file, lowercased', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 3118200,
        name: 'v1',
        files: [
          { type: 'Model', hashes: { SHA256: 'AA'.repeat(32) } },
          { type: 'Model', hashes: { SHA256: 'bb'.repeat(32) } },
          { type: 'Training Data', hashes: { SHA256: 'cc'.repeat(32) } },
          { type: 'Model', hashes: { AutoV3: 'DEADBEEF' } },
        ],
      }),
    )

    expect(await fetchCivitaiModelFileSha256s(3118200)).toEqual([
      'aa'.repeat(32),
      'bb'.repeat(32),
    ])
  })

  it('returns null when the version publishes no SHA-256', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: 1, name: 'v1', files: [{ type: 'Model' }] }),
    )
    expect(await fetchCivitaiModelFileSha256s(1)).toBeNull()
  })
})

describe('resolveCivitaiCheckpointByReference', () => {
  const CKPT_PAYLOAD = {
    id: 597138,
    modelId: 521060,
    name: 'v5.0.0',
    baseModel: 'Anima',
    downloadUrl: 'https://civitai.com/api/download/models/597138',
    model: { name: 'Anima Pencil-XL', type: 'Checkpoint' },
    files: [
      {
        type: 'Model',
        primary: true,
        name: 'animaPencilXL_v500.safetensors',
        downloadUrl: 'https://civitai.com/api/download/models/597138',
        sizeKB: 6944000,
        hashes: {
          AutoV3: 'ABCDEF012345',
          SHA256:
            'BD43B7CFFE1ED1153D9C41E7BEB2F18CB1273EAFBAA3AF3EDD6A173DC90A006E',
        },
      },
    ],
  }

  it('resolves a checkpoint version to its download target', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(CKPT_PAYLOAD))

    const res = await resolveCivitaiCheckpointByReference({
      modelVersionId: 597138,
    })

    const requestUrl = new URL(String(mockFetch.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v1/model-versions/597138')
    expect(res).toEqual({
      modelVersionId: 597138,
      name: 'v5.0.0',
      baseModel: 'Anima',
      downloadUrl: 'https://civitai.com/api/download/models/597138',
      sizeKB: 6944000,
      fileHashAutoV3: 'abcdef012345',
      sha256:
        'bd43b7cffe1ed1153d9c41e7beb2f18cb1273eafbaa3af3edd6a173dc90a006e',
    })
  })

  it('resolves the source checkpoint hash through the by-hash endpoint', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(CKPT_PAYLOAD))
    const result = await resolveCivitaiCheckpointByReference({
      hash: '29d5281e0a',
    })
    expect(new URL(String(mockFetch.mock.calls[0]?.[0])).pathname).toBe(
      '/api/v1/model-versions/by-hash/29d5281e0a',
    )
    expect(result?.modelVersionId).toBe(597138)
  })

  it.each(['LORA', 'TextualInversion', undefined])(
    'rejects non-checkpoint hash payload type %s',
    async (type) => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ ...CKPT_PAYLOAD, model: { name: 'Wrong asset', type } }),
      )
      expect(
        await resolveCivitaiCheckpointByReference({ hash: '29d5281e0a' }),
      ).toBeNull()
    },
  )

  it('does not fetch without a checkpoint locator', async () => {
    expect(await resolveCivitaiCheckpointByReference({})).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns null when the version is a LoRA, not a checkpoint', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 135867,
        name: 'v1',
        baseModel: 'SDXL 1.0',
        model: { type: 'LORA' },
        files: [
          {
            type: 'Model',
            downloadUrl: 'https://civitai.com/api/download/models/135867',
          },
        ],
      }),
    )
    expect(
      await resolveCivitaiCheckpointByReference({ modelVersionId: 135867 }),
    ).toBeNull()
  })

  it('returns null when the checkpoint has no downloadable file', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 42,
        name: 'gated',
        baseModel: 'Illustrious',
        model: { type: 'Checkpoint' },
        files: [],
      }),
    )
    expect(
      await resolveCivitaiCheckpointByReference({ modelVersionId: 42 }),
    ).toBeNull()
  })
})

describe('resolveCivitaiLoraByReference', () => {
  // Live-verified by-hash payload shape (2026-06-11): version object with
  // modelId + nested model {name, type} + files/images/downloadUrl.
  const VERSION_PAYLOAD = {
    id: 135867,
    modelId: 122359,
    name: 'v1.0',
    baseModel: 'SDXL 1.0',
    trainedWords: ['add detail'],
    downloadUrl: 'https://civitai.com/api/download/models/135867',
    model: { name: 'Detail Tweaker XL', type: 'LORA' },
    files: [
      {
        type: 'Model',
        primary: true,
        name: 'add-detail-xl.safetensors',
        downloadUrl: 'https://civitai.com/api/download/models/135867',
        hashes: { AutoV3: '9C783C8CE46C' },
      },
    ],
    images: [
      {
        url: 'https://image.civitai.com/cover/original=true/1.jpeg',
        nsfwLevel: 1,
      },
    ],
  }

  it('resolves a hash into a mountable library item', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(VERSION_PAYLOAD))

    const item = await resolveCivitaiLoraByReference({ hash: '9C783C8CE46C' })

    const requestUrl = new URL(String(mockFetch.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe(
      '/api/v1/model-versions/by-hash/9c783c8ce46c',
    )
    expect(item).toMatchObject({
      id: 'civitai:122359:135867',
      name: 'Detail Tweaker XL',
      loraUrl: 'https://civitai.com/api/download/models/135867',
      baseModelFamily: 'SDXL 1.0',
      fileHashAutoV3: '9c783c8ce46c',
    })
  })

  // 切片 3（推荐卡）：`sizeKB` 一直被 CivitaiFileSchema 解析着却从没映射出去，
  // 「这把 LoRA 多大」在前端取不到。上游给的是**小数 KB**（实测
  // 56075.02734375），换算后取整；缺失时是 null 而不是 0 —— 0 会被卡面显示成
  // 「0 B」，那是个假事实。
  it('maps the primary file sizeKB into fileSizeBytes, and null when absent', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        ...VERSION_PAYLOAD,
        files: [{ ...VERSION_PAYLOAD.files[0], sizeKB: 56075.02734375 }],
      }),
    )
    const withSize = await resolveCivitaiLoraByReference({
      modelVersionId: 135867,
    })
    expect(withSize?.fileSizeBytes).toBe(Math.round(56075.02734375 * 1024))

    mockFetch.mockResolvedValueOnce(jsonResponse(VERSION_PAYLOAD))
    const withoutSize = await resolveCivitaiLoraByReference({
      modelVersionId: 135867,
    })
    expect(withoutSize?.fileSizeBytes).toBeNull()
  })

  it('resolves a modelVersionId via the /:id endpoint', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(VERSION_PAYLOAD))

    const item = await resolveCivitaiLoraByReference({ modelVersionId: 135867 })

    const requestUrl = new URL(String(mockFetch.mock.calls[0]?.[0]))
    expect(requestUrl.pathname).toBe('/api/v1/model-versions/135867')
    expect(item?.id).toBe('civitai:122359:135867')
  })

  it('returns null for non-LoRA references and missing input', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        ...VERSION_PAYLOAD,
        model: { name: 'Some Checkpoint', type: 'Checkpoint' },
      }),
    )
    expect(
      await resolveCivitaiLoraByReference({ hash: 'aabbccddeeff' }),
    ).toBeNull()
    expect(await resolveCivitaiLoraByReference({})).toBeNull()
  })

  it('falls back to name search with exact file-stem matching when the hash misses', async () => {
    // Live-verified failure mode: meta hashes are often the author's LOCAL
    // file (pruned/converted) and miss Civitai's index, while the meta name
    // equals the published file's stem.
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ error: 'not found' }, 404))
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: 999,
              name: 'Unrelated Style',
              type: 'LORA',
              modelVersions: [
                {
                  id: 1,
                  name: 'v1',
                  baseModel: 'Illustrious',
                  files: [
                    {
                      type: 'Model',
                      primary: true,
                      name: 'SomethingElse.safetensors',
                      downloadUrl: 'https://civitai.com/api/download/models/1',
                    },
                  ],
                },
              ],
            },
            {
              id: 974076,
              name: 'Enchanting Eyes (Detailed Eyes)',
              type: 'LORA',
              modelVersions: [
                {
                  id: 1463317,
                  name: 'Illustrious',
                  baseModel: 'Illustrious',
                  trainedWords: [],
                  files: [
                    {
                      type: 'Model',
                      primary: true,
                      name: 'EnchantingEyesIllustrious.safetensors',
                      downloadUrl:
                        'https://civitai.com/api/download/models/1463317',
                      hashes: { AutoV3: '6F4F88234D6C' },
                    },
                  ],
                },
              ],
            },
          ],
        }),
      )

    const item = await resolveCivitaiLoraByReference({
      hash: 'aaaaaaaaaaaa', // 作者本地文件 hash，索引里没有
      name: 'EnchantingEyesIllustrious',
    })

    const searchUrl = new URL(String(mockFetch.mock.calls[1]?.[0]))
    expect(searchUrl.pathname).toBe('/api/v1/models')
    // camelCase 词干必须拆词后再搜 — Civitai 搜索不拆 camelCase（实测）。
    expect(searchUrl.searchParams.get('query')).toBe(
      'Enchanting Eyes Illustrious',
    )
    expect(item).toMatchObject({
      id: 'civitai:974076:1463317',
      name: 'Enchanting Eyes (Detailed Eyes)',
      baseModelFamily: 'Illustrious',
    })
  })

  it('repairs mojibake before exact name-stem matching', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        items: [
          {
            id: 3001,
            name: 'Arknights Endfield Agent',
            type: 'LORA',
            modelVersions: [
              {
                id: 4001,
                name: 'Illustrious',
                baseModel: 'Illustrious',
                trainedWords: [],
                files: [
                  {
                    type: 'Model',
                    primary: true,
                    name: '明日方舟终末地岁代理人.safetensors',
                    downloadUrl: 'https://civitai.com/api/download/models/4001',
                    hashes: { AutoV3: 'AABBCCDDEEFF' },
                  },
                ],
              },
            ],
          },
        ],
      }),
    )

    const item = await resolveCivitaiLoraByReference({
      name: 'ææ¥æ¹èç»æ«å°å²ä»£çäºº',
    })

    const searchUrl = new URL(String(mockFetch.mock.calls[0]?.[0]))
    expect(searchUrl.searchParams.get('query')).toBe('明日方舟终末地岁代理人')
    expect(item).toMatchObject({
      id: 'civitai:3001:4001',
      name: 'Arknights Endfield Agent',
      baseModelFamily: 'Illustrious',
      fileHashAutoV3: 'aabbccddeeff',
    })
  })

  it('does not fuzzy-accept name search results without a stem match', async () => {
    mockFetch.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('search-new.civitai.com')) {
        return jsonResponse({ results: [{ hits: [] }] })
      }
      // REST name search: near-miss files only — never an exact stem match.
      return jsonResponse({
        items: [
          {
            id: 1,
            name: 'Close But No Match',
            type: 'LORA',
            modelVersions: [
              {
                id: 2,
                name: 'v1',
                files: [
                  {
                    type: 'Model',
                    name: 'close-but-no.safetensors',
                    downloadUrl: 'https://civitai.com/api/download/models/2',
                  },
                ],
              },
            ],
          },
        ],
      })
    })

    expect(
      await resolveCivitaiLoraByReference({
        name: 'detailed hand focus style illustriousXL v1.1',
      }),
    ).toBeNull()
  })

  it('falls back to Civitai web search when the public models API misses an exact version file stem', async () => {
    // URL-routed mock: progressive REST always empty; multi-search returns
    // candidates; version fetch confirms the Illustrious file stem.
    mockFetch.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('search-new.civitai.com')) {
        return jsonResponse({
          results: [
            {
              hits: [
                {
                  id: 421162,
                  name: 'Detailed style XL + F1D + SD1.5 + zib',
                  type: 'LORA',
                  versions: [
                    {
                      id: 469308,
                      name: 'Detailed XL v1.0',
                      baseModel: 'SDXL 1.0',
                      files: [
                        {
                          name: 'detailed hand focus style XL v1.0.safetensors',
                        },
                      ],
                    },
                  ],
                },
                {
                  id: 200255,
                  name: 'Hands XL + SD 1.5 + F1D + Pony + Illustrious + zit + ZIB',
                  type: 'LORA',
                  versions: [
                    {
                      id: 2212079,
                      name: 'Hands Illu v1.1',
                      baseModel: 'Illustrious',
                    },
                  ],
                },
              ],
            },
          ],
        })
      }
      if (url.includes('/api/v1/model-versions/2212079')) {
        return jsonResponse({
          id: 2212079,
          modelId: 200255,
          name: 'Hands Illu v1.1',
          baseModel: 'Illustrious',
          trainedWords: [],
          downloadUrl: 'https://civitai.com/api/download/models/2212079',
          model: {
            name: 'Hands XL + SD 1.5 + F1D + Pony + Illustrious + zit + ZIB',
            type: 'LORA',
          },
          files: [
            {
              type: 'Model',
              primary: true,
              name: 'detailed hand focus style illustriousXL v1.1.safetensors',
              downloadUrl: 'https://civitai.com/api/download/models/2212079',
              hashes: { AutoV3: '6D97C71F80C8' },
            },
          ],
        })
      }
      // Progressive REST name queries
      return jsonResponse({ items: [] })
    })

    const item = await resolveCivitaiLoraByReference({
      name: 'detailed hand focus style illustriousXL v1.1',
      baseModelFamily: 'Illustrious',
    })

    const webSearchCall = mockFetch.mock.calls.find((call) =>
      String(call[0]).includes('search-new.civitai.com'),
    )
    expect(webSearchCall).toBeDefined()
    const searchInit = webSearchCall?.[1] as RequestInit | undefined
    const searchBody = JSON.parse(String(searchInit?.body)) as {
      queries: Array<{
        indexUid: string
        q: string
        limit: number
        filter: string[]
      }>
    }
    const versionCall = mockFetch.mock.calls.find((call) =>
      String(call[0]).includes('/api/v1/model-versions/2212079'),
    )

    expect(searchBody.queries.length).toBeGreaterThanOrEqual(1)
    expect(searchBody.queries[0]).toMatchObject({
      indexUid: 'models_v9',
      q: 'detailed hand focus style illustrious XL v1.1',
      limit: 50,
      filter: [
        'type = LoRA',
        'versions.baseModel IN ["Illustrious", "NoobAI"]',
      ],
    })
    expect(versionCall).toBeDefined()
    expect(item).toMatchObject({
      id: 'civitai:200255:2212079',
      name: 'Hands XL + SD 1.5 + F1D + Pony + Illustrious + zit + ZIB',
      baseModelFamily: 'Illustrious',
      fileHashAutoV3: '6d97c71f80c8',
    })
  })

  it('resolves local file stems via progressive name search (REST)', async () => {
    // Full stem query misses; stripped "style collection elpe" hits the
    // published Style Collection model with exact file match.
    mockFetch.mockImplementation(async (input) => {
      const url = new URL(String(input))
      const q = url.searchParams.get('query') ?? ''
      if (q === 'style collection elpe') {
        return jsonResponse({
          items: [
            {
              id: 1777579,
              name: 'Style Collection [IL]',
              type: 'LORA',
              modelVersions: [
                {
                  id: 2060407,
                  name: 'elpe v0.22',
                  baseModel: 'Illustrious',
                  downloadUrl:
                    'https://civitai.com/api/download/models/2060407',
                  files: [
                    {
                      type: 'Model',
                      primary: true,
                      name: 'illus01_style_collection_elpe_v0.22.safetensors',
                      downloadUrl:
                        'https://civitai.com/api/download/models/2060407',
                      hashes: { AutoV3: 'AABBCCDDEE01' },
                    },
                  ],
                },
              ],
            },
          ],
        })
      }
      if (url.pathname.startsWith('/api/v1/models')) {
        return jsonResponse({ items: [] })
      }
      return jsonResponse({ results: [{ hits: [] }] })
    })

    const item = await resolveCivitaiLoraByReference({
      name: 'illus01_style_collection_elpe_v0.22',
      baseModelFamily: 'Illustrious',
    })

    expect(item).toMatchObject({
      id: 'civitai:1777579:2060407',
      name: 'Style Collection [IL]',
      baseModelFamily: 'Illustrious',
    })
  })

  it('does not accept web search matches from a different base model family', async () => {
    mockFetch.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('search-new.civitai.com')) {
        return jsonResponse({
          results: [
            {
              hits: [
                {
                  id: 421162,
                  name: 'Detailed style XL + F1D + SD1.5 + zib',
                  type: 'LORA',
                  versions: [
                    {
                      id: 469308,
                      name: 'Detailed XL v1.0',
                      baseModel: 'SDXL 1.0',
                      files: [
                        {
                          name: 'detailed hand focus style illustriousXL v1.1.safetensors',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        })
      }
      return jsonResponse({ items: [] })
    })

    expect(
      await resolveCivitaiLoraByReference({
        name: 'detailed hand focus style illustriousXL v1.1',
        baseModelFamily: 'Illustrious',
      }),
    ).toBeNull()
    expect(
      mockFetch.mock.calls.some((call) =>
        String(call[0]).includes('search-new.civitai.com'),
      ),
    ).toBe(true)
  })
})

describe('getCivitaiModelDescription', () => {
  it('returns the stripped author description text from /models/:id', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        id: 999,
        name: 'Some LoRA',
        description: '<p>Lora提示词：</p><p>tag a, tag b</p>',
      }),
    )

    const result = await getCivitaiModelDescription(999)

    expect(result.descriptionText).toBe('Lora提示词：\ntag a, tag b')
    const url = new URL(String(mockFetch.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/api/v1/models/999')
  })

  it('returns null when the model has no description', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: 998, name: 'x', description: null }),
    )

    const result = await getCivitaiModelDescription(998)

    expect(result.descriptionText).toBeNull()
  })
})

// S2（docs/references/pages/lora-workbench.md §3.2）：内容类型筛选路由到
// listCivitaiLorasByContentType，走 meilisearch 的 L1(tag)+L2(关键词) 两
// query 合并 + L3 exclude/override 纠错。这条路径不消费 REST，也没有
// REST 回落——失败直接向上抛。
// ── Creator Controls：作者关掉下载的 LoRA ────────────────────────────────
//
// 2026-08-29 真机根因。`usageControl` 只在 version 详情端点上有，且
// **不可下载的版本照样返 `downloadUrl`** —— 所以判据只能是这个字段本身。
describe('civitai download policy', () => {
  it('flags a version whose creator turned downloads off', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({
        id: 2266398,
        usageControl: 'Generation',
        // 不可下载也照样带 downloadUrl —— 拿它当判据就会漏判。
        downloadUrl: 'https://civitai.com/api/download/models/2266398',
        model: { name: 'Ananta' },
      }),
    )

    const policy = await fetchCivitaiLoraDownloadPolicy(2266398)

    expect(policy).toEqual({
      modelVersionId: 2266398,
      downloadDisabled: true,
      usageControl: 'Generation',
      name: 'Ananta',
    })
  })

  it('clears a version that is actually downloadable', async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ id: 135867, usageControl: 'Download' }),
    )

    const policy = await fetchCivitaiLoraDownloadPolicy(135867)
    expect(policy.downloadDisabled).toBe(false)
  })

  it('returns null (= 判不了) when the field is missing, so callers pass', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ id: 42 }))

    const policy = await fetchCivitaiLoraDownloadPolicy(42)
    expect(policy.downloadDisabled).toBeNull()
  })

  it('returns null (= 判不了) when Civitai itself is down', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'boom' }, 503))

    const policy = await fetchCivitaiLoraDownloadPolicy(7)
    expect(policy.downloadDisabled).toBeNull()
  })

  it('only reports the blocked Civitai LoRAs and never touches other sources', async () => {
    mockFetch.mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/2266398')) {
        return jsonResponse({
          id: 2266398,
          usageControl: 'Generation',
          model: { name: 'Ananta' },
        })
      }
      return jsonResponse({ id: 135867, usageControl: 'Download' })
    })

    const blocked = await findCivitaiLorasWithDownloadDisabled([
      'https://civitai.com/api/download/models/2266398',
      'https://civitai.com/api/download/models/135867',
      // 非 Civitai 源没有这个字段，一次请求都不该发。
      'https://huggingface.co/foo/bar/resolve/main/style.safetensors',
    ])

    expect(blocked.map((policy) => policy.modelVersionId)).toEqual([2266398])
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('passes everything through when no LoRA is a Civitai download link', async () => {
    const blocked = await findCivitaiLorasWithDownloadDisabled([
      'https://huggingface.co/foo/bar/resolve/main/style.safetensors',
    ])

    expect(blocked).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
