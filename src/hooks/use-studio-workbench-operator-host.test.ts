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
const formState = vi.hoisted(() => ({ videoReferenceVideos: [] as string[] }))

vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({
    state: {
      prompt: '',
      advancedParams: {},
      aspectRatio: '1:1',
      imageBatchCount: 1,
      videoDuration: null,
      videoResolution: null,
      videoAudioRefs: [],
      videoGenerateAudio: null,
      videoMode: 'text',
      outputType: 'image',
      selectedOptionId: null,
      panels: { enhance: false },
      videoFrameSlots: { first: null, last: null },
      get videoReferenceVideos() {
        return formState.videoReferenceVideos
      },
    },
    dispatch,
  }),
  useStudioData: () => ({
    imageUpload: {
      referenceEntries: [],
      maxImages: 4,
      addReferenceImage,
      removeReferenceImage,
    },
  }),
  useStudioGenOptional,
}))

vi.mock('@/hooks/use-image-model-options', () => ({
  useImageModelOptions: () => ({ modelOptions: [], selectedModel: null }),
}))
vi.mock('@/hooks/use-video-model-options', () => ({
  useVideoModelOptions: () => ({ modelOptions: [], selectedModel: null }),
}))
vi.mock('@/hooks/use-operator-user-url-mount', () => ({
  useOperatorUserUrlMount: () => ({
    mountUserUrl: vi.fn(),
    unmountUserUrl: vi.fn(),
  }),
}))
vi.mock('@/lib/studio-operator-snapshot', () => ({
  buildImageOperatorSnapshot: () => ({ prompt: '', availableModels: [] }),
  buildVideoOperatorSnapshot: () => ({ prompt: '', availableModels: [] }),
}))

import { useStudioWorkbenchOperatorHost } from '@/hooks/use-studio-workbench-operator-host'

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
        label: '一把红伞',
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
