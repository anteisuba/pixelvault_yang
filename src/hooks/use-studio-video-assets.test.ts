import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSET_DND_MIME } from '@/constants/asset-dnd'
import { GENERATION_REVIEW_STATE_IDS } from '@/constants/assistant-operator'
import { setOperatorReviewState } from '@/hooks/use-studio-operator-store'
import type { StudioVideoCapacity } from '@/lib/studio/video-workbench-slots'
import type { GenerationRecord } from '@/types'

import { useStudioVideoAssets } from './use-studio-video-assets'

/**
 * 视频台素材的两个入口（owner 2026-09-27 视频台 A：拖放落点是整个输入框，「＋」是
 * 工具行的「素材」chip）—— 都进这颗 hook，⛔ 组件里没有第二条写入：
 *  ① 拖进来的图走 `addImage`（型号不收参考就填首帧）；
 *  ② 「已否」的产物拒收，而且要说话；
 *  ③ 本地文件一张一张传；
 *  ④ 素材库挑中的视频进参考视频。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError } }))

const dispatch = vi.hoisted(() => vi.fn())
const addFromUrl = vi.hoisted(() => vi.fn(async () => {}))
const upload = vi.hoisted(() => ({
  entries: [] as {
    url: string
    disabledReason: 'over_limit' | 'unsupported' | null
  }[],
}))
vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({
    state: {
      selectedOptionId: 'video-option',
      videoFrameSlots: { first: null, last: null },
      videoReferenceVideos: [],
      videoAudioRefs: [],
    },
    dispatch,
  }),
  useStudioData: () => ({
    imageUpload: {
      referenceImages: upload.entries
        .filter((entry) => entry.disabledReason === null)
        .map((entry) => entry.url),
      referenceEntries: upload.entries,
      addFromUrl,
      removeReferenceImage: vi.fn(),
      isUploading: false,
    },
  }),
}))

vi.mock('@/hooks/use-video-model-options', () => ({
  useVideoModelOptions: () => ({
    selectedModel: { modelId: 'test-video-model', adapterType: 'fal' },
  }),
}))

const capacity = vi.hoisted(() => ({
  current: {
    frames: 2,
    references: 0,
    videos: 1,
    audios: 0,
  } as StudioVideoCapacity,
}))
vi.mock('@/lib/studio/video-workbench-slots', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/studio/video-workbench-slots')
  >()),
  getStudioVideoCapacity: (): StudioVideoCapacity => capacity.current,
}))

const uploadImageFileAPI = vi.hoisted(() => vi.fn())
const uploadReferenceVideoAPI = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client', () => ({
  uploadImageFileAPI,
  uploadReferenceVideoAPI,
}))
vi.mock('@/lib/prepare-image-upload', () => ({
  prepareImageUpload: async (file: File) => file,
}))
vi.mock('@/lib/video-thumbnail', () => ({
  captureVideoThumbnail: async () => null,
}))

function transfer(data: {
  url?: string
  assetIds?: readonly string[]
  files?: File[]
}): DataTransfer {
  return {
    files: data.files ?? [],
    getData: (type: string) => {
      if (type === 'text/uri-list') return data.url ?? ''
      if (type === ASSET_DND_MIME && data.assetIds) {
        return JSON.stringify(data.assetIds)
      }
      return ''
    },
  } as unknown as DataTransfer
}

beforeEach(() => {
  dispatch.mockClear()
  addFromUrl.mockClear()
  toastError.mockClear()
  uploadImageFileAPI.mockReset()
  uploadReferenceVideoAPI.mockReset()
  capacity.current = { frames: 2, references: 0, videos: 1, audios: 0 }
  upload.entries = []
})

describe('视频台素材 · 换了型号', () => {
  it('当前型号收不下的参考图（被标成停用）还在排里 —— ⛔ 凭空消失，发不发由发送计划判', () => {
    upload.entries = [
      { url: 'https://cdn.example.com/r.png', disabledReason: 'unsupported' },
    ]
    const { result } = renderHook(() => useStudioVideoAssets())
    expect(result.current.images).toEqual([
      { url: 'https://cdn.example.com/r.png', role: 'reference', n: 1 },
    ])
  })
})

describe('视频台素材 · 拖进输入框 / 素材库', () => {
  it('拖一张图进来：型号不收参考 → 先填首帧', () => {
    const { result } = renderHook(() => useStudioVideoAssets())
    result.current.acceptTransfer(
      transfer({ url: 'https://cdn.example.com/new.png' }),
    )
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_VIDEO_FRAME_SLOT',
      payload: { slot: 'first', url: 'https://cdn.example.com/new.png' },
    })
  })

  it('⛔ 「已否」的产物拒收，而且要说话', () => {
    setOperatorReviewState('gen-blocked', GENERATION_REVIEW_STATE_IDS.blocked)
    const { result } = renderHook(() => useStudioVideoAssets())
    result.current.acceptTransfer(
      transfer({
        url: 'https://cdn.example.com/blocked.png',
        assetIds: ['gen-blocked'],
      }),
    )
    expect(dispatch).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith('reject.blockedSource')
  })

  it('本地文件一张一张传；型号收参考 → 传完进参考图', async () => {
    capacity.current = { frames: 2, references: 9, videos: 1, audios: 0 }
    uploadImageFileAPI
      .mockResolvedValueOnce({
        success: true,
        data: { generation: { url: 'https://r2.example.com/a.png' } },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { generation: { url: 'https://r2.example.com/b.png' } },
      })
    const { result } = renderHook(() => useStudioVideoAssets())
    result.current.acceptTransfer(
      transfer({
        files: [
          new File(['a'], 'a.png', { type: 'image/png' }),
          new File(['v'], 'v.mp4', { type: 'video/mp4' }),
          new File(['b'], 'b.png', { type: 'image/png' }),
        ],
      }),
    )
    await waitFor(() => expect(addFromUrl).toHaveBeenCalledTimes(2))
    expect(uploadImageFileAPI).toHaveBeenCalledTimes(2)
    expect(addFromUrl).toHaveBeenNthCalledWith(
      1,
      'https://r2.example.com/a.png',
    )
    expect(addFromUrl).toHaveBeenNthCalledWith(
      2,
      'https://r2.example.com/b.png',
    )
  })

  it('素材库挑中的视频进参考视频；图片那条同样过「已否」的闸', () => {
    const { result } = renderHook(() => useStudioVideoAssets())
    result.current.acceptGeneration(
      {
        id: 'gen-video',
        url: 'https://cdn.example.com/v.mp4',
        outputType: 'VIDEO',
      } as GenerationRecord,
      'video',
    )
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_VIDEO_REFERENCE_VIDEOS',
      payload: ['https://cdn.example.com/v.mp4'],
    })

    setOperatorReviewState('gen-no', GENERATION_REVIEW_STATE_IDS.blocked)
    result.current.acceptGeneration(
      {
        id: 'gen-no',
        url: 'https://cdn.example.com/no.png',
        outputType: 'IMAGE',
      } as GenerationRecord,
      'image',
    )
    expect(toastError).toHaveBeenCalledWith('reject.blockedSource')
    expect(dispatch).toHaveBeenCalledTimes(1)
  })
})

describe('视频台素材 · 连着落好几样 / 拖视频', () => {
  it('不收参考的型号连着传两张：第一张首帧、第二张尾帧（⛔ 第二张顶掉第一张）', async () => {
    uploadImageFileAPI
      .mockResolvedValueOnce({
        success: true,
        data: { generation: { url: 'https://r2.example.com/a.png' } },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { generation: { url: 'https://r2.example.com/b.png' } },
      })
    const { result } = renderHook(() => useStudioVideoAssets())
    result.current.acceptTransfer(
      transfer({
        files: [
          new File(['a'], 'a.png', { type: 'image/png' }),
          new File(['b'], 'b.png', { type: 'image/png' }),
        ],
      }),
    )
    await waitFor(() => expect(dispatch).toHaveBeenCalledTimes(2))
    expect(dispatch).toHaveBeenNthCalledWith(1, {
      type: 'SET_VIDEO_FRAME_SLOT',
      payload: { slot: 'first', url: 'https://r2.example.com/a.png' },
    })
    expect(dispatch).toHaveBeenNthCalledWith(2, {
      type: 'SET_VIDEO_FRAME_SLOT',
      payload: { slot: 'last', url: 'https://r2.example.com/b.png' },
    })
  })

  it('拖进一段本地视频：走参考视频那条上传，传完进参考视频', async () => {
    uploadReferenceVideoAPI.mockResolvedValueOnce({
      success: true,
      data: { url: 'https://r2.example.com/v.mp4', sizeBytes: 10 },
    })
    const { result } = renderHook(() => useStudioVideoAssets())
    result.current.acceptTransfer(
      transfer({ files: [new File(['v'], 'v.mp4', { type: 'video/mp4' })] }),
    )
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_VIDEO_REFERENCE_VIDEOS',
        payload: ['https://r2.example.com/v.mp4'],
      }),
    )
    expect(uploadImageFileAPI).not.toHaveBeenCalled()
  })

  it('型号不收参考视频：拖进视频直说「不收」，⛔ 白传一趟', () => {
    capacity.current = { frames: 2, references: 0, videos: 0, audios: 0 }
    const { result } = renderHook(() => useStudioVideoAssets())
    result.current.acceptTransfer(
      transfer({ files: [new File(['v'], 'v.mp4', { type: 'video/mp4' })] }),
    )
    return waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('menu.noVideo')
      expect(uploadReferenceVideoAPI).not.toHaveBeenCalled()
    })
  })

  it('拖过来的是视频直链：进参考视频，⛔ 当成一张图挂上', () => {
    const { result } = renderHook(() => useStudioVideoAssets())
    result.current.acceptTransfer(
      transfer({ url: 'https://cdn.example.com/clip.mp4' }),
    )
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_VIDEO_REFERENCE_VIDEOS',
      payload: ['https://cdn.example.com/clip.mp4'],
    })
  })
})
