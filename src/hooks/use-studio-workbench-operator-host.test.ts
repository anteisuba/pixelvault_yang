import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 宿主契约的 `results`（切片 3a）—— **结果行卡的唯一数据源**。
 *
 * ⭐ 这一格存在的理由：此前映射长在面板里（`useStudioGenOptional()?.activeRun`），
 * 而 `/studio/lora` 故意不挂 `<StudioProvider>` —— 那条路上它恒空，结果行卡在
 * LoRA 装配台上**结构性地**永远不可能出现。搬到宿主之后，两个宿主各自映射自己的
 * 结果列，面板一行都不用判自己挂在哪儿。
 *
 * 钉三件事：
 *  ① 只收**跑完且有地址**的那些（在飞的格子画出来是一个永远转着的骨架）；
 *  ② `thumbnailUrl` 与 `url` 分开带（视频的 url 是媒体本身，喂 `next/image`
 *     得到一个碎图标）；
 *  ③ 没有 `<StudioProvider>` 时整格是空数组，⛔ 不抛（面板也挂在装配台上）。
 */

const useStudioGenOptional = vi.hoisted(() => vi.fn())
/** 表单 dispatch —— 第二期的具名槽落地那一跳走的就是它。 */
const dispatch = vi.hoisted(() => vi.fn())
const addReferenceImage = vi.hoisted(() => vi.fn())
const removeReferenceImage = vi.hoisted(() => vi.fn())
const formState = vi.hoisted(() => ({
  videoReferenceVideos: [] as string[],
  overrides: {} as Record<string, unknown>,
}))
const references = vi.hoisted(() => ({ entries: [] as { url: string }[] }))
const modelOptions = vi.hoisted(() => [
  { optionId: 'openai-test', modelId: 'gpt-image-test' },
])
const setReferenceImage = vi.hoisted(() => vi.fn())
const routerPush = vi.hoisted(() => vi.fn())
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}))

/**
 * 模型显示名那张词表（`Models.*.label`）—— 这个 hook 从 2026-09-12 起读它，好让
 * 生成确认卡上写的是显示名而不是 id。⚠ 测试里没有 `NextIntlClientProvider`，
 * 桩成「回 key」就够：这一层验的是宿主契约，不是词表。
 */
vi.mock('next-intl', () => ({
  /**
   * ⚠ 带值的键把值一起串出来：四张脸那一句（`face.*.context`）验的正是「值跟着
   * 宿主状态变」，回一个光秃秃的 key 会让那条断言恒真。
   */
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}|${Object.values(values).join('·')}` : key,
}))

vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({
    state: {
      prompt: '',
      advancedParams: {},
      aspectRatio: '1:1',
      imageBatchCount: 1,
      workflowMode: 'quick',
      recipeUsage: null,
      extraModelOptionIds: [],
      stylePresetId: '',
      longVideoMode: false,
      longVideoTargetDuration: 30,
      videoDuration: 5,
      videoResolution: null,
      videoAudioRefs: [],
      videoGenerateAudio: null,
      videoMode: 'keyframe',
      outputType: 'image',
      selectedOptionId: null,
      panels: { enhance: false },
      videoFrameSlots: { first: null, last: null },
      get videoReferenceVideos() {
        return formState.videoReferenceVideos
      },
      ...formState.overrides,
    },
    dispatch,
  }),
  useStudioData: () => ({
    imageUpload: {
      referenceEntries: references.entries,
      setReferenceImage,
      maxImages: 4,
      addReferenceImage,
      removeReferenceImage,
    },
  }),
  useStudioGenOptional,
}))

vi.mock('@/hooks/use-image-model-options', () => ({
  useImageModelOptions: () => ({ modelOptions, selectedModel: null }),
}))
vi.mock('@/hooks/use-video-model-options', () => ({
  useVideoModelOptions: () => ({ modelOptions, selectedModel: null }),
}))
vi.mock('@/hooks/use-operator-user-url-mount', () => ({
  useOperatorUserUrlMount: () => ({
    mountUserUrl: vi.fn(),
    unmountUserUrl: vi.fn(),
  }),
}))
const EMPTY_CONTROLS = {
  model: null,
  models: [],
  aspectRatio: '1:1',
  resolution: null,
  count: 1,
  choicesByModel: {},
}

vi.mock('@/lib/studio-operator-snapshot', () => ({
  buildImageOperatorSnapshot: () => ({ prompt: '', availableModels: [] }),
  buildVideoOperatorSnapshot: () => ({ prompt: '', availableModels: [] }),
  /**
   * 四颗旋钮那份视图（#9）。
   * ⚠ **张数 / 比例原样透传**：D7b 的域标记那一句读的就是它，桩成常量会让
   *   「改张数胶囊跟着刷」那条断言恒真。
   */
  buildImageGenerationControls: (input: {
    aspectRatio: string
    count: number
  }) => ({
    ...EMPTY_CONTROLS,
    aspectRatio: input.aspectRatio,
    count: input.count,
  }),
  buildVideoGenerationControls: (input: { aspectRatio: string }) => ({
    ...EMPTY_CONTROLS,
    aspectRatio: input.aspectRatio,
  }),
}))

import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import {
  STUDIO_OPERATOR_FACE_PILLS,
  STUDIO_OPERATOR_FACE_PILL_LIMIT,
} from '@/constants/studio-assistant-operator'
import { useStudioWorkbenchOperatorHost } from '@/hooks/use-studio-workbench-operator-host'
import { buildGenerationDisplayName } from '@/lib/generation-name'

function runItem(
  id: string,
  status: string,
  generation: Record<string, unknown> | null,
) {
  return { id, status, generation }
}

describe('useStudioWorkbenchOperatorHost 的 results 映射', () => {
  it('只收跑完且有地址的那些，缩略图与地址分开带', () => {
    useStudioGenOptional.mockReturnValue({
      activeRun: {
        items: [
          runItem('item-1', 'generating', null),
          runItem('item-2', 'completed', {
            id: 'gen-2',
            url: 'https://cdn.test/b.png',
            thumbnailUrl: 'https://cdn.test/b-thumb.png',
            prompt: '一把红伞',
            seq: 21,
            outputType: 'IMAGE',
          }),
          // ⚠ 跑完了却没有地址 —— 也不收：画出来是一个空格子。
          runItem('item-3', 'completed', { id: 'gen-3', url: '' }),
          runItem('item-4', 'failed', null),
        ],
      },
    })

    const { result } = renderHook(() => useStudioWorkbenchOperatorHost())
    expect(result.current.results).toEqual([
      {
        id: 'gen-2',
        url: 'https://cdn.test/b.png',
        thumbnailUrl: 'https://cdn.test/b-thumb.png',
        // ⭐ 切片 N1：结果格的 label 是**产物名**（`图_0xx·一把红伞`），因为它
        //    同时是用户照着打出来指认这一张的那串字。
        label: buildGenerationDisplayName({
          seq: 21,
          prompt: '一把红伞',
        }),
        // 角标与 `@` 指认的本钱：列表口读到的**真序号**（⛔ 不是派生值）。
        seq: 21,
        outputType: 'IMAGE',
      },
    ])
  })

  it('没有 <StudioProvider> 时是空数组 —— ⛔ 不抛（面板也挂在 LoRA 装配台上）', () => {
    useStudioGenOptional.mockReturnValue(undefined)
    const { result } = renderHook(() => useStudioWorkbenchOperatorHost())
    expect(result.current.results).toEqual([])
  })
})

/**
 * 具名槽落地（第二期 · 视频域）。
 *
 * ⭐ 锁的是「挂到哪儿」在宿主这一跳**分成了三条真的不同的路**：首尾帧走
 * `SET_VIDEO_FRAME_SLOT`（覆盖写那一格）、参考视频走
 * `SET_VIDEO_REFERENCE_VIDEOS`、默认档照旧走 `imageUpload`。
 * ⛔ 三条合成一条的表现是「助手说换了尾帧，画面上换的是首帧」——两张图看上去
 *    都很合理，没人查得出来。
 */
describe('useStudioWorkbenchOperatorHost 的 addReference/removeReference 分槽', () => {
  beforeEach(() => {
    dispatch.mockClear()
    addReferenceImage.mockClear()
    removeReferenceImage.mockClear()
    formState.videoReferenceVideos = []
    useStudioGenOptional.mockReturnValue(undefined)
  })

  it.each([['first'], ['last']] as const)(
    'slot=%s 写进具名槽，撤销把**那一格**清空（⛔ 不动另一格）',
    (slot) => {
      const { result } = renderHook(() => useStudioWorkbenchOperatorHost())
      result.current.apply.addReference('https://cdn.test/f.png', slot)
      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_VIDEO_FRAME_SLOT',
        payload: { slot, url: 'https://cdn.test/f.png' },
      })

      result.current.apply.removeReference('https://cdn.test/f.png', slot)
      expect(dispatch).toHaveBeenLastCalledWith({
        type: 'SET_VIDEO_FRAME_SLOT',
        payload: { slot, url: null },
      })
      // 帧槽一路都没碰参考图列表。
      expect(addReferenceImage).not.toHaveBeenCalled()
    },
  )

  it('slot=video 走参考视频列表，按 URL 去重', () => {
    const { result } = renderHook(() => useStudioWorkbenchOperatorHost())
    result.current.apply.addReference('https://cdn.test/a.mp4', 'video')
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_VIDEO_REFERENCE_VIDEOS',
      payload: ['https://cdn.test/a.mp4'],
    })

    formState.videoReferenceVideos = ['https://cdn.test/a.mp4']
    dispatch.mockClear()
    result.current.apply.addReference('https://cdn.test/a.mp4', 'video')
    expect(dispatch).not.toHaveBeenCalled()

    result.current.apply.removeReference('https://cdn.test/a.mp4', 'video')
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_VIDEO_REFERENCE_VIDEOS',
      payload: [],
    })
  })

  it('没写 slot 就是默认档 —— 照旧走 imageUpload（图片域一个字都没变）', () => {
    const { result } = renderHook(() => useStudioWorkbenchOperatorHost())
    result.current.apply.addReference('https://cdn.test/a.png')
    expect(addReferenceImage).toHaveBeenCalledWith('https://cdn.test/a.png')
    expect(dispatch).not.toHaveBeenCalled()
  })
})

describe('useStudioWorkbenchOperatorHost 的 face（D7b ③）', () => {
  beforeEach(() => {
    formState.overrides = {}
  })

  it('① 图片档：那一句带模型 · 比例 · 张数，改张数就跟着刷', () => {
    const { result, rerender } = renderHook(() =>
      useStudioWorkbenchOperatorHost(),
    )
    expect(result.current.face.contextLine()).toBe(
      'face.image.context|face.noModel·1:1·1',
    )

    formState.overrides = { imageBatchCount: 4 }
    rerender()
    expect(result.current.face.contextLine()).toBe(
      'face.image.context|face.noModel·1:1·4',
    )
  })

  it('① 视频档换的是另一句（时长而不是张数）', () => {
    formState.overrides = { outputType: 'video', videoDuration: 8 }
    const { result } = renderHook(() => useStudioWorkbenchOperatorHost())
    expect(result.current.face.contextLine()).toBe(
      'face.video.context|face.noModel·1:1·8',
    )
  })

  it('②③ 药丸 ≤ 封顶且来自那张脸；两档的空态句与占位词各不相同', () => {
    const { result, rerender } = renderHook(() =>
      useStudioWorkbenchOperatorHost(),
    )
    const image = result.current.face
    expect(image.starterPills).toEqual(
      STUDIO_OPERATOR_FACE_PILLS[ASSISTANT_PROTOCOL_DOMAIN_IDS.image].map(
        (id) => `face.pill.${id}`,
      ),
    )
    expect(image.starterPills.length).toBeLessThanOrEqual(
      STUDIO_OPERATOR_FACE_PILL_LIMIT,
    )
    expect(image.emptyLine).toBe('face.image.empty')
    expect(image.inputPlaceholder).toBe('face.image.placeholder')

    formState.overrides = { outputType: 'video' }
    rerender()
    expect(result.current.face.emptyLine).toBe('face.video.empty')
    expect(result.current.face.inputPlaceholder).toBe('face.video.placeholder')
  })
})

describe('useStudioWorkbenchOperatorHost 换到另一台的型号（拆分与反推实跑 09-24）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    if (!modelOptions.some((option) => option.optionId === 'nai-v5-full'))
      modelOptions.push({
        optionId: 'nai-v5-full',
        modelId: 'nai-diffusion-5-full',
        adapterType: 'novelai',
        keyId: 'key-nai',
        providerConfig: {
          label: 'NovelAI',
          baseUrl: 'https://image.novelai.net',
        },
      } as (typeof modelOptions)[number])
    formState.overrides = { promptDialect: 'natural' }
  })

  it('自然语言台上换 NovelAI：先换到标签台再选型号，⛔ 不留在原台被默认型号顶掉', () => {
    const { result } = renderHook(() => useStudioWorkbenchOperatorHost())
    const applied = result.current.apply.selectModelChannel?.({
      modelId: 'nai-diffusion-5-full',
      channelId: null,
    })
    expect(applied).toBe(true)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_PROMPT_DIALECT',
      payload: 'tags',
    })
    expect(routerPush).toHaveBeenCalledWith('/studio/image/tags')
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'SET_OPTION_ID',
      payload: expect.any(String),
    })
  })

  it('同一台里换型号不动路由', () => {
    formState.overrides = { promptDialect: 'tags' }
    const { result } = renderHook(() => useStudioWorkbenchOperatorHost())
    result.current.apply.selectModelChannel?.({
      modelId: 'nai-diffusion-5-full',
      channelId: null,
    })
    expect(routerPush).not.toHaveBeenCalled()
  })
})
