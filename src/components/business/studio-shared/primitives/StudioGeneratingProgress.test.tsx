import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GENERATION_COMPLETE_TOTAL_MS } from '@/constants/generation-progress'

vi.mock('motion/react', () => ({ useReducedMotion: () => false }))

import { StudioGeneratingProgress } from './StudioGeneratingProgress'

/**
 * 加载态 A「边即进度」（owner 2026-09-27 · 设计画布「加载态 A · 全部状态」）：
 *  ① 只有一条线：轨道 + 进度两条 path，进度 = `stroke-dasharray: p 100`；
 *  ② 失败就地说：线停在原处变灰，中间一句原因 +「重试」（⛔ 对话框）；
 *  ③ 窄格 / 画布缩小只写百分比，阶段词只给读屏；
 *  ④ 出图：线补满合拢 → 停一拍 → 淡出，然后才告诉宿主。
 */

function progressPath(container: HTMLElement) {
  return container.querySelectorAll('path')[1]
}

describe('StudioGeneratingProgress · 加载态 A', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('一条线：轨道 + 进度两条 path，进度就是 dasharray', () => {
    const { container } = render(
      <StudioGeneratingProgress elapsedSeconds={8} stageLabel="正在连接模型" />,
    )
    expect(container.querySelectorAll('path')).toHaveLength(2)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '45')
    expect(bar).toHaveAttribute('aria-label', '正在连接模型')
    expect(progressPath(container)).toHaveAttribute(
      'stroke-dasharray',
      '45 100',
    )
    expect(progressPath(container)).toHaveClass('studio-generation-edge')
  })

  it('失败：线停在最后走到的地方变灰，中间换成原因 +「重试」', () => {
    const onRetry = vi.fn()
    const { container, rerender } = render(
      <StudioGeneratingProgress elapsedSeconds={8} stageLabel="正在连接模型" />,
    )
    // 宿主失败后常把计时归零 —— 线 ⛔ 跟着退回 0。
    rerender(
      <StudioGeneratingProgress
        elapsedSeconds={0}
        stageLabel="正在准备提示词"
        failure={{
          message: '没出图 · 服务商的审核拦下了这一张',
          retryLabel: '重试',
          onRetry,
        }}
      />,
    )
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent(
      '没出图 · 服务商的审核拦下了这一张',
    )
    expect(progressPath(container)).toHaveAttribute(
      'stroke-dasharray',
      '45 100',
    )
    expect(progressPath(container)).toHaveClass(
      'studio-generation-edge--stopped',
    )
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('窄格与画布缩小：阶段词只给读屏', () => {
    const { rerender } = render(
      <StudioGeneratingProgress
        elapsedSeconds={20}
        stageLabel="正在生成图像"
        variant="compact"
      />,
    )
    // 窄于 160px 由容器查询收（jsdom 量不了宽度，只钉住那条规则在）。
    expect(screen.getByText('正在生成图像').parentElement).toHaveClass(
      '@max-4xs/progress:sr-only',
    )
    rerender(
      <StudioGeneratingProgress
        elapsedSeconds={20}
        stageLabel="正在生成图像"
        variant="compact"
        hideStageLabel
      />,
    )
    expect(screen.getByText('正在生成图像').parentElement).toHaveClass(
      'sr-only',
    )
  })

  it('出图：线补满合拢，整段节拍走完才告诉宿主', () => {
    const onDone = vi.fn()
    const { container, rerender } = render(
      <StudioGeneratingProgress
        elapsedSeconds={20}
        stageLabel="正在生成图像"
      />,
    )
    rerender(
      <StudioGeneratingProgress
        elapsedSeconds={20}
        stageLabel="正在生成图像"
        isCompleting
        onCompleteAnimationDone={onDone}
      />,
    )
    expect(progressPath(container)).toHaveAttribute(
      'stroke-dasharray',
      '100 100',
    )
    expect(progressPath(container)).toHaveClass(
      'studio-generation-edge--closing',
    )
    act(() => {
      vi.advanceTimersByTime(GENERATION_COMPLETE_TOTAL_MS - 1)
    })
    expect(onDone).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('窄格失败：只写短句，完整原因留给读屏', () => {
    render(
      <StudioGeneratingProgress
        elapsedSeconds={0}
        stageLabel="正在准备提示词"
        variant="compact"
        failure={{
          message: '没出图 · 服务商超时',
          shortMessage: '没出图',
          retryLabel: '重试',
        }}
      />,
    )
    expect(screen.getByText('没出图 · 服务商超时')).toHaveClass(
      '@max-4xs/progress:sr-only',
    )
    expect(screen.getByText('没出图')).toHaveClass('@max-4xs/progress:inline')
    // 没给 onRetry 就不画键。
    expect(screen.queryByRole('button')).toBeNull()
  })
})
