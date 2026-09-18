import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { ApiKeyHealthStatus, UserApiKeyRecord } from '@/types'

import { SettingsKeysSection } from './SettingsKeysSection'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}:${key}`,
  useFormatter: () => ({ relativeTime: () => 'just now' }),
}))

vi.mock('@/components/business/studio-shared/setup/QuickSetupDialog', () => ({
  QuickSetupDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="quick-setup" /> : null,
}))

const mockUseApiKeysContext = vi.hoisted(() => vi.fn())
vi.mock('@/contexts/api-keys-context', () => ({
  useApiKeysContext: mockUseApiKeysContext,
}))

vi.mock('@/hooks/use-monthly-usage', () => ({
  useMonthlyUsage: () => ({
    month: '2026-09',
    providers: [
      {
        adapterType: 'fal',
        label: 'fal.ai',
        requests: 12,
        estimatedCostUsd: 3,
      },
    ],
    totalRequests: 12,
    totalEstimatedCostUsd: 3,
    runner: null,
    isLoading: false,
    refresh: vi.fn(),
  }),
}))

function keyRecord(
  id: string,
  adapterType: AI_ADAPTER_TYPES,
  label: string,
  providerLabel = label,
): UserApiKeyRecord {
  return {
    id,
    modelId: 'whatever',
    adapterType,
    providerConfig: { label: providerLabel, baseUrl: 'https://example.com' },
    label,
    maskedKey: '••••••••',
    isActive: true,
    createdAt: new Date('2026-09-01T00:00:00Z'),
  }
}

function mountWith(
  keys: UserApiKeyRecord[],
  healthMap: Record<string, ApiKeyHealthStatus>,
) {
  mockUseApiKeysContext.mockReturnValue({
    keys,
    isLoading: false,
    error: null,
    healthMap,
    verifiedAtMap: { 'fal-1': Date.parse('2026-09-18T00:00:00Z') },
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    verify: vi.fn(),
    refresh: vi.fn(),
  })
  return render(<SettingsKeysSection />)
}

/** 行的可读快照：provider 名 + 状态一句。 */
function rowSummaries(): string[] {
  return screen
    .getAllByRole('listitem')
    .map((item) => item.textContent ?? '')
    .filter(Boolean)
}

describe('SettingsKeysSection', () => {
  beforeEach(() => {
    mockUseApiKeysContext.mockReset()
  })

  it('sorts failing providers first, then configured, then unconfigured', () => {
    mountWith(
      [
        keyRecord('fal-1', AI_ADAPTER_TYPES.FAL, 'fal.ai'),
        keyRecord('openai-1', AI_ADAPTER_TYPES.OPENAI, 'OpenAI'),
      ],
      { 'fal-1': 'available', 'openai-1': 'failed' },
    )

    const summaries = rowSummaries()
    const openAiIndex = summaries.findIndex((text) => text.includes('OpenAI'))
    const falIndex = summaries.findIndex((text) => text.includes('fal.ai'))
    const unconfiguredIndex = summaries.findIndex((text) =>
      text.includes('Settings:keys.status.unconfigured'),
    )

    expect(openAiIndex).toBeGreaterThanOrEqual(0)
    expect(openAiIndex).toBeLessThan(falIndex)
    expect(falIndex).toBeLessThan(unconfiguredIndex)
    // OpenAI 那把没校验过的时间戳 —— 状态句就退到不带时间的那一条。
    expect(summaries[openAiIndex]).toContain('Settings:keys.status.invalid')
  })

  it('offers "replace key" on a failing row and "set up" on an unconfigured one', () => {
    mountWith([keyRecord('openai-1', AI_ADAPTER_TYPES.OPENAI, 'OpenAI')], {
      'openai-1': 'failed',
    })

    expect(screen.getByText('Settings:keys.replaceKey')).toBeTruthy()
    expect(
      screen.getAllByText('Settings:keys.configure').length,
    ).toBeGreaterThan(0)
  })

  it('expands a configured provider into its individual keys', () => {
    mountWith(
      [
        keyRecord('fal-1', AI_ADAPTER_TYPES.FAL, 'personal', 'fal.ai'),
        keyRecord('fal-2', AI_ADAPTER_TYPES.FAL, 'work', 'fal.ai'),
      ],
      { 'fal-1': 'available', 'fal-2': 'available' },
    )

    expect(screen.queryByText('Settings:keys.addAnother')).toBeNull()

    fireEvent.click(
      screen.getByRole('button', { name: 'Settings:keys.toggleKeys' }),
    )

    expect(screen.getByText('personal')).toBeTruthy()
    expect(screen.getByText('work')).toBeTruthy()
    expect(screen.getByText('Settings:keys.addAnother')).toBeTruthy()
  })

  it('falls back to the unconfigured state once the last key is gone', () => {
    const { unmount } = mountWith(
      [keyRecord('fal-1', AI_ADAPTER_TYPES.FAL, 'fal.ai')],
      { 'fal-1': 'available' },
    )
    expect(
      screen.getByText('Settings:keys.status.healthyWithStamp'),
    ).toBeTruthy()
    unmount()

    mountWith([], {})
    expect(
      screen.queryByText('Settings:keys.status.healthyWithStamp'),
    ).toBeNull()
    expect(
      screen.getAllByText('Settings:keys.status.unconfigured').length,
    ).toBeGreaterThan(0)
  })

  it('shows this month spend only for providers that have one', () => {
    mountWith([keyRecord('fal-1', AI_ADAPTER_TYPES.FAL, 'fal.ai')], {
      'fal-1': 'available',
    })

    const spendCells = screen.getAllByText('Settings:keys.monthlySpend')
    expect(spendCells).toHaveLength(1)
  })
})
