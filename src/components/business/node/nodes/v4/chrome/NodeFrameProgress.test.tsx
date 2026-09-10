import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

import { NodeFrameProgress } from './NodeFrameProgress'

describe('NodeFrameProgress', () => {
  it('frame 档复用 StudioGeneratingProgress，并把圆角对齐 --radius-node', () => {
    const { container } = render(
      <NodeFrameProgress
        elapsedSeconds={3}
        realProgress={64}
        stageLabel="正在生成图像"
      />,
    )
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '64')
    expect(bar.getAttribute('style')).toContain('var(--radius-node)')
    // 描边环是 StudioGeneratingProgress 的 svg rect，⛔ 这里不重画一份。
    expect(container.querySelectorAll('rect')).toHaveLength(2)
  })

  it('矮卡走 line 档：一条进度线 + 百分比，没有描边环', () => {
    const { container } = render(
      <NodeFrameProgress
        elapsedSeconds={3}
        realProgress={40}
        stageLabel="正在合成语音"
        variant="line"
      />,
    )
    expect(container.querySelector('svg')).toBeNull()
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '40',
    )
    expect(screen.getByText('40%')).toBeInTheDocument()
  })
})
