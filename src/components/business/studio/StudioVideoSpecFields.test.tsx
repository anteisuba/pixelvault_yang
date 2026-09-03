import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { StudioVideoSpecFields } from './StudioVideoSpecFields'

/**
 * 视频规格四档的**取值域**本体（`StudioVideoSpecPopover` 与
 * `StudioMobileSpecSheet` 共用的那一份）。
 *
 * 桌面浮层那边的判据（档位实算 / 摘要只印候选内的值 / 全空不渲染）已经在
 * `StudioVideoSpecPopover.test.tsx` 里钉着 —— 那些断言现在穿过的正是这个组件。
 * 这里只补它**独有**的一件事：移动端 sheet 这个宿主要把同一组药丸撑到 44px
 * 命中区，而桌面那份一个像素都不能动。
 */

const mockDispatch = vi.hoisted(() => vi.fn())
const mockState = vi.hoisted(() => ({
  value: {
    panels: { videoSpec: false },
    videoDuration: 5,
    videoResolution: '720p' as string | null,
    videoGenerateAudio: null as boolean | null,
    aspectRatio: '16:9',
    selectedOptionId: 'workspace:seedance-2.5',
  },
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

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

/**
 * ⚠ **部分 mock**：只覆写档位那一个函数，保留真实的契约表 —— 手写一个
 * `{ parameters: { generateAudio: true } }` 等于让「不支持的档不渲染」这条规则
 * 在本文件失效。（同 `StudioVideoSpecPopover.test.tsx` 的理由。）
 */
vi.mock('@/constants/video-model-send-plan', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/constants/video-model-send-plan')>()
  return {
    ...actual,
    getVideoModelParameterOptions: () => ({
      durations: [5, 10] as readonly number[],
      resolutions: ['480p', '720p'] as readonly string[],
      aspectRatios: ['16:9', '9:16'] as readonly string[],
    }),
  }
})

beforeEach(() => {
  mockDispatch.mockClear()
})

describe('StudioVideoSpecFields', () => {
  it('三组档位在两个宿主里是**同一份**：时长 / 分辨率 / 比例逐条都在', () => {
    render(<StudioVideoSpecFields />)

    expect(screen.getByRole('radio', { name: '5s' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '480p' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '16:9' })).toBeInTheDocument()
  })

  it('⭐ `touch` 宿主（移动端 sheet）把药丸撑到 44px 命中区，桌面那份不加', () => {
    const { unmount } = render(<StudioVideoSpecFields touch />)
    expect(screen.getByRole('radio', { name: '5s' }).className).toContain(
      'min-h-11',
    )
    unmount()

    render(<StudioVideoSpecFields />)
    expect(screen.getByRole('radio', { name: '5s' }).className).not.toContain(
      'min-h-11',
    )
  })
})
