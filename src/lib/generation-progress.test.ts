import { describe, expect, it } from 'vitest'

import { EXECUTION_PROGRESS_STAGE_VALUES } from '@/constants/generation-progress'
import enMessages from '@/messages/en.json'
import jaMessages from '@/messages/ja.json'
import zhMessages from '@/messages/zh.json'

import {
  computeEstimatedGenerationProgress,
  getGeneratingStageKey,
  resolveGeneratingStageKey,
  resolveGenerationProgress,
} from './generation-progress'

describe('getGeneratingStageKey', () => {
  it('maps elapsed seconds to the right stage', () => {
    expect(getGeneratingStageKey(0)).toBe('preparing')
    expect(getGeneratingStageKey(1.9)).toBe('preparing')
    expect(getGeneratingStageKey(2)).toBe('connecting')
    expect(getGeneratingStageKey(7.9)).toBe('connecting')
    expect(getGeneratingStageKey(8)).toBe('rendering')
    expect(getGeneratingStageKey(44.9)).toBe('rendering')
    expect(getGeneratingStageKey(45)).toBe('waiting')
    expect(getGeneratingStageKey(9999)).toBe('waiting')
  })
})

describe('computeEstimatedGenerationProgress', () => {
  it('starts each stage at its segment start percent', () => {
    expect(computeEstimatedGenerationProgress(0).percent).toBeCloseTo(0)
    expect(computeEstimatedGenerationProgress(2).percent).toBeCloseTo(20)
    expect(computeEstimatedGenerationProgress(8).percent).toBeCloseTo(45)
  })

  it('eases out within a segment (never linear, monotonic)', () => {
    const early = computeEstimatedGenerationProgress(8.5).percent
    const mid = computeEstimatedGenerationProgress(20).percent
    const late = computeEstimatedGenerationProgress(44).percent
    expect(early).toBeLessThan(mid)
    expect(mid).toBeLessThan(late)
    expect(late).toBeLessThan(88)
  })

  it('creeps toward 95 during waiting and never reaches it', () => {
    const at45 = computeEstimatedGenerationProgress(45).percent
    const at85 = computeEstimatedGenerationProgress(85).percent
    // 500s (well past the tau=40s asymptote) rather than an astronomically
    // large value — e^x underflows to exactly 0 past ~-745, which would
    // make the curve hit precisely 95 and falsely fail "never reaches it".
    const atLarge = computeEstimatedGenerationProgress(500).percent
    expect(at45).toBeCloseTo(88, 1)
    expect(at85).toBeGreaterThan(at45)
    expect(at85).toBeLessThan(95)
    expect(atLarge).toBeLessThan(95)
    expect(atLarge).toBeGreaterThan(94.9)
  })

  it('reduced motion snaps to discrete stage-end values', () => {
    expect(computeEstimatedGenerationProgress(0, true).percent).toBe(20)
    expect(computeEstimatedGenerationProgress(3, true).percent).toBe(45)
    expect(computeEstimatedGenerationProgress(10, true).percent).toBe(88)
    expect(computeEstimatedGenerationProgress(999, true).percent).toBe(95)
  })
})

describe('resolveGenerationProgress', () => {
  it('prefers realProgress over the estimate', () => {
    const { percent } = resolveGenerationProgress({
      elapsedSeconds: 1,
      realProgress: 63,
    })
    expect(percent).toBe(63)
  })

  it('clamps realProgress into [0, 100]', () => {
    expect(
      resolveGenerationProgress({ elapsedSeconds: 1, realProgress: 140 })
        .percent,
    ).toBe(100)
    expect(
      resolveGenerationProgress({ elapsedSeconds: 1, realProgress: -10 })
        .percent,
    ).toBe(0)
  })

  it('isComplete always wins and jumps to 100', () => {
    expect(
      resolveGenerationProgress({
        elapsedSeconds: 3,
        realProgress: 40,
        isComplete: true,
      }).percent,
    ).toBe(100)
  })

  it('falls back to the estimate when no realProgress is given', () => {
    const { percent, stageKey } = resolveGenerationProgress({
      elapsedSeconds: 3,
    })
    expect(stageKey).toBe('connecting')
    expect(percent).toBeGreaterThan(20)
    expect(percent).toBeLessThan(45)
  })
})

/**
 * Runner 冷启动能停在队列里好几分钟；只有 worker 回报的阶段能把「排队等 GPU」
 * 和「GPU 正在出图」分开，所以它必须压过按时间猜的阶段词，而其他 provider
 * （没有阶段回报）一个字都不能变。
 */
describe('resolveGeneratingStageKey', () => {
  it('lets a worker-reported stage win over the elapsed-time guess', () => {
    expect(resolveGeneratingStageKey(1, 'runnerQueued')).toBe('runnerQueued')
    expect(resolveGeneratingStageKey(120, 'runnerQueued')).toBe('runnerQueued')
    expect(resolveGeneratingStageKey(3, 'runnerRunning')).toBe('runnerRunning')
    // 幻影名额自愈窗口（worker 回收端点 worker 再重排）——此时界面必须说
    // 「正在重启」，而不是继续显示 runnerQueued 那句「首次要加载底模」。
    expect(resolveGeneratingStageKey(200, 'runnerRecycling')).toBe(
      'runnerRecycling',
    )
  })

  it('falls back to the elapsed-time stage without a reported stage', () => {
    expect(resolveGeneratingStageKey(1)).toBe('preparing')
    expect(resolveGeneratingStageKey(3, null)).toBe('connecting')
    expect(resolveGeneratingStageKey(60, undefined)).toBe('waiting')
  })

  it('ignores an unknown stage value rather than rendering it as a label', () => {
    expect(
      resolveGeneratingStageKey(3, 'bogus' as unknown as 'runnerQueued'),
    ).toBe('connecting')
  })
})

describe('resolveGenerationProgress with an execution stage', () => {
  it('swaps the stage label while keeping the time-based percent', () => {
    const plain = resolveGenerationProgress({ elapsedSeconds: 3 })
    const staged = resolveGenerationProgress({
      elapsedSeconds: 3,
      executionStage: 'runnerQueued',
    })
    expect(staged.percent).toBe(plain.percent)
    expect(staged.stageKey).toBe('runnerQueued')
  })

  it('keeps the stage label alongside a real progress number', () => {
    expect(
      resolveGenerationProgress({
        elapsedSeconds: 3,
        realProgress: 63,
        executionStage: 'runnerRunning',
      }),
    ).toEqual({ percent: 63, stageKey: 'runnerRunning' })
  })
})

/**
 * 阶段值本身就是 `StudioV3.generatingOverlayStages.*` 的 message key —— 漏一条
 * 翻译，next-intl 会把 key 路径当文案渲染，用户看到的是一行
 * 「generatingOverlayStages.runnerRecycling」。所以键集合必须三语相等。
 */
describe('执行阶段 × 三语文案', () => {
  const LOCALES = { zh: zhMessages, en: enMessages, ja: jaMessages } as const

  function overlayStages(
    messages: (typeof LOCALES)[keyof typeof LOCALES],
  ): Record<string, string> {
    return (
      messages as unknown as {
        StudioV3: { generatingOverlayStages: Record<string, string> }
      }
    ).StudioV3.generatingOverlayStages
  }

  it('每个 worker 回报阶段都有三语非空文案', () => {
    for (const [locale, messages] of Object.entries(LOCALES)) {
      for (const stage of EXECUTION_PROGRESS_STAGE_VALUES) {
        expect(
          overlayStages(messages as (typeof LOCALES)[keyof typeof LOCALES])[
            stage
          ],
          `${locale}.${stage}`,
        ).toBeTruthy()
      }
    }
  })

  it('三语的阶段键集合完全相等', () => {
    const keys = Object.values(LOCALES).map((messages) =>
      Object.keys(overlayStages(messages)).sort(),
    )
    expect(keys[1]).toEqual(keys[0])
    expect(keys[2]).toEqual(keys[0])
  })
})
