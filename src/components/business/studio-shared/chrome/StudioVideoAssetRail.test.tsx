import { useLayoutEffect } from 'react'
import { act, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import {
  useStudioVideoAssets,
  type UseStudioVideoAssetsReturn,
} from '@/hooks/use-studio-video-assets'
import { richText, text } from '@/test/i18n-text'
import { fakeStudioServer, renderWithStudio } from '@/test/studio-harness'

import { StudioVideoAssetRail } from './StudioVideoAssetRail'

/**
 * 视频台的素材排（owner 2026-09-27 视频台 A「素材在输入框里」）。
 *
 * 钉四件事：
 *  ① 一排按类型编号（图片N · 视频N · 音频N），首 / 尾帧是图片上的角标；
 *  ② 最右一行灰字说清这一枪按什么方式发（没有模式分段）；
 *  ③ 什么都没挂时整排不渲染（⛔ 不写「文生视频」）；
 *  ④ 上传中占一格转圈 —— 与「素材」chip 同一份 assets，看得见对方在传；
 *  ⑤ 这一枪不发的那几格变淡，灰字直说「… 这次不发」（与发送口同一份 `send.unsent`）。
 *
 * 全程真工作台：真 `useStudioVideoAssets` 算容量与发送计划，只假网络。
 */

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/video',
  useRouter: () => ({ push: vi.fn() }),
}))
// 只假上传那一跳（api-client 边界）：用来停在「上传中」。
const uploadImageFileAPI = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client/generation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client/generation')>()),
  uploadImageFileAPI,
}))

const T = (key: string, values?: Record<string, string | number>) =>
  text(`StudioVideoSlots.${key}`, values)
const F = 'https://cdn.example.com/f.png'
const R = 'https://cdn.example.com/r.png'
const L = 'https://cdn.example.com/l.png'
const V = 'https://cdn.example.com/v.mp4'
const AUDIO = {
  id: 'a1',
  url: 'https://cdn.example.com/v.mp3',
  fileName: 'v.mp3',
}

const assetsRef = { current: null as unknown as UseStudioVideoAssetsReturn }
function Host() {
  const assets = useStudioVideoAssets()
  useLayoutEffect(() => {
    assetsRef.current = assets
  })
  return <StudioVideoAssetRail assets={assets} />
}

interface Setup {
  modelId?: string
  first?: string
  last?: string
  references?: string[]
  videos?: string[]
  audio?: boolean
  /** 挂好之后换到的型号（「换了型号它不收」）。 */
  switchTo?: string
}

function renderRail({
  modelId = AI_MODELS.SEEDANCE_25,
  first,
  last,
  references = [],
  videos = [],
  audio = false,
  switchTo,
}: Setup = {}) {
  const view = renderWithStudio(<Host />)
  act(() => {
    const { dispatch, imageUpload } = view.studio.current
    dispatch({ type: 'SET_OUTPUT_TYPE', payload: 'video' })
    dispatch({ type: 'SET_OPTION_ID', payload: `workspace:${modelId}` })
    if (first)
      dispatch({
        type: 'SET_VIDEO_FRAME_SLOT',
        payload: { slot: 'first', url: first },
      })
    if (last)
      dispatch({
        type: 'SET_VIDEO_FRAME_SLOT',
        payload: { slot: 'last', url: last },
      })
    for (const url of references) imageUpload.addReferenceImage(url)
    if (videos.length)
      dispatch({ type: 'SET_VIDEO_REFERENCE_VIDEOS', payload: videos })
    if (audio) dispatch({ type: 'SET_VIDEO_AUDIO_REFS', payload: [AUDIO] })
  })
  if (switchTo)
    act(() =>
      view.studio.current.dispatch({
        type: 'SET_OPTION_ID',
        payload: `workspace:${switchTo}`,
      }),
    )
  return view
}

const line = () => screen.getByTestId('video-asset-send-mode')

beforeEach(() => {
  fakeStudioServer()
  uploadImageFileAPI.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe('视频台 · 素材排', () => {
  it('按类型编号（名字在按钮上、格子只放图），首帧是图片上的角标；音频也在同一排', () => {
    renderRail({ first: F, references: [R], audio: true })
    const tile = (id: string) => screen.getByTestId(id)
    const named = (id: string, name: string) =>
      within(tile(id)).getByRole('button', { name })
    expect(named('video-asset-image-1', T('image', { n: 1 }))).toBeTruthy()
    // u-thumbnails：格子底下不再写「图片1」。
    expect(tile('video-asset-image-1')).not.toHaveTextContent(
      T('image', { n: 1 }),
    )
    expect(screen.getByTestId('video-asset-badge-first')).toBeInTheDocument()
    expect(named('video-asset-image-2', T('image', { n: 2 }))).toBeTruthy()
    expect(named('video-asset-audio-1', T('audio', { n: 1 }))).toBeTruthy()
  })

  it('最右一行灰字说清这一枪怎么发（⛔ 没有模式分段）', () => {
    renderRail({ first: F, references: [R], audio: true })
    const mode = assetsRef.current.send!.mode
    expect(mode).toBe('omniReference')
    expect(line()).toHaveTextContent(
      richText('StudioVideoSlots.sendLine', {
        mode: text(`StudioNode.v4.video.mode.${mode}`),
        reason: T(`reason.${mode}`),
      }),
    )
  })

  it('什么都没挂：整排不渲染，也不写「文生视频」', () => {
    const { container } = renderRail()
    expect(container).toBeEmptyDOMElement()
  })

  it('换了型号它不收：那几格变淡，灰字说「… 这次不发」，⛔ 不自动删', () => {
    // 先在 Seedance 2.5 挂首帧 + 参考视频 + 音频，再换到可灵 O3 Pro（只收首尾帧）。
    renderRail({
      first: F,
      videos: [V],
      audio: true,
      switchTo: AI_MODELS.KLING_O3_PRO,
    })
    expect(screen.getByTestId('video-asset-video-1')).toHaveAttribute(
      'data-unsent',
      'true',
    )
    expect(screen.getByTestId('video-asset-audio-1')).toHaveAttribute(
      'data-unsent',
      'true',
    )
    expect(screen.getByTestId('video-asset-image-1')).not.toHaveAttribute(
      'data-unsent',
    )
    expect(line()).toHaveTextContent(text('Models.klingO3Pro.label'))
    expect(line()).toHaveTextContent(T('video', { n: 1 }))
    // 格数是 0 的合成一句「不收 …」。
    expect(line()).toHaveTextContent(
      T('unsent.none', {
        kinds: new Intl.ListFormat('zh', { type: 'conjunction' }).format([
          T('unsent.kind.video'),
          T('unsent.kind.audio'),
        ]),
      }),
    )
  })

  it('只挂了尾帧：直说尾帧要和首帧一起才发得出去', () => {
    renderRail({ last: L })
    expect(line()).toHaveTextContent(
      richText('StudioVideoSlots.unsent.lastWithoutFirst'),
    )
    expect(screen.getByTestId('video-asset-image-1')).toHaveAttribute(
      'data-unsent',
      'true',
    )
  })

  it('只挂尾帧、型号又不收挂着的参考视频：两句都说（⛔ 只说一半）', () => {
    renderRail({ last: L, videos: [V], switchTo: AI_MODELS.KLING_O3_PRO })
    expect(line()).toHaveTextContent(
      richText('StudioVideoSlots.unsent.lastWithoutFirst'),
    )
    expect(line()).toHaveTextContent(text('Models.klingO3Pro.label'))
    expect(line()).toHaveTextContent(T('video', { n: 1 }))
    // 尾帧那一张由前半句说，后半句不再列它。
    expect(line()).not.toHaveTextContent(T('image', { n: 1 }))
  })

  it('型号没有参考档：挂着的参考图说「不收参考图」，⛔ 不说「最多收 N 张」', () => {
    renderRail({
      first: F,
      references: [R],
      switchTo: AI_MODELS.KLING_O3_PRO,
    })
    expect(line()).toHaveTextContent(T('unsent.kind.reference'))
    expect(line()).not.toHaveTextContent(T('unsent.imageMax', { max: 2 }))
    expect(line()).toHaveTextContent(T('image', { n: 2 }))
  })

  it('上传中：占一格转圈，灰字还不出（还没挂上东西）', () => {
    uploadImageFileAPI.mockReturnValue(new Promise(() => {}))
    renderRail()
    act(() => {
      void assetsRef.current.uploadImageFile(
        new File(['a'], 'a.png', { type: 'image/png' }),
      )
    })
    expect(screen.getByRole('status', { name: T('uploading') })).toBeVisible()
    expect(screen.queryByTestId('video-asset-send-mode')).toBeNull()
  })
})
