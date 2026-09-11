import { act, renderHook } from '@testing-library/react'
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
const settle = vi.hoisted(() => vi.fn(async () => true))
const cancelPending = vi.hoisted(() => vi.fn())
const setReferenceImage = vi.hoisted(() => vi.fn())

/**
 * 模型显示名那张词表（`Models.*.label`）—— 这个 hook 从 2026-09-12 起读它，好让
 * 生成确认卡上写的是显示名而不是 id。⚠ 测试里没有 `NextIntlClientProvider`，
 * 桩成「回 key」就够：这一层验的是宿主契约，不是词表。
 */
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
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
    settle,
    cancelPending,
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
  // 四颗旋钮那份视图（#9）—— 这一层验的是 results / 分槽，桩成空的就够。
  buildImageGenerationControls: () => EMPTY_CONTROLS,
  buildVideoGenerationControls: () => EMPTY_CONTROLS,
}))

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

describe('配置快照与刷新恢复', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    settle.mockResolvedValue(true)
    formState.overrides = {
      selectedOptionId: 'openai-test',
      prompt: '@Image1 female @Image2 male @Image3 pose @Image4 style',
      advancedParams: { quality: 'high', resolution: '2K', seed: 42 },
    }
    references.entries = [1, 2, 3, 4].map((id) => ({
      url: `https://cdn.test/${id}.png`,
    }))
  })

  it('快照与当前表单脱离，历史序列化后恢复完整配置与四张参考图顺序，不触发生成', async () => {
    const {
      toOperatorHistory,
      toStoredOperatorMessages,
      fromStoredOperatorMessages,
    } = await import('@/lib/studio-operator-history')
    const { result, rerender } = renderHook(() =>
      useStudioWorkbenchOperatorHost(),
    )
    const saved = await result.current.checkpoints!.capture()
    expect(saved).not.toBeNull()
    const history = toOperatorHistory([
      {
        kind: 'step',
        id: 'r:1',
        runKey: 'r',
        undone: false,
        checkpoint: saved!,
        step: {
          id: '1',
          tool: 'set_prompt',
          verb: 'apply',
          title: 'prompt',
          status: 'done',
          payload: { value: saved!.form.prompt, mode: 'replace' },
          inverse: { value: '' },
        },
      },
    ])
    const loaded = fromStoredOperatorMessages(
      JSON.parse(JSON.stringify(toStoredOperatorMessages(history))),
    )[0]!
    expect(loaded.kind).toBe('step')
    if (loaded.kind !== 'step') throw new Error('Missing history step')
    formState.overrides = { prompt: 'manually edited', selectedOptionId: null }
    references.entries = [{ url: 'https://cdn.test/changed.png' }]
    rerender()
    setReferenceImage.mockImplementationOnce(() =>
      dispatch({ type: 'REMOVE_PROMPT_REFERENCE' }),
    )
    act(() => {
      expect(result.current.checkpoints!.restore(loaded.checkpoint!)).toBe(true)
    })
    expect(dispatch.mock.calls).toEqual([
      [{ type: 'REMOVE_PROMPT_REFERENCE' }],
      [{ type: 'RESTORE_OPERATOR_CHECKPOINT', payload: saved!.form }],
    ])
    expect(setReferenceImage).toHaveBeenCalledWith(undefined)
    expect(addReferenceImage.mock.calls.map(([url]) => url)).toEqual(
      saved!.referenceImages,
    )
    expect(saved!.form.prompt).toContain('@Image4 style')
    expect(saved!.form.advancedParams).toEqual({
      quality: 'high',
      resolution: '2K',
      seed: 42,
    })
    expect(cancelPending).toHaveBeenCalledOnce()
  })

  it('导入未成功、卡片模式或本地临时地址不产生可恢复快照', async () => {
    const { result, rerender } = renderHook(() =>
      useStudioWorkbenchOperatorHost(),
    )
    settle.mockResolvedValueOnce(false)
    expect(await result.current.checkpoints!.capture()).toBeNull()
    references.entries = [{ url: 'blob:temporary' }]
    rerender()
    expect(await result.current.checkpoints!.capture()).toBeNull()
    references.entries = []
    formState.overrides = { workflowMode: 'card' }
    rerender()
    expect(await result.current.checkpoints!.capture()).toBeNull()
  })

  it('域不匹配或原模型不可用时拒绝恢复且不改表单', async () => {
    const { result } = renderHook(() => useStudioWorkbenchOperatorHost())
    const saved = await result.current.checkpoints!.capture()
    expect(
      result.current.checkpoints!.restore({ ...saved!, domain: 'video' }),
    ).toBe(false)
    expect(
      result.current.checkpoints!.restore({
        ...saved!,
        form: { ...saved!.form, selectedOptionId: 'missing' },
      }),
    ).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
    expect(addReferenceImage).not.toHaveBeenCalled()
  })
})
