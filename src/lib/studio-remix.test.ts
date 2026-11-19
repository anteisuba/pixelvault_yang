import { describe, expect, it } from 'vitest'

import type { StudioModelOption } from '@/types/model-option'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { GenerationRecord } from '@/types'

import {
  buildStudioRemixPreset,
  getGenerationPromptPreview,
  getGenerationRemixCharacters,
  getGenerationUserPrompt,
  parseGenerationSnapshot,
  readCompiledCharacterHandles,
  stripCompiledCharacterPrefix,
} from '@/lib/studio-remix'

function makeGeneration(
  overrides?: Partial<GenerationRecord>,
): GenerationRecord {
  return {
    id: 'gen_1',
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
    outputType: 'IMAGE',
    status: 'COMPLETED',
    url: 'https://example.com/image.png',
    storageKey: 'image.png',
    mimeType: 'image/png',
    width: 1024,
    height: 1024,
    prompt: 'final compiled prompt',
    model: 'gemini-3.1-flash-image-preview',
    provider: 'Google',
    requestCount: 2,
    isPublic: false,
    isPromptPublic: false,
    ...overrides,
  }
}

const modelOptions: StudioModelOption[] = [
  {
    optionId: 'key:key_1',
    modelId: 'gemini-3.1-flash-image-preview',
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    providerConfig: { label: 'Gemini', baseUrl: 'https://example.com' },
    requestCount: 2,
    isBuiltIn: true,
    sourceType: 'saved',
    keyId: 'key_1',
  },
  {
    optionId: 'workspace:gemini-3.1-flash-image-preview',
    modelId: 'gemini-3.1-flash-image-preview',
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    providerConfig: { label: 'Gemini', baseUrl: 'https://example.com' },
    requestCount: 2,
    isBuiltIn: true,
    sourceType: 'workspace',
  },
]

describe('studio-remix helpers', () => {
  it('parses a valid generation snapshot', () => {
    const snapshot = parseGenerationSnapshot({
      freePrompt: 'a sailor on the pier',
      compiledPrompt: 'masterpiece, a sailor on the pier',
      modelId: 'gemini-3.1-flash-image-preview',
      aspectRatio: '16:9',
    })

    expect(snapshot?.freePrompt).toBe('a sailor on the pier')
    expect(snapshot?.aspectRatio).toBe('16:9')
  })

  it('returns null for an invalid snapshot', () => {
    expect(parseGenerationSnapshot({ foo: 'bar' })).toBeNull()
  })

  it('prefers snapshot prompt, aspect ratio, and saved route when remixing', () => {
    const preset = buildStudioRemixPreset(
      makeGeneration({
        prompt: 'compiled provider prompt',
        snapshot: {
          freePrompt: 'cinematic portrait',
          compiledPrompt: 'cinematic portrait, bokeh lighting',
          modelId: 'gemini-3.1-flash-image-preview',
          aspectRatio: '16:9',
          apiKeyId: 'key_1',
        },
      }),
      modelOptions,
    )

    expect(preset.prompt).toBe('cinematic portrait')
    expect(preset.aspectRatio).toBe('16:9')
    expect(preset.optionId).toBe('key:key_1')
  })

  it('falls back to generation fields and nearest supported aspect ratio', () => {
    const preset = buildStudioRemixPreset(
      makeGeneration({
        width: 720,
        height: 1280,
        model: 'gemini-3.1-flash-image-preview',
        snapshot: null,
      }),
      modelOptions,
    )

    expect(preset.prompt).toBe('final compiled prompt')
    expect(preset.aspectRatio).toBe('9:16')
    expect(preset.optionId).toBe('key:key_1')
  })

  it('falls back to the nearest 4:3 family aspect ratio when remixing', () => {
    const landscapePreset = buildStudioRemixPreset(
      makeGeneration({
        width: 1024,
        height: 768,
        snapshot: null,
      }),
      modelOptions,
    )
    const portraitPreset = buildStudioRemixPreset(
      makeGeneration({
        width: 768,
        height: 1024,
        snapshot: null,
      }),
      modelOptions,
    )

    expect(landscapePreset.aspectRatio).toBe('4:3')
    expect(portraitPreset.aspectRatio).toBe('3:4')
  })

  it('returns advancedParams from snapshot when present (V2)', () => {
    const preset = buildStudioRemixPreset(
      makeGeneration({
        snapshot: {
          freePrompt: 'test prompt',
          compiledPrompt: 'test prompt enhanced',
          modelId: 'gemini-3.1-flash-image-preview',
          aspectRatio: '1:1',
          advancedParams: {
            negativePrompt: 'blurry',
            guidanceScale: 7.5,
            steps: 30,
            seed: 12345,
          },
        },
      }),
      modelOptions,
    )

    expect(preset.advancedParams).toEqual({
      negativePrompt: 'blurry',
      guidanceScale: 7.5,
      steps: 30,
      seed: 12345,
    })
  })

  it('returns undefined advancedParams when snapshot has none', () => {
    const preset = buildStudioRemixPreset(
      makeGeneration({
        snapshot: {
          freePrompt: 'test prompt',
          compiledPrompt: 'test prompt enhanced',
          modelId: 'gemini-3.1-flash-image-preview',
          aspectRatio: '1:1',
        },
      }),
      modelOptions,
    )

    expect(preset.advancedParams).toBeUndefined()
  })

  it('uses the preview prompt derived from snapshot freePrompt when available', () => {
    const prompt = getGenerationPromptPreview(
      makeGeneration({
        prompt: 'compiled provider prompt',
        snapshot: {
          freePrompt: 'original short prompt',
          compiledPrompt: 'compiled provider prompt',
          modelId: 'gemini-3.1-flash-image-preview',
          aspectRatio: '1:1',
        },
      }),
    )

    expect(prompt).toBe('original short prompt')
  })
})

/** 与 `card-bus-compile.ts` 编出来的前缀同形（服务端再拼「前缀 + 空行 + 用户原话」）。 */
const WITH_LEGEND = [
  '[Character: @Aemeath]',
  '',
  '[Character: @Denia]',
  '',
  'Reference images:',
  'Image 1 = @Aemeath main portrait',
  'Image 2 = @Denia main portrait',
  "Keep @Aemeath's face, hairstyle, hair colors and outfit identical to Image 1.",
  "Keep @Denia's face, hairstyle, hair colors and outfit identical to Image 2.",
  '',
  'two girls on a rooftop at dusk',
].join('\n')

const WITHOUT_LEGEND = [
  '[Character: @Aemeath (爱弥斯)]',
  'silver hair, red eyes',
  '',
  '[Character: @Denia (达妮娅)]',
  '',
  'walking in the rain',
].join('\n')

describe('stripCompiledCharacterPrefix', () => {
  it('有参考图图例：剥掉角色段 + 图例 + Keep 行', () => {
    expect(stripCompiledCharacterPrefix(WITH_LEGEND)).toBe(
      'two girls on a rooftop at dusk',
    )
  })

  it('没图例：剥掉开头连续的角色段（含外观行）', () => {
    expect(stripCompiledCharacterPrefix(WITHOUT_LEGEND)).toBe(
      'walking in the rain',
    )
  })

  it('不是编译串：原样返回', () => {
    expect(stripCompiledCharacterPrefix('a cat, [Character: @x]')).toBe(
      'a cat, [Character: @x]',
    )
  })

  it('用户正文本身多段：只剥前缀，正文里的空行留着', () => {
    expect(
      stripCompiledCharacterPrefix(
        '[Character: @Aemeath]\n\nfirst paragraph\n\nsecond paragraph',
      ),
    ).toBe('first paragraph\n\nsecond paragraph')
  })
})

describe('readCompiledCharacterHandles', () => {
  it('按出现顺序认出 @handle（带名字括号的也认）', () => {
    expect(readCompiledCharacterHandles(WITH_LEGEND)).toEqual([
      'Aemeath',
      'Denia',
    ])
    expect(readCompiledCharacterHandles(WITHOUT_LEGEND)).toEqual([
      'Aemeath',
      'Denia',
    ])
  })

  it('不是编译串：一个都没有', () => {
    expect(readCompiledCharacterHandles('plain prompt')).toEqual([])
  })
})

describe('getGenerationUserPrompt / getGenerationRemixCharacters', () => {
  it('快照里存了原话就用原话', () => {
    const generation = makeGeneration({
      prompt: WITH_LEGEND,
      snapshot: { freePrompt: 'my own words' },
    })
    expect(getGenerationUserPrompt(generation)).toBe('my own words')
    expect(getGenerationPromptPreview(generation)).toBe('my own words')
  })

  it('旧作品没存原话：从编译串里剥', () => {
    const generation = makeGeneration({ prompt: WITH_LEGEND })
    expect(getGenerationUserPrompt(generation)).toBe(
      'two girls on a rooftop at dusk',
    )
  })

  it('快照其它格不合法也不连累原话（比例不在枚举里）', () => {
    const generation = makeGeneration({
      prompt: WITH_LEGEND,
      snapshot: { freePrompt: 'kept', aspectRatio: 'not-a-ratio' },
    })
    expect(getGenerationUserPrompt(generation)).toBe('kept')
  })

  it('重混的提示词是原话，不是编译串', () => {
    const generation = makeGeneration({ prompt: WITH_LEGEND })
    expect(buildStudioRemixPreset(generation, modelOptions).prompt).toBe(
      'two girls on a rooftop at dusk',
    )
  })

  it('角色：快照里有卡 id（含造型）就用 id，否则从前缀认 handle', () => {
    expect(
      getGenerationRemixCharacters(
        makeGeneration({
          prompt: WITH_LEGEND,
          snapshot: { characterCards: [{ id: 'card_1', lookId: 'look_2' }] },
        }),
      ),
    ).toEqual({ kind: 'ids', cards: [{ id: 'card_1', lookId: 'look_2' }] })
    expect(
      getGenerationRemixCharacters(makeGeneration({ prompt: WITH_LEGEND })),
    ).toEqual({ kind: 'handles', handles: ['Aemeath', 'Denia'] })
  })
})

describe('重混回到原型号（11-19 真机：Flash Lite 的图重混成了 3 Pro）', () => {
  const sharedKeyOptions: StudioModelOption[] = [
    {
      optionId: 'key:key_gemini',
      modelId: 'gemini-3-pro-image-preview',
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      providerConfig: { label: 'Gemini', baseUrl: 'https://example.com' },
      requestCount: 1,
      isBuiltIn: true,
      sourceType: 'saved',
      keyId: 'key_gemini',
    },
    {
      optionId: 'workspace:gemini-3.1-flash-lite-image',
      modelId: 'gemini-3.1-flash-lite-image',
      adapterType: AI_ADAPTER_TYPES.GEMINI,
      providerConfig: { label: 'Gemini', baseUrl: 'https://example.com' },
      requestCount: 1,
      isBuiltIn: true,
      sourceType: 'workspace',
    },
  ]

  it('快照的 key 挂在别的型号上：不认它，回到这张图实际用的型号', () => {
    const preset = buildStudioRemixPreset(
      makeGeneration({
        model: 'gemini-3.1-flash-lite-image',
        snapshot: {
          compiledPrompt: 'p',
          modelId: 'gemini-3.1-flash-lite-image',
          aspectRatio: '16:9',
          apiKeyId: 'key_gemini',
        },
      }),
      sharedKeyOptions,
    )
    expect(preset.optionId).toBe('workspace:gemini-3.1-flash-lite-image')
  })

  it('同型号多条线路：按快照的 key 挑回原线路', () => {
    const preset = buildStudioRemixPreset(
      makeGeneration({
        snapshot: {
          compiledPrompt: 'p',
          modelId: 'gemini-3.1-flash-image-preview',
          aspectRatio: '1:1',
          apiKeyId: 'key_1',
        },
      }),
      [...modelOptions].reverse(),
    )
    expect(preset.optionId).toBe('key:key_1')
  })

  it('目录里没有这个型号：null（调用方保持当前选择），⛔ 退到同家别的型号', () => {
    const preset = buildStudioRemixPreset(
      makeGeneration({ model: 'gemini-retired-image' }),
      sharedKeyOptions,
    )
    expect(preset.optionId).toBeNull()
  })
})

describe('重混挂回当时勾的图', () => {
  it('快照记了 imagePicks 就带出来；没记就是 undefined', () => {
    const remix = getGenerationRemixCharacters(
      makeGeneration({
        snapshot: {
          characterCards: [
            { id: 'card_1', imagePicks: [{ slotId: 'slot_main' }] },
            { id: 'card_2' },
          ],
        },
      }),
    )
    expect(remix.kind).toBe('ids')
    if (remix.kind !== 'ids') return
    expect(remix.cards[0]?.imagePicks).toEqual([{ slotId: 'slot_main' }])
    expect(remix.cards[1]?.imagePicks).toBeUndefined()
  })

  it('imagePicks 格式坏了只丢这一格，角色照样挂回', () => {
    const remix = getGenerationRemixCharacters(
      makeGeneration({
        snapshot: { characterCards: [{ id: 'card_1', imagePicks: 'oops' }] },
      }),
    )
    expect(remix).toEqual({
      kind: 'ids',
      cards: [{ id: 'card_1', imagePicks: undefined }],
    })
  })
})
