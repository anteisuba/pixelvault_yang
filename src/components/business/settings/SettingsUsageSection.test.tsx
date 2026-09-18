import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { SettingsUsageSection } from './SettingsUsageSection'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}:${key}`,
  useFormatter: () => ({ dateTime: () => '10-01' }),
}))

const mockUseMonthlyUsage = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/use-monthly-usage', () => ({
  useMonthlyUsage: mockUseMonthlyUsage,
}))

function cellsOf(rowLabel: string): string[] {
  const row = screen
    .getAllByRole('row')
    .find((candidate) => candidate.textContent?.includes(rowLabel))
  if (!row) throw new Error(`row ${rowLabel} not rendered`)
  return [...row.querySelectorAll('td')].map(
    (cell) => cell.textContent?.trim() ?? '',
  )
}

describe('SettingsUsageSection', () => {
  it('totals requests and cost across providers and the runner quota', () => {
    mockUseMonthlyUsage.mockReturnValue({
      month: '2026-09',
      providers: [
        {
          adapterType: 'fal',
          label: 'fal.ai',
          requests: 128,
          estimatedCostUsd: 61.1,
        },
        {
          adapterType: 'openai',
          label: 'OpenAI',
          requests: 40,
          estimatedCostUsd: 25.1,
        },
      ],
      totalRequests: 168,
      totalEstimatedCostUsd: 86.2,
      runner: {
        enabled: true,
        used: 42,
        limit: 300,
        remaining: 258,
        platformEnabled: true,
      },
      isLoading: false,
      refresh: vi.fn(),
    })

    render(<SettingsUsageSection />)

    expect(cellsOf('fal.ai')).toEqual(['fal.ai', '128', '$61.10'])
    // runner 的次数格是额度读数，花费格是重置日期（平台出资，用户付 $0）。
    expect(cellsOf('Settings:usage.runnerLabel')[1]).toBe(
      'Settings:usage.runnerQuota',
    )
    // 合计的次数把 runner 那 42 次也算进来（168 + 42）。
    expect(cellsOf('Settings:usage.total')).toEqual([
      'Settings:usage.total',
      '210',
      '$86.20',
    ])
  })

  it('shows a request count only when no model in that provider has a unit price', () => {
    mockUseMonthlyUsage.mockReturnValue({
      month: '2026-09',
      providers: [
        {
          adapterType: 'novelai',
          label: 'NovelAI',
          requests: 9,
          estimatedCostUsd: null,
        },
      ],
      totalRequests: 9,
      totalEstimatedCostUsd: null,
      runner: null,
      isLoading: false,
      refresh: vi.fn(),
    })

    render(<SettingsUsageSection />)

    expect(cellsOf('NovelAI')).toEqual(['NovelAI', '9', ''])
    expect(cellsOf('Settings:usage.total')).toEqual([
      'Settings:usage.total',
      '9',
      '',
    ])
  })
})
