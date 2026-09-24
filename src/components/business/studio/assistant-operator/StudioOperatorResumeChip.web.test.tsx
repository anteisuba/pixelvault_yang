import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StudioOperatorResumeChip } from './StudioOperatorResumeChip'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

describe('StudioOperatorResumeChip', () => {
  it('先说为什么断了，再给「从第 N 步继续」', () => {
    const onResume = vi.fn()
    render(
      <StudioOperatorResumeChip
        resume={{ stepNumber: 4, failedReason: '网络掉线', onResume }}
      />,
    )
    expect(screen.getByTestId('operator-round-resume-reason')).toBeTruthy()
    const chip = screen.getByTestId('operator-round-resume')
    expect(chip.dataset.step).toBe('4')
    fireEvent.click(chip)
    expect(onResume).toHaveBeenCalled()
  })

  it('不是挂掉的（刷新 / 叫停）就只有按钮', () => {
    render(
      <StudioOperatorResumeChip
        resume={{ stepNumber: 2, onResume: vi.fn() }}
      />,
    )
    expect(screen.queryByTestId('operator-round-resume-reason')).toBeNull()
  })
})
