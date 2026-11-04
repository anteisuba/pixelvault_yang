/**
 * 画布外观面板：真弹层、真滑杆、真素材挑选框（真 `useGallery` / 真导航 hook）。
 * 只假网络（素材库那几条接口）与 Clerk 登录态。
 */
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ userId: 'user_1', isSignedIn: true, isLoaded: true }),
}))

import { NODE_STUDIO_CANVAS_APPEARANCE_DEFAULT } from '@/constants/node-studio'
import { fakeServer, message, renderWithApp } from '@/test/app-harness'

import { CanvasAppearancePanel } from './CanvasAppearancePanel'

const WALLPAPER = {
  id: 'generation-wallpaper',
  url: 'https://cdn.example.com/wallpaper.jpg',
  outputType: 'IMAGE',
  prompt: 'wallpaper',
  model: 'test-model',
  provider: 'test-provider',
  width: 1600,
  height: 900,
  createdAt: '2026-09-28T00:00:00.000Z',
}

beforeAll(() => {
  // jsdom 不排版：挑选框的网格按容器宽度排行，给它一个桌面宽度。
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 960,
  })
  if (!('ResizeObserver' in globalThis)) {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {}
  }
})

beforeEach(() => {
  fakeServer()
    .on('GET', '/api/images', () =>
      Response.json({
        success: true,
        data: {
          generations: [WALLPAPER],
          page: 1,
          limit: 20,
          total: 1,
          hasMore: false,
          nextCursor: null,
        },
      }),
    )
    .on('GET', '/api/assets/section-counts', () =>
      Response.json({ success: true, data: {} }),
    )
    .on('GET', '/api/projects', () =>
      Response.json({ success: true, data: [] }),
    )
})

const t = (key: string) => message(`StudioNode.appearance.${key}`)

function renderPanel(props: Parameters<typeof CanvasAppearancePanel>[0]) {
  renderWithApp(<CanvasAppearancePanel {...props} />)
  fireEvent.click(screen.getByRole('button', { name: t('trigger') }))
}

describe('CanvasAppearancePanel', () => {
  it('点预设色、改自定义色：交回新的底色', () => {
    const onChange = vi.fn()
    renderPanel({ appearance: undefined, onChange })

    const presets = screen.getAllByRole('button', {
      name: new RegExp(t('presetColor').split('{')[0]!),
    })
    fireEvent.click(presets[0]!)
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ backgroundColor: '#FFFFFF' }),
    )
    // S10（2026-07-27，token-inversion §4.5）：预设精简为只留浅色，索引 1 是 #F4F4F3。
    fireEvent.click(presets[1]!)
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ backgroundColor: '#F4F4F3' }),
    )

    // 自定义是原生取色器（没有十六进制输入框）。
    fireEvent.change(screen.getByLabelText(t('customColor')), {
      target: { value: '#223344' },
    })
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ backgroundColor: '#223344' }),
    )
  })

  it('从素材库挑一张当壁纸；「恢复默认」清掉整套外观', async () => {
    const onChange = vi.fn()
    renderPanel({ appearance: undefined, onChange })

    fireEvent.click(screen.getByRole('button', { name: t('chooseImage') }))
    // 挑选框里那张素材（格子的名字取提示词）。
    fireEvent.click(
      await screen.findByRole('button', { name: WALLPAPER.prompt }),
    )

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        // 默认底是设计决策，断言跟着常量走。
        backgroundColor: NODE_STUDIO_CANVAS_APPEARANCE_DEFAULT.backgroundColor,
        image: {
          url: WALLPAPER.url,
          sourceGenerationId: WALLPAPER.id,
          fit: 'cover',
          opacity: 0.28,
        },
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: t('restoreDefault') }))
    expect(onChange).toHaveBeenLastCalledWith(undefined)
  })

  it('移除壁纸只拿掉图，选好的底色留着', () => {
    const onChange = vi.fn()
    renderPanel({
      appearance: {
        backgroundColor: '#171A16',
        image: { url: WALLPAPER.url, fit: 'cover', opacity: 0.5 },
      },
      onChange,
    })

    fireEvent.click(screen.getByRole('button', { name: t('removeImage') }))
    expect(onChange).toHaveBeenCalledWith({
      backgroundColor: '#171A16',
      image: undefined,
    })
  })
})
