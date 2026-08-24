import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import { StudioVideoSpecPopover } from './StudioVideoSpecPopover'

const mockDispatch = vi.hoisted(() => vi.fn())
const mockState = vi.hoisted(() => ({
  value: {
    panels: { videoSpec: false },
    videoDuration: 5,
    videoResolution: '720p' as string | null,
    aspectRatio: '16:9',
    selectedOptionId: 'workspace:seedance-2.5',
  },
}))
const mockOptions = vi.hoisted(() => ({
  value: {
    durations: [5, 10] as readonly number[],
    resolutions: ['480p', '720p'] as readonly string[],
    aspectRatios: ['16:9', '9:16'] as readonly string[],
  },
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

// Radix Slider 在 mount 时量尺寸；jsdom 没有 ResizeObserver（与
// StudioSfxSpecPopover 同一道替身）。
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', MockResizeObserver)

vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({ state: mockState.value, dispatch: mockDispatch }),
}))

vi.mock('@/hooks/use-video-model-options', () => ({
  useVideoModelOptions: () => ({
    selectedModel: { modelId: 'seedance-2.5', adapterType: 'volcengine' },
  }),
}))

vi.mock('@/constants/video-model-send-plan', () => ({
  getVideoModelParameterOptions: () => mockOptions.value,
}))

vi.mock('@/components/business/studio-shared/primitives/tool-surface', () => ({
  StudioToolSurface: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  StudioToolSurfaceTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  StudioToolPopoverContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  StudioRatioGlyph: () => <span />,
  studioChipActiveClass: 'studio-chip-active',
  studioSegButtonClass: '',
  studioSegInactiveClass: '',
}))

/**
 * 这颗浮层在本机真机上验不到满态 —— 视频模型全部缺 API key，缺 key 的行按
 * Hard Rule 8 走 QuickSetupDialog 而不是选中，于是 `selectedModel` 永远是空、
 * 三组档位永远是空数组。所以它的三条判据钉在这里。
 */
describe('StudioVideoSpecPopover', () => {
  beforeEach(() => {
    mockDispatch.mockClear()
    mockState.value = {
      panels: { videoSpec: false },
      videoDuration: 5,
      videoResolution: '720p',
      aspectRatio: '16:9',
      selectedOptionId: 'workspace:seedance-2.5',
    }
    mockOptions.value = {
      durations: [5, 10],
      resolutions: ['480p', '720p'],
      aspectRatios: ['16:9', '9:16'],
    }
  })

  it('触发器摘要写全三档，收起也知道下一版长什么样', () => {
    render(<StudioVideoSpecPopover />)

    expect(screen.getByRole('button', { name: 'specLabel' })).toHaveTextContent(
      '5s · 720p · 16:9',
    )
  })

  it('⭐ 摘要只印**确实在候选里**的值 —— 印一个点不回去的值比不印更糟', () => {
    // 换了模型：新型号只到 480p，而 state 里还留着上一个型号的 720p。
    mockOptions.value = {
      durations: [5, 10],
      resolutions: ['480p'],
      aspectRatios: ['16:9', '9:16'],
    }
    render(<StudioVideoSpecPopover />)

    const trigger = screen.getByRole('button', { name: 'specLabel' })
    expect(trigger).toHaveTextContent('5s · 16:9')
    expect(trigger).not.toHaveTextContent('720p')
  })

  it('⭐ 某一档模型不支持时**整组不渲染**，不画点了没用的按钮（契约 R3）', () => {
    mockOptions.value = {
      durations: [],
      resolutions: ['480p', '720p'],
      aspectRatios: ['16:9'],
    }
    render(<StudioVideoSpecPopover />)

    expect(screen.queryByText('durationLabel')).not.toBeInTheDocument()
    expect(screen.getByText('resolutionLabel')).toBeInTheDocument()
    expect(screen.getByText('aspectRatioLabel')).toBeInTheDocument()
  })

  it('⭐ 三组全空就整块不渲染，连「规格」标签都不留（没选模型时的常态）', () => {
    mockOptions.value = { durations: [], resolutions: [], aspectRatios: [] }
    const { container } = render(<StudioVideoSpecPopover />)

    expect(container).toBeEmptyDOMElement()
  })

  it('目录声明了产品不支持的比例时把它滤掉', () => {
    mockOptions.value = {
      durations: [5],
      resolutions: [],
      // 21:9 不在 STUDIO_VIDEO_ASPECT_RATIOS 里
      aspectRatios: ['16:9', '21:9'],
    }
    render(<StudioVideoSpecPopover />)

    expect(screen.getByRole('radio', { name: '16:9' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: '21:9' })).toBeNull()
  })

  it('再点一次已选中的分辨率清回 null —— 交给 provider 默认这条出路不能丢', () => {
    render(<StudioVideoSpecPopover />)

    fireEvent.click(screen.getByRole('radio', { name: '720p' }))

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_VIDEO_RESOLUTION',
      payload: null,
    })
  })

  it('⭐ 档位多到铺不下时换成滑条 —— 27 颗药丸是一面墙', () => {
    mockOptions.value = {
      durations: Array.from({ length: 27 }, (_, i) => i + 4),
      resolutions: [],
      aspectRatios: [],
    }
    mockState.value = { ...mockState.value, videoDuration: 24 }
    render(<StudioVideoSpecPopover />)

    expect(screen.getByRole('slider')).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: '24s' })).toBeNull()
    // 读数印的是当前那一档，不是 index。两处都印：触发器的摘要 + 滑条右上的读数
    // （真机上两者不同屏，这里的替身把浮层摊平了）。
    expect(screen.getAllByText('24s')).toHaveLength(2)
  })

  it('档位少时保持药丸 —— 一眼比完，且当前值不在档位里时天然「一个都没选中」', () => {
    render(<StudioVideoSpecPopover />)

    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.getByRole('radio', { name: '5s' })).toBeInTheDocument()
  })

  it('时长与比例照常派发', () => {
    render(<StudioVideoSpecPopover />)

    fireEvent.click(screen.getByRole('radio', { name: '10s' }))
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_VIDEO_DURATION',
      payload: 10,
    })

    fireEvent.click(screen.getByRole('radio', { name: '9:16' }))
    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_ASPECT_RATIO',
      payload: '9:16',
    })
  })
})
