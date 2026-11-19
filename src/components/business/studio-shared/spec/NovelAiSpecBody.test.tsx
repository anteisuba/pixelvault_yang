import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { NovelAiSpecBody } from './NovelAiSpecBody'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

describe('NovelAiSpecBody', () => {
  it('切换尺寸档位时自动保持当前方向（竖 → 竖、正方 → 壁纸竖）', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <NovelAiSpecBody width={832} height={1216} onChange={onChange} />,
    )

    fireEvent.click(screen.getByRole('radio', { name: 'novelAi.tier.large' }))
    expect(onChange).toHaveBeenLastCalledWith({ width: 1024, height: 1536 })

    rerender(<NovelAiSpecBody width={1024} height={1024} onChange={onChange} />)
    fireEvent.click(
      screen.getByRole('radio', { name: 'novelAi.tier.wallpaper' }),
    )
    expect(onChange).toHaveBeenLastCalledWith({ width: 1088, height: 1920 })
  })

  it('自定义宽高：合法值立即回调，非 64 倍数失焦吸附，超总像素报红字，互换按钮对调', () => {
    const onChange = vi.fn()
    render(
      <NovelAiSpecBody
        width={832}
        height={1216}
        opusCost="free"
        onChange={onChange}
      />,
    )

    const widthInput = screen.getByLabelText('novelAi.widthLabel')
    const heightInput = screen.getByLabelText('novelAi.heightLabel')

    fireEvent.change(widthInput, { target: { value: '1024' } })
    expect(onChange).toHaveBeenLastCalledWith({ width: 1024, height: 1216 })

    fireEvent.change(widthInput, { target: { value: '1000' } })
    fireEvent.blur(widthInput)
    expect(onChange).toHaveBeenLastCalledWith({ width: 1024, height: 1216 })

    fireEvent.change(widthInput, { target: { value: '2048' } })
    fireEvent.change(heightInput, { target: { value: '2048' } })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'novelAi.maxPixelsError',
    )

    fireEvent.click(screen.getByLabelText('novelAi.swapDimensions'))
    expect(onChange).toHaveBeenLastCalledWith({ width: 1216, height: 832 })
  })

  it('遮罩重绘锁定时禁用所有输入和按钮并展示锁原因', () => {
    const onChange = vi.fn()
    render(
      <NovelAiSpecBody
        width={1024}
        height={1536}
        opusCost="metered"
        locked
        lockedHint="locked-for-inpaint"
        onChange={onChange}
      />,
    )

    expect(screen.getByLabelText('novelAi.widthLabel')).toBeDisabled()
    expect(screen.getByLabelText('novelAi.heightLabel')).toBeDisabled()
    expect(screen.getByLabelText('novelAi.swapDimensions')).toBeDisabled()
    expect(screen.getAllByText('locked-for-inpaint').length).toBeGreaterThan(0)
    expect(document.querySelector('[data-novelai-opus-cost]')).toHaveAttribute(
      'data-novelai-opus-cost',
      'metered',
    )
  })
})
