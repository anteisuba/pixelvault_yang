import { render, screen, fireEvent } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { LORA_TRAINING_PRESETS } from '@/constants/lora'

import en from '@/messages/en.json'

const mockIsMobile = vi.hoisted(() => vi.fn(() => false))

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: mockIsMobile,
}))

// 表单与任务列表整套状态机（上传 / 配置 / 提交 / 轮询）住在 LoraTrainingDialog
// 里，向导壳只负责把它们摆在两步里 —— 这个测试锁的是壳，不是那套状态机。
vi.mock('@/components/business/LoraTrainingDialog', () => ({
  LoraTrainingForm: ({
    selectedPresetId,
    onRequestPreset,
  }: {
    selectedPresetId: string | null
    onRequestPreset: () => void
  }) => (
    <div data-testid="training-form" data-preset={selectedPresetId ?? ''}>
      <button type="button" onClick={onRequestPreset}>
        request-preset
      </button>
    </div>
  ),
  LoraTrainingHistorySidebar: () => <div data-testid="training-history" />,
}))

vi.mock(
  '@/components/business/studio/lora/training/MobileTrainingSheet',
  () => ({
    MobileTrainingSheet: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="mobile-training-sheet">{children}</div>
    ),
  }),
)

import { TrainWizard } from './TrainWizard'

function renderWizard() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <TrainWizard />
    </NextIntlClientProvider>,
  )
}

describe('TrainWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsMobile.mockReturnValue(false)
  })

  it('renders both steps plus the history rail on desktop', () => {
    renderWizard()

    expect(
      screen.getByText(en.LoraTraining.presetRailTitle),
    ).toBeInTheDocument()
    expect(screen.getByTestId('training-form')).toBeInTheDocument()
    expect(screen.getByTestId('training-history')).toBeInTheDocument()
    expect(
      screen.getByText(en.LoraTraining.historyOutputHint),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('mobile-training-sheet')).toBeNull()
  })

  it('hands the picked preset down to the form', () => {
    renderWizard()

    const preset = LORA_TRAINING_PRESETS.find((p) => p.available)!
    expect(screen.getByTestId('training-form')).toHaveAttribute(
      'data-preset',
      '',
    )

    fireEvent.click(
      document.querySelector(`[data-preset-id="${preset.id}"]`) as HTMLElement,
    )
    expect(screen.getByTestId('training-form')).toHaveAttribute(
      'data-preset',
      preset.id,
    )
  })

  it('scrolls step 1 back into view when the form asks for a preset', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    renderWizard()

    fireEvent.click(screen.getByText('request-preset'))
    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: 'center' }),
    )
  })

  it('puts the form inside the sheet on mobile', async () => {
    mockIsMobile.mockReturnValue(true)
    renderWizard()

    // 手机 sheet 是 `next/dynamic` 懒加载的（Vaul 不进桌面 SSR 载荷），
    // 第一帧只有占位，得等那次 import 落地。
    const sheet = await screen.findByTestId('mobile-training-sheet')
    expect(sheet).toContainElement(screen.getByTestId('training-form'))
    expect(screen.getByTestId('training-history')).toBeInTheDocument()
  })
})
