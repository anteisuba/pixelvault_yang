/**
 * L2b：用量表连真 `useMonthlyUsage`（真单价表现算花费），只假网络
 * （`/api/usage/by-model`、`/api/runner/usage`）。
 */
import { screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AI_MODELS } from '@/constants/models'
import { getModelUnitPriceByStringId } from '@/constants/models/unit-prices'
import {
  getDefaultProviderConfig,
  getProviderLabel,
  type AI_ADAPTER_TYPES,
} from '@/constants/providers'
import { fakeServer, message, renderWithApp } from '@/test/app-harness'
import type { MonthlyUsageRow } from '@/types/usage'
import { SettingsUsageSection } from './SettingsUsageSection'

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isSignedIn: true }),
}))

const en = (path: string) => message(path, 'en')
const label = (adapter: string) =>
  getProviderLabel(getDefaultProviderConfig(adapter as AI_ADAPTER_TYPES))
const usd = (amount: number) => `$${amount.toFixed(2)}`

function serve(rows: MonthlyUsageRow[], runner: unknown = null) {
  fakeServer()
    .on('GET', '/api/usage/by-model', () =>
      Response.json({ success: true, data: { month: '2026-09', rows } }),
    )
    .on('GET', '/api/runner/usage', () =>
      runner
        ? Response.json({ success: true, data: runner })
        : Response.json({ success: false, error: 'off' }, { status: 404 }),
    )
}

beforeEach(() => {
  // 浏览器空闲回调：立刻跑（jsdom 没有，会退回 1 秒的 setTimeout）。
  vi.stubGlobal('requestIdleCallback', (task: () => void) => {
    task()
    return 1
  })
  vi.stubGlobal('cancelIdleCallback', () => {})
})

afterEach(() => vi.unstubAllGlobals())

function cellsOf(rowLabel: string): string[] {
  const row = screen
    .getAllByRole('row')
    .find((candidate) => candidate.textContent?.includes(rowLabel))
  if (!row) throw new Error(`row ${rowLabel} not rendered`)
  // 数字格里滚动那份是 `aria-hidden` 的过场，读的是旁边那份终值（`CountUp`）。
  return [...row.querySelectorAll('td')].map(
    (cell) =>
      (cell.querySelector('.sr-only') ?? cell).textContent?.trim() ?? '',
  )
}

const PRICED_A = AI_MODELS.KLING_V3_PRO
const PRICED_B = AI_MODELS.SEEDANCE_20
const price = (id: string) => getModelUnitPriceByStringId(id)!.amount

describe('SettingsUsageSection', () => {
  it('按 provider 合并各模型的次数、按单价现算花费；合计把 runner 的次数也算进去', async () => {
    serve(
      [
        { adapterType: 'fal', modelId: PRICED_A, requests: 100 },
        { adapterType: 'fal', modelId: PRICED_B, requests: 28 },
        { adapterType: 'openai', modelId: PRICED_A, requests: 40 },
      ],
      {
        enabled: true,
        used: 42,
        limit: 100,
        remaining: 58,
        exempt: false,
        platformEnabled: true,
      },
    )

    renderWithApp(<SettingsUsageSection />, { locale: 'en' })

    const falCost = price(PRICED_A) * 100 + price(PRICED_B) * 28
    const openaiCost = price(PRICED_A) * 40
    await waitFor(() =>
      expect(cellsOf(label('fal'))).toEqual([
        label('fal'),
        '128',
        usd(falCost),
      ]),
    )
    expect(cellsOf(label('openai'))).toEqual([
      label('openai'),
      '40',
      usd(openaiCost),
    ])
    // runner 的次数格是额度读数（平台出资，用户付 $0）。
    expect(cellsOf(en('Settings.usage.runnerLabel'))[1]).toBe('42 / 100')
    expect(cellsOf(en('Settings.usage.total'))).toEqual([
      en('Settings.usage.total'),
      '210',
      usd(falCost + openaiCost),
    ])
  })

  it('进场每个数字从 0 滚上去（可见那份是 aria-hidden 的过场）', async () => {
    serve([{ adapterType: 'fal', modelId: PRICED_A, requests: 128 }])

    renderWithApp(<SettingsUsageSection />, { locale: 'en' })

    await waitFor(() => expect(cellsOf(label('fal'))[1]).toBe('128'))
    const visuals = screen.getAllByTestId('count-up-visual')
    // 2 格 fal + 2 格合计。
    expect(visuals).toHaveLength(4)
    for (const visual of visuals) {
      expect(visual).toHaveAttribute('aria-hidden', 'true')
    }
  })

  it('一家里没有任何一个模型有单价 → 只显次数，花费格空着', async () => {
    serve([
      { adapterType: 'novelai', modelId: 'no-such-priced-model', requests: 9 },
    ])

    renderWithApp(<SettingsUsageSection />, { locale: 'en' })

    await waitFor(() =>
      expect(cellsOf(label('novelai'))).toEqual([label('novelai'), '9', '']),
    )
    expect(cellsOf(en('Settings.usage.total'))).toEqual([
      en('Settings.usage.total'),
      '9',
      '',
    ])
  })
})
