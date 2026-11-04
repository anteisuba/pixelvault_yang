import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import * as Toolbar from '@radix-ui/react-toolbar'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { useStudioVideoAssets } from '@/hooks/use-studio-video-assets'
import { text } from '@/test/i18n-text'
import { fakeStudioServer, renderWithStudio } from '@/test/studio-harness'

import { StudioVideoAssetChip } from './StudioVideoAssetChip'

/**
 * 视频台工具行的「素材」chip（owner 2026-09-27 视频台 A）：
 *  ① 四样都在菜单里：上传图片 / 从素材库选图 / 选参考视频 / 添加音频；
 *  ② 挂满了、这个型号不收、还没选型号 —— 那一项灰着写原因（⛔ 不藏）；
 *  ③ 上传与素材库都走宿主那一份 assets（与输入框里的素材排同一份）。
 */

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/video',
  useRouter: () => ({ push: vi.fn() }),
}))
// 只假上传那一跳（api-client 边界）：真 `useStudioVideoAssets` 拿回 URL 后自己落槽。
const uploadImageFileAPI = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api-client/generation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api-client/generation')>()),
  uploadImageFileAPI,
}))

const T = (key: string, values?: Record<string, string | number>) =>
  text(`StudioVideoSlots.${key}`, values)
// 可灵 O3 Pro：首尾帧两格、不收参考图 / 视频 / 音频。
const KLING = () => text('Models.klingO3Pro.label')

/** 宿主：真 `useStudioVideoAssets()` 那一份交给 chip（与工具行同一接法）。 */
function Host() {
  const assets = useStudioVideoAssets()
  return (
    <Toolbar.Root>
      <StudioVideoAssetChip assets={assets} />
    </Toolbar.Root>
  )
}

/** 真工作台里挂 chip，选好型号（不选 = 还没选型号），打开菜单。 */
function renderChip({
  modelId,
  frames = [],
}: { modelId?: string; frames?: string[] } = {}) {
  const view = renderWithStudio(<Host />)
  act(() => {
    const { dispatch } = view.studio.current
    dispatch({ type: 'SET_OUTPUT_TYPE', payload: 'video' })
    dispatch({
      type: 'SET_OPTION_ID',
      payload: modelId ? `workspace:${modelId}` : '',
    })
    frames.forEach((url, index) =>
      dispatch({
        type: 'SET_VIDEO_FRAME_SLOT',
        payload: { slot: index === 0 ? 'first' : 'last', url },
      }),
    )
  })
  fireEvent.click(screen.getByRole('button', { name: T('chipLabel') }))
  return view.studio
}

const item = (key: string) =>
  screen.getByRole('button', { name: new RegExp(`^${T(key)}`) })

beforeEach(() => {
  fakeStudioServer()
  uploadImageFileAPI.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe('视频台 · 「素材」chip', () => {
  it('这个型号不收参考视频和音频：那两项灰着写原因（⛔ 不藏）', () => {
    renderChip({ modelId: AI_MODELS.KLING_O3_PRO })
    expect(item('uploadImage')).toBeEnabled()
    const video = item('pickVideo')
    expect(video).toBeDisabled()
    expect(video).toHaveTextContent(T('menu.noVideo', { model: KLING() }))
    expect(item('addAudio')).toHaveTextContent(
      T('menu.noAudio', { model: KLING() }),
    )
    expect(screen.getByText(T('menu.dropHint'))).toBeInTheDocument()
  })

  it('首尾帧两格都占了：上传与选图灰着，说挂了几张、最多几张', () => {
    renderChip({
      modelId: AI_MODELS.KLING_O3_PRO,
      frames: [
        'https://cdn.example.com/a.png',
        'https://cdn.example.com/b.png',
      ],
    })
    const upload = item('uploadImage')
    expect(upload).toBeDisabled()
    expect(upload).toHaveTextContent(T('menu.imagesFull', { count: 2, max: 2 }))
    expect(item('pickImage')).toBeDisabled()
  })

  it('还没选型号：说「先选型号」，⛔ 不说一个空名字「不收」', () => {
    renderChip()
    expect(item('uploadImage')).toHaveTextContent(T('menu.pickModel'))
    expect(
      screen.queryByText(T('menu.noImage', { model: '' })),
    ).not.toBeInTheDocument()
  })

  it('上传：选几张传几张，一张一张走宿主那份 assets', async () => {
    uploadImageFileAPI
      .mockResolvedValueOnce({
        success: true,
        data: { generation: { url: 'https://cdn.test/a.png' } },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { generation: { url: 'https://cdn.test/b.png' } },
      })
    const studio = renderChip({ modelId: AI_MODELS.KLING_O3_PRO })
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    const files = [
      new File(['a'], 'a.png', { type: 'image/png' }),
      new File(['b'], 'b.png', { type: 'image/png' }),
    ]
    Object.defineProperty(input, 'files', { value: files })
    fireEvent.change(input)
    // 按选的顺序落进首帧、尾帧。
    await waitFor(() =>
      expect(studio.current.state.videoFrameSlots).toEqual({
        first: 'https://cdn.test/a.png',
        last: 'https://cdn.test/b.png',
      }),
    )
  })

  it('素材库选参考视频：打开只列视频的素材库', async () => {
    renderChip({ modelId: AI_MODELS.SEEDANCE_25 })
    fireEvent.click(item('pickVideo'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('添加音频：打开音频设置那一面板', () => {
    const studio = renderChip({ modelId: AI_MODELS.SEEDANCE_25 })
    fireEvent.click(item('addAudio'))
    expect(studio.current.state.panels.videoAudio).toBe(true)
  })
})
