import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  {
    optionId: 'openai-test',
    modelId: 'gpt-image-test',
    adapterType: 'openai',
    keyId: 'key-openai',
    providerConfig: {
      label: 'OpenAI',
      baseUrl: 'https://api.openai.com',
    },
  },
])
const imageModelOptions = vi.hoisted(() => ({
  current: null as typeof modelOptions | null,
}))
const setReferenceImage = vi.hoisted(() => vi.fn())
const routerPush = vi.hoisted(() => vi.fn())
const deleteAssistantMemoryAPI = vi.hoisted(() => vi.fn())
const deleteProjectRuleAPI = vi.hoisted(() => vi.fn())
const revertAssistantAssetWriteAPI = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client/assistant-memories', () => ({
  deleteAssistantMemoryAPI,
}))
vi.mock('@/lib/api-client/assistant-persona', () => ({ deleteProjectRuleAPI }))
vi.mock('@/lib/api-client/assistant-operator', () => ({
  revertAssistantAssetWriteAPI,
}))
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
      longVideoMode: false,
      longVideoTargetDuration: 30,
      videoDuration: 5,
      videoResolution: null,
      videoAudioRefs: [],
      videoGenerateAudio: null,
      videoMode: 'keyframe',
      outputType: 'image',
      promptDialect: 'natural',
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
  useImageModelOptions: () => ({
    modelOptions: imageModelOptions.current ?? modelOptions,
    selectedModel: null,
  }),
}))
vi.mock('@/hooks/use-video-model-options', () => ({
  useVideoModelOptions: () => ({ modelOptions, selectedModel: null }),
}))
/** 这一轮跑哪几个 —— 快照的专属 chip 行按它们的并集派生。 */
const runModels = vi.hoisted(() => [
  { optionId: 'lite', modelId: 'seedream-lite' },
  { optionId: 'pro', modelId: 'seedream-pro' },
])
vi.mock('@/hooks/use-studio-run-models', () => ({
  useStudioRunModels: () => ({ runModels }),
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

const buildImageOperatorSnapshot = vi.hoisted(() =>
  vi.fn(() => ({ prompt: '', availableModels: [] })),
)
vi.mock('@/lib/studio-operator-snapshot', () => ({
  buildImageOperatorSnapshot,
  buildVideoOperatorSnapshot: () => ({ prompt: '', availableModels: [] }),
  /**
   * 四颗旋钮那份视图（#9）。
   * ⚠ **张数 / 比例原样透传**：D7b 的域标记那一句读的就是它，桩成常量会让
   *   「改张数胶囊跟着刷」那条断言恒真。
   */
  buildImageGenerationControls: vi.fn(
    (input: { aspectRatio: string; count: number }) => ({
      ...EMPTY_CONTROLS,
      aspectRatio: input.aspectRatio,
      count: input.count,
    }),
  ),
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
import { buildImageGenerationControls } from '@/lib/studio-operator-snapshot'
import {
  appendOperatorPendingResult,
  claimOperatorThreadScope,
  getOperatorState,
  resetOperatorThread,
  takeOperatorDraft,
} from '@/hooks/use-studio-operator-store'

beforeEach(() => {
  formState.overrides = {}
  imageModelOptions.current = null
  resetOperatorThread()
})

function runItem(
  id: string,
  status: string,
  generation: Record<string, unknown> | null,
) {
  return { id, status, generation, modelId: 'gpt-image-2' }
}

describe('useStudioWorkbenchOperatorHost 的生成入口', () => {
  it('图片编辑期间撤下生成入口，退出编辑后重新接回', () => {
    const { result, rerender } = renderHook(
      ({ generationEnabled }) =>
        useStudioWorkbenchOperatorHost({ generationEnabled }),
      { initialProps: { generationEnabled: true } },
    )
    const trigger = result.current.apply.triggerGeneration
    const request = {
      model: { id: 'gpt-image-test', label: 'GPT Image' },
      count: 1,
      specs: { aspectRatio: null, resolution: null, durationSeconds: null },
    }
    dispatch.mockClear()
    rerender({ generationEnabled: false })
    expect(result.current.apply.triggerGeneration).toBeUndefined()
    act(() => trigger?.(request))
    expect(dispatch).not.toHaveBeenCalled()

    rerender({ generationEnabled: true })
    act(() => result.current.apply.triggerGeneration?.(request))
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({
      type: 'REQUEST_GENERATE',
      owner: undefined,
    })
  })
})

describe('useStudioWorkbenchOperatorHost 的工作台转交回执', () => {
  const handoff = {
    modelId: 'nai-diffusion-5-full',
    label: 'NovelAI V5 Full',
    workspace: 'image-tags' as const,
    request: '改写成标签再出一张',
  }
  const tagOption = {
    optionId: 'saved:nai',
    modelId: handoff.modelId,
    adapterType: 'novelai',
    keyId: 'key-nai',
    providerConfig: { label: 'NovelAI', baseUrl: 'https://api.novelai.net' },
  }

  beforeEach(() => {
    useStudioGenOptional.mockReturnValue(undefined)
    dispatch.mockClear()
    routerPush.mockClear()
    modelOptions.push(tagOption)
    claimOperatorThreadScope('user-a:image-natural', 'image')
  })

  afterEach(() => {
    const index = modelOptions.indexOf(tagOption)
    if (index >= 0) modelOptions.splice(index, 1)
  })

  it('转交当前提示词与所选模型，跳转并只预填目标台助手', () => {
    formState.overrides = { prompt: '雨夜里的角色' }
    const { result } = renderHook(() => useStudioWorkbenchOperatorHost())
    expect(result.current.apply.switchImageWorkbench?.(handoff)).toBe(true)
    expect(result.current.apply.getState().prompt).toBe('雨夜里的角色')
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({
      type: 'TRANSFER_IMAGE_PROMPT',
      payload: { dialect: 'tags', optionId: tagOption.optionId },
    })
    expect(routerPush).toHaveBeenCalledExactlyOnceWith('/studio/image/tags')
    expect(takeOperatorDraft('user-a:image-natural')).toBeNull()
    expect(takeOperatorDraft('user-a:image-tags')).toBe(handoff.request)
    expect(takeOperatorDraft('user-a:image-tags')).toBeNull()
  })

  it('确认前模型被移除时返回失败，不转移提示词、跳转或预填', () => {
    const { result, rerender } = renderHook(() =>
      useStudioWorkbenchOperatorHost(),
    )
    imageModelOptions.current = modelOptions.filter(
      (option) => option !== tagOption,
    )
    rerender()
    expect(result.current.apply.switchImageWorkbench?.(handoff)).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
    expect(routerPush).not.toHaveBeenCalled()
    expect(takeOperatorDraft('user-a:image-tags')).toBeNull()
  })

  it('目标工作台与当前模型方言不匹配时不转交', () => {
    const { result } = renderHook(() => useStudioWorkbenchOperatorHost())
    expect(
      result.current.apply.switchImageWorkbench?.({
        ...handoff,
        workspace: 'image-natural',
      }),
    ).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
    expect(routerPush).not.toHaveBeenCalled()
    expect(takeOperatorDraft('user-a:image-natural')).toBeNull()
  })
})

describe('useStudioWorkbenchOperatorHost 的网络撤销回执', () => {
  beforeEach(() => {
    useStudioGenOptional.mockReturnValue(undefined)
    deleteAssistantMemoryAPI.mockReset().mockResolvedValue({ success: true })
    deleteProjectRuleAPI.mockReset().mockResolvedValue({ success: true })
    revertAssistantAssetWriteAPI.mockReset()
  })

  it.each(['note', 'sourceAllow', 'sourceDeny'] as const)(
    '规则 %s 撤销走其真实存储位置',
    async (kind) => {
      const { result } = renderHook(() => useStudioWorkbenchOperatorHost())
      const remove = result.current.apply.deleteProjectRule
      expect(remove).toBeDefined()

      expect(await remove?.({ ruleId: 'rule-1', kind })).toBe(true)
      if (kind === 'note') {
        expect(deleteAssistantMemoryAPI).toHaveBeenCalledWith('rule-1')
        expect(deleteProjectRuleAPI).not.toHaveBeenCalled()
      } else {
        expect(deleteProjectRuleAPI).toHaveBeenCalledWith('rule-1')
        expect(deleteAssistantMemoryAPI).not.toHaveBeenCalled()
      }
    },
  )

  it('删除失败原样返回失败回执', async () => {
    deleteAssistantMemoryAPI.mockResolvedValue({ success: false })
    const { result } = renderHook(() => useStudioWorkbenchOperatorHost())

    expect(
      await result.current.apply.deleteProjectRule?.({
        ruleId: 'memory-1',
        kind: 'note',
      }),
    ).toBe(false)
  })

  it.each([
    [null, false],
    [{ revertedCount: 0, skipped: 1 }, false],
    [{ revertedCount: 2, skipped: 0 }, true],
  ] as const)('素材库撤销按完整回执判成功 %j', async (receipt, success) => {
    revertAssistantAssetWriteAPI.mockResolvedValue(receipt)
    const { result } = renderHook(() => useStudioWorkbenchOperatorHost())

    expect(
      await result.current.apply.revertAssetWrite?.({
        tool: 'tag_asset',
        entries: [{ assetId: 'asset-1', tags: [] }],
      }),
    ).toBe(success)
  })
})

describe('useStudioWorkbenchOperatorHost 的 results 映射', () => {
  it('只收跑完且有地址的那些，缩略图与地址分开带', () => {
    useStudioGenOptional.mockReturnValue({
      activeRun: {
        outputType: 'IMAGE',
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

  it('切换方言与视频台时隐藏其他台的在飞与完成结果，回来继续显示', () => {
    claimOperatorThreadScope('user-a:image-tags', 'image')
    appendOperatorPendingResult({ id: 'tag-pending', total: 2 })
    const operatorResultOwner = {
      threadScope: 'user-a:image-tags',
      localThreadId: getOperatorState().localThreadId,
      pendingResultId: 'tag-pending',
    }
    const generation = {
      id: 'tag-result',
      url: 'https://example.com/tag.png',
      outputType: 'IMAGE',
      prompt: '1girl',
    }
    const activeRun = {
      outputType: 'IMAGE',
      items: [
        {
          ...runItem('tag-done', 'completed', generation),
          modelId: 'nai-diffusion-5-full',
          operatorResultOwner,
        },
        {
          ...runItem('tag-running', 'generating', null),
          modelId: 'nai-diffusion-5-full',
          operatorResultOwner,
        },
      ],
    }
    useStudioGenOptional.mockReturnValue({ activeRun })
    formState.overrides = { promptDialect: 'tags' }
    const view = renderHook(() => useStudioWorkbenchOperatorHost())
    expect(view.result.current.results?.map((result) => result.id)).toEqual([
      'tag-result',
    ])
    expect(view.result.current.resultRun).toMatchObject({
      total: 2,
      completed: 1,
      settled: false,
    })
    formState.overrides = { promptDialect: 'natural' }
    view.rerender()
    expect(view.result.current.results).toEqual([])
    expect(view.result.current.resultRun).toBeUndefined()
    formState.overrides = { outputType: 'video' }
    view.rerender()
    expect(view.result.current.results).toEqual([])
    formState.overrides = { promptDialect: 'tags' }
    view.rerender()
    expect(view.result.current.resultRun).toMatchObject({
      total: 2,
      completed: 1,
      settled: false,
    })
    expect(activeRun.items).toHaveLength(2)
  })

  it('同台的新对话与新账号不能认领上一次提交的结果', () => {
    claimOperatorThreadScope('user-a:image-natural', 'image')
    appendOperatorPendingResult({ id: 'old-pending', total: 1 })
    const oldOwner = {
      threadScope: 'user-a:image-natural',
      localThreadId: getOperatorState().localThreadId,
      pendingResultId: 'old-pending',
    }
    useStudioGenOptional.mockReturnValue({
      activeRun: {
        outputType: 'IMAGE',
        items: [
          {
            ...runItem('old-run', 'completed', {
              id: 'old-generation',
              url: 'https://cdn.test/old.png',
              outputType: 'IMAGE',
            }),
            operatorResultOwner: oldOwner,
          },
        ],
      },
    })
    const view = renderHook(() => useStudioWorkbenchOperatorHost())
    expect(view.result.current.resultRun?.owner).toEqual(oldOwner)
    act(() => {
      resetOperatorThread()
      appendOperatorPendingResult({ id: 'new-pending', total: 1 })
    })
    expect(view.result.current.resultRun).toBeUndefined()
    act(() => {
      claimOperatorThreadScope('user-b:image-natural', 'image')
      appendOperatorPendingResult({ id: 'old-pending', total: 1 })
    })
    expect(view.result.current.resultRun).toBeUndefined()
  })

  it('没有 <StudioProvider> 时是空数组 —— ⛔ 不抛（面板也挂在 LoRA 装配台上）', () => {
    useStudioGenOptional.mockReturnValue(undefined)
    const { result } = renderHook(() => useStudioWorkbenchOperatorHost())
    expect(result.current.results).toEqual([])
  })
})

describe('useStudioWorkbenchOperatorHost 的图片快照', () => {
  it('⭐ 把这一轮的全部模型交给快照 —— 专属 chip 行不能只看主模型', () => {
    useStudioGenOptional.mockReturnValue(undefined)
    const { result } = renderHook(() => useStudioWorkbenchOperatorHost())
    result.current.buildSnapshot()
    expect(buildImageOperatorSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({ runModels }),
    )
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

describe('useStudioWorkbenchOperatorHost 当前工作台的模型边界', () => {
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

  it.each([
    ['natural', 'gpt-image-test', 'nai-diffusion-5-full'],
    ['tags', 'nai-diffusion-5-full', 'gpt-image-test'],
  ])('%s 台只给当前方言的模型及确认卡选项', (dialect, allowed, denied) => {
    formState.overrides = { promptDialect: dialect }
    const { result } = renderHook(() => useStudioWorkbenchOperatorHost())
    result.current.buildSnapshot()
    const expectedOptions = modelOptions.filter(
      (option) => option.modelId === allowed,
    )
    expect(buildImageOperatorSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({ modelOptions: expectedOptions }),
    )
    expect(buildImageGenerationControls).toHaveBeenLastCalledWith(
      expect.objectContaining({ modelOptions: expectedOptions }),
    )
    expect(result.current.apply.resolveOptionId(denied)).toBeNull()
    expect(result.current.workspace).toBe(
      dialect === 'tags' ? 'image-tags' : 'image-natural',
    )
  })

  it.each([
    ['natural', 'nai-diffusion-5-full'],
    ['tags', 'gpt-image-test'],
  ])('%s 台拒绝跨方言换模，表单与路由不变', (dialect, modelId) => {
    formState.overrides = { promptDialect: dialect }
    const { result } = renderHook(() => useStudioWorkbenchOperatorHost())
    const applied = result.current.apply.selectModelChannel?.({
      modelId,
      channelId: null,
    })
    expect(applied).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
    expect(routerPush).not.toHaveBeenCalled()
  })

  it.each([
    ['natural', 'gpt-image-test'],
    ['tags', 'nai-diffusion-5-full'],
  ])('%s 台内合法换模仍生效', (dialect, modelId) => {
    formState.overrides = { promptDialect: dialect }
    const { result } = renderHook(() => useStudioWorkbenchOperatorHost())
    expect(
      result.current.apply.selectModelChannel?.({
        modelId,
        channelId: null,
      }),
    ).toBe(true)
    expect(dispatch).toHaveBeenLastCalledWith({
      type: 'SET_OPTION_ID',
      payload: expect.any(String),
    })
    expect(routerPush).not.toHaveBeenCalled()
  })

  it('手动换台后，助手快照和换模边界跟着当前台更新', () => {
    const { result, rerender } = renderHook(() =>
      useStudioWorkbenchOperatorHost(),
    )
    formState.overrides = { promptDialect: 'tags' }
    rerender()
    result.current.buildSnapshot()
    expect(buildImageOperatorSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({
        modelOptions: modelOptions.filter(
          (option) => option.adapterType === 'novelai',
        ),
        runModels: [],
      }),
    )
    expect(result.current.apply.resolveOptionId('gpt-image-test')).toBeNull()
  })
})
