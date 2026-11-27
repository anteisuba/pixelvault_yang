/**
 * L2a 真库：出图前的入参校验（`resolveImageRouteAndValidate`，真用户 + 真选路），
 * 以及参考图 / 遮罩的预处理（只假 R2 的真 I/O）。核返回的路由、抛的错与传进桶里的图。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/services/storage/r2', async (importOriginal) =>
  (await import('@/test/int/fake-r2')).fakeR2Module(await importOriginal()),
)

import sharp from 'sharp'

import { AI_MODELS } from '@/constants/models'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  prepareIdeogramInpaintMask,
  resolveImageRouteAndValidate,
  uploadNovelAiPreciseReferencesIfNeeded,
  uploadReferenceImagesIfNeeded,
} from '@/services/image/generate-image.service'
import { createTestUser, resetDatabase, seedAssistantKey } from '@/test/int/db'
import { FAKE_CDN, fakeBucket } from '@/test/int/fake-r2'
import type { GenerateRequest } from '@/types'

let me: Awaited<ReturnType<typeof createTestUser>>

beforeEach(async () => {
  await resetDatabase()
  fakeBucket.reset()
  me = await createTestUser()
  for (const adapter of [
    AI_ADAPTER_TYPES.VOLCENGINE,
    AI_ADAPTER_TYPES.NOVELAI,
    AI_ADAPTER_TYPES.FAL,
    AI_ADAPTER_TYPES.IDEOGRAM,
  ])
    await seedAssistantKey(me.id, adapter)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const validate = (input: Record<string, unknown>) =>
  resolveImageRouteAndValidate(me.clerkId, {
    prompt: 'a cat',
    ...input,
  } as GenerateRequest)
const routeOf = (modelId: string) => ({ route: { modelId } })

describe('Ideogram 入参', () => {
  const ideogram = (input: Record<string, unknown>) =>
    validate({ modelId: AI_MODELS.IDEOGRAM_45, aspectRatio: '1:1', ...input })

  it('遮罩编辑可以再带三张参考图；质量 / 比例 / 分辨率超出就拒', async () => {
    await expect(
      ideogram({
        referenceImages: ['s', 'a', 'b', 'c'],
        advancedParams: { quality: 'very_low', inpaintMask: 'm' },
      }),
    ).resolves.toMatchObject(routeOf(AI_MODELS.IDEOGRAM_45))
    await expect(
      ideogram({ advancedParams: { quality: 'very_low' } }),
    ).rejects.toThrow('quality')
    await expect(
      ideogram({ referenceImages: ['s'], aspectRatio: '16:9' }),
    ).rejects.toThrow('square')
    await expect(
      ideogram({ advancedParams: { resolution: '4K' } }),
    ).rejects.toThrow('1K or 2K')
  })
})

// 火山 Ark 文档：`background: "transparent"` 只在 5.0 Pro 上存在，且「仅支持
// 图生图场景，且只支持输入 1 张带透明通道的图片」。校验层管得到前两条前置
// （场景 + 张数），图片本身有没有 alpha 通道只有 provider 判得了。
// https://www.volcengine.com/docs/82379/1541523
describe('Seedream 透明背景', () => {
  const pro = (input: Record<string, unknown>) =>
    validate({ modelId: AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE, ...input })

  it('恰好一张参考图：放行', async () => {
    await expect(
      pro({
        referenceImages: ['https://cdn.example.com/a.png'],
        advancedParams: { background: 'transparent' },
      }),
    ).resolves.toMatchObject(routeOf(AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE))
  })

  // 0 张 = 纯文生图，≥2 张 = 多图生图；文档两种都不允许。
  it.each([
    ['no reference image', [] as string[]],
    ['two reference images', ['https://a/1.png', 'https://a/2.png']],
  ])('%s：拒', async (_label, refs) => {
    await expect(
      pro({
        referenceImages: refs,
        advancedParams: { background: 'transparent' },
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      // ⚠ 原文要与 generation-errors 的那条正则对得上，否则这条错误会掉回
      // 「参考图上限」的通用文案，把人送去删参考图。
      message: expect.stringContaining(
        'Transparent background requires exactly one reference image',
      ),
    })
  })

  // 5.5 文生图就能出透明底、图生图收多张且不要 alpha（BytePlus 教程 2026-11-13）。
  it.each([
    ['no reference image', [] as string[]],
    ['two reference images', ['https://a/1.png', 'https://a/2.png']],
  ])('5.5 %s：放行', async (_label, refs) => {
    await expect(
      validate({
        modelId: AI_MODELS.SEEDREAM_55_VOLCENGINE,
        referenceImages: refs,
        advancedParams: { background: 'transparent' },
      }),
    ).resolves.toMatchObject(routeOf(AI_MODELS.SEEDREAM_55_VOLCENGINE))
  })

  it('不透明背景、没有参考图：照常放行', async () => {
    await expect(
      pro({ advancedParams: { background: 'opaque' } }),
    ).resolves.toMatchObject(routeOf(AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE))
  })

  // Lite 的能力表里根本没有 backgroundOptions，所以任何 background 值都该在
  // 值域校验那一关就死掉——不能等到火山返 400。
  it('Lite 上任何 background 都拒', async () => {
    await expect(
      validate({
        modelId: AI_MODELS.SEEDREAM_50_LITE_VOLCENGINE,
        referenceImages: ['https://cdn.example.com/a.png'],
        advancedParams: { background: 'transparent' },
      }),
    ).rejects.toMatchObject({
      message: 'Unsupported background for the selected model',
    })
  })
})

// 「仅支持输入单张待拆分图，传入多张报错」，且开了 layer_decomposition 之后
// `image` 是必选参数 —— 0 张与 ≥2 张都不成立。
describe('Seedream 图层拆分', () => {
  const pro = (input: Record<string, unknown>) =>
    validate({
      modelId: AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE,
      prompt: 'split this poster',
      ...input,
    })

  it('恰好一张参考图：放行', async () => {
    await expect(
      pro({
        referenceImages: ['https://cdn.example.com/poster.png'],
        advancedParams: { layerDecomposition: true },
      }),
    ).resolves.toMatchObject(routeOf(AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE))
  })

  it.each([
    ['no reference image', [] as string[]],
    ['two reference images', ['https://a/1.png', 'https://a/2.png']],
  ])('%s：拒', async (_label, refs) => {
    await expect(
      pro({
        referenceImages: refs,
        advancedParams: { layerDecomposition: true },
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: expect.stringContaining(
        'Layer decomposition requires exactly one reference image',
      ),
    })
  })

  // 文档没有写这两颗互斥，所以同时开也必须放行 —— ⛔ 不自造互斥规则。
  it('和透明背景一起开：放行', async () => {
    await expect(
      pro({
        referenceImages: ['https://cdn.example.com/poster.png'],
        advancedParams: { layerDecomposition: true, background: 'transparent' },
      }),
    ).resolves.toMatchObject(routeOf(AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE))
  })

  it('Lite 上拒', async () => {
    await expect(
      validate({
        modelId: AI_MODELS.SEEDREAM_50_LITE_VOLCENGINE,
        referenceImages: ['https://cdn.example.com/poster.png'],
        advancedParams: { layerDecomposition: true },
      }),
    ).rejects.toMatchObject({
      message: 'Unsupported layerDecomposition for the selected model',
    })
  })
})

describe('NovelAI 能力闸', () => {
  const V5 = AI_MODELS.NOVELAI_V5_FULL
  const V45 = AI_MODELS.NOVELAI_V45_FULL
  const nai = (
    modelId: string,
    advancedParams: Record<string, unknown>,
    extra: Record<string, unknown> = {},
  ) => validate({ modelId, prompt: '1girl', advancedParams, ...extra })

  it('V5 上三颗 V5 控件都认', async () => {
    await expect(
      nai(V5, {
        qualityToggle: 'standard',
        ucPreset: 'heavy',
        novelAiSceneTexts: [{ kind: 'sign', text: 'hello' }],
      }),
    ).resolves.toMatchObject(routeOf(V5))
  })

  // V4.5 不支持 Light 质量标签。
  it('V4.5 上 qualityToggle=light 拒', async () => {
    await expect(nai(V45, { qualityToggle: 'light' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Unsupported qualityToggle for the selected model',
    })
  })

  // V4 / V4.5 的画中文字只认英文、≤118（官方 textrendering 页）。
  it('V4.5 画中文字认英文，其他文字拒', async () => {
    await expect(
      nai(V45, { novelAiSceneTexts: [{ kind: 'sign', text: 'CAFE' }] }),
    ).resolves.toMatchObject(routeOf(V45))
    await expect(
      nai(V45, {
        novelAiLayout: {
          positioning: 'auto',
          characters: [
            {
              prompt: 'girl',
              negativePrompt: '',
              position: { x: 0.5, y: 0.5 },
              dialogue: '你迟到了！',
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      message: 'The selected model only draws English text',
    })
  })

  it('V4.5 认标准质量标签，也留着 UC 预设', async () => {
    await expect(
      nai(V45, { qualityToggle: 'standard' }),
    ).resolves.toMatchObject(routeOf(V45))
    await expect(nai(V45, { ucPreset: 'furry' })).resolves.toMatchObject(
      routeOf(V45),
    )
  })

  it.each([
    [
      'V5 Full Medium 不支持精确参考',
      AI_MODELS.NOVELAI_V5_FULL_MEDIUM,
      {
        novelAi: {
          preciseReferences: [
            {
              url: 'https://example.com/ref.png',
              kind: 'character',
              strength: 1,
            },
          ],
        },
      },
      undefined,
      'not supported',
    ],
    [
      'V5 与遮罩重绘叠加（charRefInpainting=false）',
      V5,
      {
        inpaintMask: 'https://example.com/mask.png',
        novelAi: {
          preciseReferences: [
            {
              url: 'https://example.com/ref.png',
              kind: 'character',
              strength: 1,
            },
          ],
        },
      },
      ['https://example.com/base.png'],
      'inpainting',
    ],
    [
      'V5 不支持 fidelity',
      V5,
      {
        novelAi: {
          preciseReferences: [
            {
              url: 'https://example.com/ref.png',
              kind: 'character',
              strength: 1,
              fidelity: 0.5,
            },
          ],
        },
      },
      undefined,
      'fidelity',
    ],
    [
      'V4.5 不支持 outfit',
      V45,
      {
        novelAi: {
          preciseReferences: [
            {
              url: 'https://example.com/outfit.png',
              kind: 'outfit',
              strength: 1,
            },
          ],
        },
      },
      undefined,
      'outfit',
    ],
    [
      'V4.5 强度超出 0–1',
      V45,
      {
        novelAi: {
          preciseReferences: [
            {
              url: 'https://example.com/ref.png',
              kind: 'character',
              strength: 2.5,
            },
          ],
        },
      },
      undefined,
      'between 0 and 1',
    ],
    [
      '精确参考不允许 SVG',
      V45,
      {
        novelAi: {
          preciseReferences: [
            {
              url: 'https://example.com/vector.svg',
              kind: 'character',
              strength: 1,
            },
          ],
        },
      },
      undefined,
      'SVG',
    ],
  ])(
    '精确参考不成立（%s）：上传前就拒',
    async (_label, modelId, advancedParams, referenceImages, expected) => {
      await expect(
        nai(modelId, advancedParams, { referenceImages }),
      ).rejects.toThrow(expected)
    },
  )

  it('V4.5 与 V5 多图精确参考按各自契约放行（V4.5 可叠加重绘，V5 支持 outfit / 0–5 / preferSameOutfit）', async () => {
    await expect(
      nai(
        V45,
        {
          inpaintMask: 'https://example.com/mask.png',
          novelAi: {
            preciseReferences: [
              {
                url: 'https://example.com/char.png',
                kind: 'character',
                strength: 0.8,
                fidelity: 0.4,
              },
              {
                url: 'https://example.com/style.png',
                kind: 'style',
                strength: 0.6,
                fidelity: 0.9,
              },
            ],
          },
        },
        { referenceImages: ['https://example.com/base.png'] },
      ),
    ).resolves.toMatchObject(routeOf(V45))

    await expect(
      nai(
        V5,
        {
          novelAi: {
            preciseReferences: [
              {
                url: 'https://example.com/char.png',
                kind: 'character',
                strength: 2.5,
                preferSameOutfit: true,
              },
              {
                url: 'https://example.com/outfit.png',
                kind: 'outfit',
                strength: 1.5,
              },
            ],
          },
        },
        { referenceImages: ['https://example.com/base.png'] },
      ),
    ).resolves.toMatchObject(routeOf(V5))
  })

  it('非 NovelAI 型号带 NovelAI 专属参数：拒', async () => {
    await expect(
      nai(AI_MODELS.SEEDREAM_55_VOLCENGINE, { ucPreset: 'heavy' }),
    ).rejects.toMatchObject({
      message: 'Unsupported ucPreset for the selected model',
    })
  })

  // 遮罩要一张底图，且模型得真有 inpaint 模型可换。
  it.each([V5, V45])('%s：遮罩配恰好一张底图放行', async (modelId) => {
    await expect(
      nai(
        modelId,
        { inpaintMask: 'https://cdn.example.com/mask.png' },
        { referenceImages: ['https://cdn.example.com/a.png'] },
      ),
    ).resolves.toMatchObject(routeOf(modelId))
  })

  it.each([
    ['no reference image', [] as string[]],
    ['two reference images', ['https://a/1.png', 'https://a/2.png']],
  ])('遮罩配 %s：拒', async (_label, refs) => {
    await expect(
      nai(
        V5,
        { inpaintMask: 'https://cdn.example.com/mask.png' },
        { referenceImages: refs },
      ),
    ).rejects.toMatchObject({
      message: 'Inpainting requires exactly one reference image to repaint.',
    })
  })

  it('画中文字超过 750 字：拒', async () => {
    await expect(
      nai(V5, {
        novelAiSceneTexts: [{ kind: 'other', text: 'x'.repeat(751) }],
      }),
    ).rejects.toMatchObject({
      message: 'Text in the image is limited to 750 characters',
    })
  })

  it('NovelAI 合法自定义/预设宽高放行；非 NAI、单边或超像素上限均拒', async () => {
    await expect(
      nai(V5, { novelAiWidth: 1024, novelAiHeight: 1536 }),
    ).resolves.toMatchObject(routeOf(V5))

    await expect(
      nai(AI_MODELS.SEEDREAM_55_VOLCENGINE, {
        novelAiWidth: 1024,
        novelAiHeight: 1536,
      }),
    ).rejects.toMatchObject({
      message: 'NovelAI dimensions are only supported for NovelAI models',
    })

    await expect(nai(V5, { novelAiWidth: 1024 })).rejects.toMatchObject({
      message: 'NovelAI width and height must be provided together',
    })

    await expect(
      nai(V5, { novelAiWidth: 2048, novelAiHeight: 2048 }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('total pixels'),
    })
  })
})

/**
 * owner 2026-09-27：提示词长度只认模型自己声明的上限（厂商硬上限）；没声明就不拦。
 * 此前这里用 `validatePrompt` 的缺省 4000，所有图片模型都被砍到 4000。
 */
describe('提示词长度', () => {
  it('型号没声明上限：超过旧的 4000 也放行', async () => {
    await expect(
      validate({
        modelId: AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE,
        prompt: '雨夜的城市街头，霓虹灯倒映在积水里。'.repeat(300),
      }),
    ).resolves.toMatchObject(routeOf(AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE))
  })

  it('超过型号声明的厂商上限：选路之前就拒', async () => {
    // Ideogram 3 已下架：要是先走了选路，报的会是「型号不可用」。
    await expect(
      validate({ modelId: AI_MODELS.IDEOGRAM_3, prompt: 'a'.repeat(1001) }),
    ).rejects.toThrow(/exceeds maximum length of 1000/)
  })
})

// GPT Image 的 SVG 输出不能回头当参考图：两个字段都查，拦成 400，不碰网络。
describe('SVG 参考图', () => {
  it.each([
    ['referenceImages', { referenceImages: ['https://cdn.example.com/a.svg'] }],
    [
      'referenceImage',
      { referenceImage: 'data:image/svg+xml;base64,PHN2Zy8+' },
    ],
  ])('%s 里有 SVG：拒', async (_label, refs) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await expect(
      validate({ modelId: AI_MODELS.SEEDREAM_50_PRO_VOLCENGINE, ...refs }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 400,
      message: "SVG images can't be used as input. Convert it to PNG first.",
    })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

/* ─── 参考图 / 遮罩预处理 ─────────────────────────────────────────────── */

const png = (
  width: number,
  height: number,
  background: string = '#ffffff',
): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 3, background } })
    .png()
    .toBuffer()
function host(url: string, buffer: Buffer) {
  fakeBucket.remote.set(url, { buffer, mimeType: 'image/png' })
}
const lastUpload = () => {
  const key = fakeBucket.uploads.at(-1)!
  return { url: `${FAKE_CDN}/${key}`, data: fakeBucket.objects.get(key)! }
}
const timer = (addNote = vi.fn()) =>
  ({
    measure: (_stage: unknown, fn: () => Promise<unknown>) => fn(),
    addNote,
  }) as never

describe('prepareIdeogramInpaintMask', () => {
  const SOURCE = 'https://elsewhere.test/source.png'
  const MASK = 'https://elsewhere.test/mask.png'

  it('只把交给厂商的遮罩反过来；尺寸要对、不能全空也不能全改', async () => {
    host(SOURCE, await png(2, 1, '#aaaaaa'))
    host(
      MASK,
      await sharp(Buffer.from([0, 255]), {
        raw: { width: 2, height: 1, channels: 1 },
      })
        .png()
        .toBuffer(),
    )

    const negated = await prepareIdeogramInpaintMask(me.id, SOURCE, MASK)

    expect(negated).toBe(lastUpload().url)
    const pixels = await sharp(lastUpload().data)
      .toColourspace('b-w')
      .raw()
      .toBuffer()
    expect([...pixels]).toEqual([255, 0])

    host(MASK, await png(2, 1, '#aaaaaa'))
    await expect(
      prepareIdeogramInpaintMask(me.id, SOURCE, MASK),
    ).rejects.toThrow('editable region')

    host(MASK, await png(1, 1, '#000000'))
    await expect(
      prepareIdeogramInpaintMask(me.id, SOURCE, MASK),
    ).rejects.toThrow('same dimensions')
  })
})

describe('uploadNovelAiPreciseReferencesIfNeeded', () => {
  it.each([
    ['竖图 → 1024×1536', 12, 24, 1024, 1536],
    ['横图 → 1536×1024', 24, 12, 1536, 1024],
    ['方图 → 1472×1472', 20, 20, 1472, 1472],
  ])(
    '精确参考三档比例黑边分桶（%s）',
    async (_label, srcWidth, srcHeight, expectedWidth, expectedHeight) => {
      const sourceUrl = `${FAKE_CDN}/source-${srcWidth}x${srcHeight}.png`
      host(sourceUrl, await png(srcWidth, srcHeight))

      const result = await uploadNovelAiPreciseReferencesIfNeeded({
        userId: me.id,
        input: {
          modelId: AI_MODELS.NOVELAI_V45_FULL,
          prompt: '1girl',
          advancedParams: {
            novelAi: {
              preciseReferences: [
                { url: sourceUrl, kind: 'character', strength: 0.8 },
              ],
            },
          },
        } as GenerateRequest,
        timer: timer(),
      })

      expect(result?.novelAi?.preciseReferences).toEqual([
        { url: lastUpload().url, kind: 'character', strength: 0.8 },
      ])
      const { data, info } = await sharp(lastUpload().data)
        .raw()
        .toBuffer({ resolveWithObject: true })
      expect([info.width, info.height]).toEqual([expectedWidth, expectedHeight])
      // 边角为黑边（竖/横图的 1:2 或 2:1 在 2:3 或 3:2 桶里总有一侧留黑边；方图在 1:1 桶里全满白色）
      if (srcWidth !== srcHeight) {
        expect(Array.from(data.subarray(0, 3))).toEqual([0, 0, 0])
      }
      const cx = Math.floor(info.width / 2)
      const cy = Math.floor(info.height / 2)
      const center = (cy * info.width + cx) * info.channels
      expect(Array.from(data.subarray(center, center + 3))).toEqual([
        255, 255, 255,
      ])
    },
  )

  it.each([
    ['V5 竖图 1:2 → 704×1408 (cover 无黑边)', 12, 24, 704, 1408],
    ['V5 横图 2:1 → 1408×704 (cover 无黑边)', 24, 12, 1408, 704],
    ['V5 方图 1:1 → 1024×1024 (cover 无黑边)', 20, 20, 1024, 1024],
  ])(
    'V5 精确参考 97 档 cover 分桶（%s）',
    async (_label, srcWidth, srcHeight, expectedWidth, expectedHeight) => {
      const sourceUrl = `${FAKE_CDN}/v5-source-${srcWidth}x${srcHeight}.png`
      host(sourceUrl, await png(srcWidth, srcHeight))

      const result = await uploadNovelAiPreciseReferencesIfNeeded({
        userId: me.id,
        modelId: AI_MODELS.NOVELAI_V5_FULL,
        input: {
          modelId: AI_MODELS.NOVELAI_V5_FULL,
          prompt: '1girl',
          advancedParams: {
            novelAi: {
              preciseReferences: [
                { url: sourceUrl, kind: 'outfit', strength: 1.5 },
              ],
            },
          },
        } as GenerateRequest,
        timer: timer(),
      })

      expect(result?.novelAi?.preciseReferences).toEqual([
        { url: lastUpload().url, kind: 'outfit', strength: 1.5 },
      ])
      const { data, info } = await sharp(lastUpload().data)
        .raw()
        .toBuffer({ resolveWithObject: true })
      expect([info.width, info.height]).toEqual([expectedWidth, expectedHeight])
      // cover 模式不垫黑边，角点也是白色
      expect(Array.from(data.subarray(0, 3))).toEqual([255, 255, 255])
    },
  )

  it('已在自有 R2 且正好命中目标分桶的 PNG 直接复用，不再重编上传', async () => {
    const readyUrl = `${FAKE_CDN}/already-bucketed.png`
    host(readyUrl, await png(1024, 1536))
    const addNote = vi.fn()

    const result = await uploadNovelAiPreciseReferencesIfNeeded({
      userId: me.id,
      input: {
        modelId: AI_MODELS.NOVELAI_V45_FULL,
        prompt: '1girl',
        advancedParams: {
          novelAi: {
            preciseReferences: [
              { url: readyUrl, kind: 'character', strength: 1 },
            ],
          },
        },
      } as GenerateRequest,
      timer: timer(addNote),
    })

    expect(result?.novelAi?.preciseReferences?.[0]?.url).toBe(readyUrl)
    expect(fakeBucket.uploads).toHaveLength(0)
    expect(addNote).toHaveBeenCalledWith(
      'novelai_precise_reference_already_bucketed',
    )
  })
})

describe('uploadReferenceImagesIfNeeded', () => {
  describe('NovelAI 图生图的参考图尺寸', () => {
    async function run(width: number, height: number, ownUrl: boolean) {
      const url = ownUrl
        ? `${FAKE_CDN}/source.png`
        : 'https://elsewhere.test/source.png'
      host(url, await png(width, height))
      const addNote = vi.fn()
      const result = await uploadReferenceImagesIfNeeded({
        userId: me.id,
        input: {
          modelId: AI_MODELS.NOVELAI_V45_FULL,
          prompt: '1girl',
          referenceImages: [url],
        } as GenerateRequest,
        timer: timer(addNote),
        novelAiImg2ImgSize: { width: 64, height: 48 },
      })
      return { url, result, uploads: fakeBucket.uploads.length, addNote }
    }

    it('我们自己的 PNG 已经是出图尺寸：原样用，不再上传', async () => {
      const { url, result, uploads, addNote } = await run(64, 48, true)
      expect(result).toEqual([url])
      expect(uploads).toBe(0)
      expect(addNote).toHaveBeenCalledWith('novelai_reference_already_sized')
    })

    it('尺寸不对：缩好再传', async () => {
      const { result, uploads } = await run(128, 128, true)
      expect(uploads).toBe(1)
      expect(result).toEqual([lastUpload().url])
      const meta = await sharp(lastUpload().data).metadata()
      expect([meta.width, meta.height]).toEqual([64, 48])
    })

    it('外站的图尺寸对也要重传一份', async () => {
      const { uploads } = await run(64, 48, false)
      expect(uploads).toBe(1)
    })
  })
})
