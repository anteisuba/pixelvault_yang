import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import type { SpecChipModel } from '@/lib/spec-chip-model'

import { SpecChip } from './SpecChip'

// 文案只验「哪条理由被选中」，不验译文本身 —— 回一个 `key(params)` 的可读串。
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}))

beforeAll(() => {
  // Radix 的浮层在 jsdom 里要这三样才肯挂载。
  window.HTMLElement.prototype.hasPointerCapture = () => false
  window.HTMLElement.prototype.setPointerCapture = () => {}
  window.HTMLElement.prototype.releasePointerCapture = () => {}
  window.HTMLElement.prototype.scrollIntoView = () => {}
  // Radix Slider 量轨道宽度用的是它。
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

const BASE: SpecChipModel = {
  ratios: [
    { value: '1:1', supported: true },
    { value: '16:9', supported: true },
    { value: '21:9', supported: false },
  ],
  ratioLocked: false,
  resolutions: [
    { value: '1K', supported: true, pricePerSecond: null },
    { value: '2K', supported: true, pricePerSecond: null },
    { value: '4K', supported: false, pricePerSecond: null },
  ],
  durations: [],
  durationSeconds: null,
  pricePerSecond: null,
  totalPrice: null,
  summary: '1:1 · 2K',
  resolutionNote: { kind: 'unsupported', tier: '4K', maxSupported: '2K' },
  isEmpty: false,
}

function renderChip(
  overrides: Partial<SpecChipModel> = {},
  props: Partial<React.ComponentProps<typeof SpecChip>> = {},
) {
  const onAspectRatioChange = vi.fn()
  const onResolutionChange = vi.fn()
  const onDurationChange = vi.fn()
  const utils = render(
    <SpecChip
      model={{ ...BASE, ...overrides }}
      ariaLabel="spec"
      resolutionLabel="resolutionLabel"
      aspectRatio="1:1"
      onAspectRatioChange={onAspectRatioChange}
      resolution="2K"
      onResolutionChange={onResolutionChange}
      onDurationChange={onDurationChange}
      {...props}
    />,
  )
  return { ...utils, onAspectRatioChange, onResolutionChange, onDurationChange }
}

function openChip() {
  const chip = document.querySelector('[data-spec-chip-state]') as HTMLElement
  fireEvent.pointerDown(chip, { button: 0 })
  fireEvent.click(chip)
  return chip
}

describe('SpecChip · chip 三态', () => {
  it('默认态；打开中换成 open；⛔ chip 上不显价', () => {
    renderChip()
    const chip = document.querySelector('[data-spec-chip-state]') as HTMLElement

    expect(chip).toHaveAttribute('data-spec-chip-state', 'default')
    expect(chip.textContent).toContain('1:1 · 2K')
    expect(chip.textContent).not.toContain('$')

    openChip()
    expect(chip).toHaveAttribute('data-spec-chip-state', 'open')
  })

  it('`flashSignal` 从空变成非空时闪一次 warning；回到空不再闪', () => {
    const { rerender } = renderChip()
    const chip = document.querySelector('[data-spec-chip-state]') as HTMLElement
    expect(chip).toHaveAttribute('data-spec-chip-state', 'default')

    const props = {
      model: BASE,
      ariaLabel: 'spec',
      resolutionLabel: 'resolutionLabel',
      aspectRatio: '1:1',
      onAspectRatioChange: vi.fn(),
      resolution: '2K',
      onResolutionChange: vi.fn(),
    }
    rerender(<SpecChip {...props} flashSignal="snapped:16:9" />)
    expect(document.querySelector('[data-spec-chip-state]')).toHaveAttribute(
      'data-spec-chip-state',
      'flash',
    )

    // 宿主写回状态后信号回到空 —— 那不是第二次事故，不该再闪。
    rerender(<SpecChip {...props} flashSignal={null} />)
    expect(document.querySelector('[data-spec-chip-state]')).toHaveAttribute(
      'data-spec-chip-state',
      'default',
    )
  })
})

describe('SpecChip · 分段', () => {
  it('不支持的档灰显划线、点不动，hover 看得到原因', () => {
    const { onAspectRatioChange } = renderChip()
    openChip()

    const ratio21 = screen
      .getAllByRole('radio')
      .find((node) => node.textContent?.includes('21:9')) as HTMLElement
    expect(ratio21).toHaveAttribute('aria-disabled', 'true')
    expect(ratio21.className).toContain('line-through')
    expect(ratio21).toHaveAttribute('title', 'tierUnsupported:21:9')

    fireEvent.click(ratio21)
    expect(onAspectRatioChange).not.toHaveBeenCalled()
  })

  it('段标题右侧那行小字先说不支持的档（带这个模型的上限）', () => {
    renderChip()
    openChip()
    expect(screen.getByText('resolutionCeiling:4K,2K')).toBeInTheDocument()
  })

  it('有价差时那行小字写价差', () => {
    renderChip({
      resolutions: [
        { value: '720p', supported: true, pricePerSecond: 0.1 },
        { value: '1080p', supported: true, pricePerSecond: 0.2 },
      ],
      resolutionNote: {
        kind: 'priceDelta',
        tier: '1080p',
        deltaPerSecond: 0.1,
      },
    })
    openChip()
    expect(screen.getByText('priceDelta:1080p,$0.10')).toBeInTheDocument()
  })

  it('首帧锁住比例时那一组禁用**而不是移除**，并说清怎么解除', () => {
    const { onAspectRatioChange } = renderChip(
      { ratioLocked: true, summary: '2K' },
      { ratioLockedHint: '已放首帧，宽高比跟随这张图' },
    )
    openChip()

    const ratio = screen
      .getAllByRole('radio')
      .find((node) => node.textContent?.includes('16:9')) as HTMLElement
    expect(ratio).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(ratio)
    expect(onAspectRatioChange).not.toHaveBeenCalled()
    expect(screen.getByText('已放首帧，宽高比跟随这张图')).toBeInTheDocument()
  })
})

describe('SpecChip · 时长', () => {
  const VIDEO: Partial<SpecChipModel> = {
    durations: [4, 5, 6, 7, 8, 9, 10],
    durationSeconds: 5,
    pricePerSecond: 0.213,
    totalPrice: 1.065,
    summary: '16:9 · 720p · 5s',
  }

  it('>3 档走滚动条：⛔ 没有刻度，气泡写秒数，段标题右侧只写合计价', () => {
    renderChip(VIDEO)
    openChip()

    expect(document.querySelector('[data-spec-duration-slider]')).not.toBeNull()
    expect(
      document.querySelector('[data-spec-duration-bubble]')?.textContent,
    ).toBe('durationSeconds:5')
    // 合计价走 `formatUnitPriceAmount`（两位小数）。秒数**不在**这一行
    // （owner 批注 42：段标题右侧只显合计价）。
    const total = document.querySelector('[data-spec-duration-total]')
    expect(total?.textContent).toBe('$1.06')
  })

  it('≤3 档退回按钮（Veo 4 / 6 / 8 s），点一下回传那一档', () => {
    const { onDurationChange } = renderChip({
      ...VIDEO,
      durations: [4, 6, 8],
      durationSeconds: 6,
    })
    openChip()

    expect(document.querySelector('[data-spec-duration-slider]')).toBeNull()
    const eight = screen
      .getAllByRole('radio')
      .find((node) => node.textContent === 'durationSeconds:8') as HTMLElement
    fireEvent.click(eight)
    expect(onDurationChange).toHaveBeenCalledWith(8)
  })

  it('缺价时那一行整条不渲染 —— ⛔ 不写「$0」', () => {
    renderChip({ ...VIDEO, pricePerSecond: null, totalPrice: null })
    openChip()
    expect(document.querySelector('[data-spec-duration-total]')).toBeNull()
  })
})

describe('SpecChip · 附加段', () => {
  // owner 2026-09-20「没必要做收放」：虚线以下的内容直接露着，⛔ 没有折叠行。
  it('宿主给的内容开弹层就在 DOM 里，且没有折叠开关', () => {
    renderChip({}, { more: <p>extra</p> })
    openChip()

    expect(screen.getByText('extra')).toBeInTheDocument()
    expect(
      document.querySelector('[data-spec-chip-more] button[aria-expanded]'),
    ).toBeNull()
  })

  it('没给 `more` 就整段不渲染', () => {
    renderChip()
    openChip()
    expect(document.querySelector('[data-spec-chip-more]')).toBeNull()
  })
})
