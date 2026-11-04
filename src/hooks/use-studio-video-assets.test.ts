// @vitest-environment jsdom
import { act, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSET_DND_MIME } from '@/constants/asset-dnd'
import { GENERATION_REVIEW_STATE_IDS } from '@/constants/assistant-operator'
import { AI_MODELS, getModelMessageKey } from '@/constants/models'
import { setOperatorReviewState } from '@/hooks/use-studio-operator-store'
import { installFakeVideoDecoding } from '@/test/fake-video-element'
import { text } from '@/test/i18n-text'
import { fakeStudioServer, renderHookWithStudio } from '@/test/studio-harness'
import type { GenerationRecord } from '@/types'

import { useStudioVideoAssets } from './use-studio-video-assets'

/**
 * 视频台素材的两个入口（owner 2026-09-27 视频台 A：拖放落点是整个输入框，「＋」是
 * 工具行的「素材」chip）—— 都进这颗 hook，⛔ 组件里没有第二条写入：
 *  ① 拖进来的图走 `addImage`（型号不收参考就填首帧）；
 *  ② 「已否」的产物拒收，而且要说话；
 *  ③ 本地文件一张一张传；
 *  ④ 素材库挑中的视频进参考视频。
 *
 * 全程真工作台（真 `StudioProvider`、真型号目录算容量），只假上传那两条 api-client。
 * 型号按能力挑真的：
 *  - Kling O3 Pro：首尾帧都吃、没有参考档（图先填首帧）、不收参考视频；
 *  - Seedance 2.5：有参考档、收参考视频。
 */

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/video',
  useRouter: () => ({ push: vi.fn() }),
}))

/** 拒收 / 出错那一句：用户看到的就是这条 toast（sonner 是项目外的包）。 */
const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('sonner')>()
  return {
    ...actual,
    toast: Object.assign(vi.fn(), {
      ...actual.toast,
      error: toastError,
      loading: vi.fn(),
      success: vi.fn(),
      dismiss: vi.fn(),
    }),
  }
})

const uploadImageFileAPI = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client/generation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client/generation')>()),
  uploadImageFileAPI,
}))
const uploadReferenceVideoAPI = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client/node-workflow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client/node-workflow')>()),
  uploadReferenceVideoAPI,
}))

const NO_REFERENCE = AI_MODELS.KLING_O3_PRO
const WITH_REFERENCE = AI_MODELS.SEEDANCE_25

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

function renderAssets(modelId: string = NO_REFERENCE) {
  const view = renderHookWithStudio(() => useStudioVideoAssets())
  act(() => {
    const { dispatch } = view.result.current.studio
    dispatch({ type: 'SET_OUTPUT_TYPE', payload: 'video' })
    dispatch({ type: 'SET_OPTION_ID', payload: `workspace:${modelId}` })
  })
  return {
    ...view,
    assets: () => view.result.current.value,
    studio: () => view.result.current.studio,
  }
}

const uploaded = (url: string) => ({
  success: true,
  data: { generation: { url } },
})

beforeEach(() => {
  fakeStudioServer()
  toastError.mockClear()
  uploadImageFileAPI.mockReset()
  uploadReferenceVideoAPI.mockReset()
  // 本地视频抓封面：jsdom 不解码视频，替的是浏览器那一层；读不出来 = 没封面，照传。
  installFakeVideoDecoding()
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: () => 'blob:local-video',
      revokeObjectURL: () => {},
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('视频台素材 · 换了型号', () => {
  it('当前型号收不下的参考图（被标成停用）还在排里 —— ⛔ 凭空消失，发不发由发送计划判', () => {
    const view = renderAssets(WITH_REFERENCE)
    act(() =>
      view
        .studio()
        .imageUpload.addReferenceImage('https://cdn.example.com/r.png'),
    )
    act(() =>
      view.studio().dispatch({
        type: 'SET_OPTION_ID',
        payload: `workspace:${NO_REFERENCE}`,
      }),
    )
    expect(view.assets().images).toEqual([
      { url: 'https://cdn.example.com/r.png', role: 'reference', n: 1 },
    ])
  })
})

describe('视频台素材 · 拖进输入框 / 素材库', () => {
  it('拖一张图进来：型号不收参考 → 先填首帧', () => {
    const view = renderAssets(NO_REFERENCE)
    act(() =>
      view
        .assets()
        .acceptTransfer(transfer({ url: 'https://cdn.example.com/new.png' })),
    )
    expect(view.studio().state.videoFrameSlots).toEqual({
      first: 'https://cdn.example.com/new.png',
      last: null,
    })
  })

  it('⛔ 「已否」的产物拒收，而且要说话', () => {
    setOperatorReviewState('gen-blocked', GENERATION_REVIEW_STATE_IDS.blocked)
    const view = renderAssets(NO_REFERENCE)
    act(() =>
      view.assets().acceptTransfer(
        transfer({
          url: 'https://cdn.example.com/blocked.png',
          assetIds: ['gen-blocked'],
        }),
      ),
    )
    expect(view.studio().state.videoFrameSlots).toEqual({
      first: null,
      last: null,
    })
    expect(toastError).toHaveBeenCalledWith(
      text('StudioOperator.reject.blockedSource'),
    )
  })

  it('本地文件一张一张传；型号收参考 → 传完进参考图', async () => {
    uploadImageFileAPI
      .mockResolvedValueOnce(uploaded('https://r2.example.com/a.png'))
      .mockResolvedValueOnce(uploaded('https://r2.example.com/b.png'))
    uploadReferenceVideoAPI.mockResolvedValueOnce({
      success: true,
      data: { url: 'https://r2.example.com/v.mp4', sizeBytes: 10 },
    })
    const view = renderAssets(WITH_REFERENCE)
    act(() =>
      view.assets().acceptTransfer(
        transfer({
          files: [
            new File(['a'], 'a.png', { type: 'image/png' }),
            new File(['v'], 'v.mp4', { type: 'video/mp4' }),
            new File(['b'], 'b.png', { type: 'image/png' }),
          ],
        }),
      ),
    )
    await waitFor(() =>
      expect(view.studio().imageUpload.referenceImages).toEqual([
        'https://r2.example.com/a.png',
        'https://r2.example.com/b.png',
      ]),
    )
    expect(view.studio().state.videoReferenceVideos).toEqual([
      'https://r2.example.com/v.mp4',
    ])
    expect(uploadImageFileAPI).toHaveBeenCalledTimes(2)
  })

  it('素材库挑中的视频进参考视频；图片那条同样过「已否」的闸', () => {
    const view = renderAssets(WITH_REFERENCE)
    act(() =>
      view.assets().acceptGeneration(
        {
          id: 'gen-video',
          url: 'https://cdn.example.com/v.mp4',
          outputType: 'VIDEO',
        } as GenerationRecord,
        'video',
      ),
    )
    expect(view.studio().state.videoReferenceVideos).toEqual([
      'https://cdn.example.com/v.mp4',
    ])

    setOperatorReviewState('gen-no', GENERATION_REVIEW_STATE_IDS.blocked)
    act(() =>
      view.assets().acceptGeneration(
        {
          id: 'gen-no',
          url: 'https://cdn.example.com/no.png',
          outputType: 'IMAGE',
        } as GenerationRecord,
        'image',
      ),
    )
    expect(toastError).toHaveBeenCalledWith(
      text('StudioOperator.reject.blockedSource'),
    )
    expect(view.studio().imageUpload.referenceImages).toEqual([])
  })
})

describe('视频台素材 · 连着落好几样 / 拖视频', () => {
  it('不收参考的型号连着传两张：第一张首帧、第二张尾帧（⛔ 第二张顶掉第一张）', async () => {
    uploadImageFileAPI
      .mockResolvedValueOnce(uploaded('https://r2.example.com/a.png'))
      .mockResolvedValueOnce(uploaded('https://r2.example.com/b.png'))
    const view = renderAssets(NO_REFERENCE)
    act(() =>
      view.assets().acceptTransfer(
        transfer({
          files: [
            new File(['a'], 'a.png', { type: 'image/png' }),
            new File(['b'], 'b.png', { type: 'image/png' }),
          ],
        }),
      ),
    )
    await waitFor(() =>
      expect(view.studio().state.videoFrameSlots).toEqual({
        first: 'https://r2.example.com/a.png',
        last: 'https://r2.example.com/b.png',
      }),
    )
  })

  it('拖进一段本地视频：走参考视频那条上传，传完进参考视频', async () => {
    uploadReferenceVideoAPI.mockResolvedValueOnce({
      success: true,
      data: { url: 'https://r2.example.com/v.mp4', sizeBytes: 10 },
    })
    const view = renderAssets(WITH_REFERENCE)
    act(() =>
      view.assets().acceptTransfer(
        transfer({
          files: [new File(['v'], 'v.mp4', { type: 'video/mp4' })],
        }),
      ),
    )
    await waitFor(() =>
      expect(view.studio().state.videoReferenceVideos).toEqual([
        'https://r2.example.com/v.mp4',
      ]),
    )
    expect(uploadImageFileAPI).not.toHaveBeenCalled()
  })

  it('型号不收参考视频：拖进视频直说「不收」，⛔ 白传一趟', async () => {
    const view = renderAssets(NO_REFERENCE)
    act(() =>
      view.assets().acceptTransfer(
        transfer({
          files: [new File(['v'], 'v.mp4', { type: 'video/mp4' })],
        }),
      ),
    )
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        text('StudioVideoSlots.menu.noVideo', {
          model: text(`Models.${getModelMessageKey(NO_REFERENCE)}.label`),
        }),
      ),
    )
    expect(uploadReferenceVideoAPI).not.toHaveBeenCalled()
  })

  it('拖过来的是视频直链：进参考视频，⛔ 当成一张图挂上', () => {
    const view = renderAssets(WITH_REFERENCE)
    act(() =>
      view
        .assets()
        .acceptTransfer(transfer({ url: 'https://cdn.example.com/clip.mp4' })),
    )
    expect(view.studio().state.videoReferenceVideos).toEqual([
      'https://cdn.example.com/clip.mp4',
    ])
    expect(view.studio().imageUpload.referenceImages).toEqual([])
  })
})
