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
    // 卡边那条线（轨道 + 进度）是 StudioGeneratingProgress 的两条 path，⛔ 这里不重画一份。
    expect(container.querySelectorAll('path')).toHaveLength(2)
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

  it('矮卡没有真进度时按估算走（⛔ 一直停在 0%）', () => {
    render(
      <NodeFrameProgress
        elapsedSeconds={8}
        stageLabel="正在合成语音"
        variant="line"
      />,
    )
    // 8 秒 = 「连接模型」段走完 = 45%。
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '45',
    )
  })

  it('失败：不再是进度条，中间一句原因 +「重试」', () => {
    const onRetry = vi.fn()
    render(
      <NodeFrameProgress
        elapsedSeconds={20}
        stageLabel="正在生成图像"
        failure={{
          message: '没出图 · 审核拦下了',
          retryLabel: '重试',
          onRetry,
        }}
      />,
    )
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent('没出图 · 审核拦下了')
    screen.getByRole('button', { name: '重试' }).click()
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
