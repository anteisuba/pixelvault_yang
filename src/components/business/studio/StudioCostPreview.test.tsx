import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AI_MODELS } from '@/constants/models/enum'
import {
  MODEL_UNIT_PRICES,
  formatUnitPriceAmount,
  getModelUnitPriceByStringId,
  getVideoUnitPricePerSecond,
} from '@/constants/models/unit-prices'
import { getVideoModelCapabilities } from '@/constants/video-model-capabilities'
import type { VideoResolution } from '@/constants/video-options'

import { StudioCostPreview, type CostPreviewBasis } from './StudioCostPreview'

// 值要能读出来 —— 只回 key 的话 `约 $0.13` 与 `约 $99` 在断言里长得一样，
// 这颗组件的全部职责恰恰就是那个数算得对不对。
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))

const model = (modelId: string) => ({ optionId: `opt-${modelId}`, modelId })

const imageBasis = (perModelCount: number): CostPreviewBasis => ({
  kind: 'image',
  perModelCount,
})

const videoBasis = (
  durationSeconds: number,
  resolution: VideoResolution,
): CostPreviewBasis => ({ kind: 'video', durationSeconds, resolution })

/** 有价的图片模型，两条，价格从表里取 —— 不写死金额，改价不该弄红这个测试。 */
const PRICED_A = AI_MODELS.FLUX_2_PRO
const PRICED_B = AI_MODELS.SEEDREAM_50_LITE
/** 故意留空的那条（quality=auto，35 倍价差，见 unit-prices.ts 待补段）。 */
const UNPRICED = AI_MODELS.OPENAI_GPT_IMAGE_2
/** 按秒计价的视频条目 —— 混进来必须当缺价，不许折进按张算的合计。 */
const PER_SECOND = AI_MODELS.SEEDANCE_25_VOLCENGINE
/** 逐档核过的视频条目（三档都填了 `resolutionAmounts`）。 */
const TIERED_VIDEO = AI_MODELS.WAN_30

/**
 * 「只有 720p 基准价、没填逐档」的样本 —— **动态挑**，不写死某个模型 id。
 *
 * 写死会让这条测试变成补数据的绊脚石：`unit-prices.ts` 的分档表是逐步补齐的，
 * 谁把样本模型补上分档，这条就无辜变红（第一版写死 SEEDANCE_20，补完当场就红
 * 了）。这里断言的是**行为**——缺档必须降级成缺价——跟具体哪个模型无关。
 */
const [BASE_ONLY_VIDEO, BASE_ONLY_MISSING_TIER] = (() => {
  for (const [id, price] of Object.entries(MODEL_UNIT_PRICES)) {
    if (!price || price.unit !== 'second' || price.resolutionAmounts) continue
    const tiers = getVideoModelCapabilities(id).supportedResolutions ?? []
    const gap = tiers.find((r) => r !== '720p')
    if (gap && tiers.includes('720p')) return [id, gap] as const
  }
  throw new Error(
    '单价表里已经没有「有 720p 基准价但缺其它档」的模型了 —— 这条测试可以删了',
  )
})()

const amountOf = (modelId: string) =>
  getModelUnitPriceByStringId(modelId)?.amount ?? 0

describe('StudioCostPreview', () => {
  it('一个模型都没选时不占位', () => {
    const { container } = render(
      <StudioCostPreview models={[]} basis={imageBasis(1)} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('全部有价：按「单价 × 每模型张数」求和，报等号口径', () => {
    render(
      <StudioCostPreview
        models={[model(PRICED_A), model(PRICED_B)]}
        basis={imageBasis(2)}
      />,
    )
    const expected = formatUnitPriceAmount(
      (amountOf(PRICED_A) + amountOf(PRICED_B)) * 2,
    )
    expect(
      screen.getByText(`costApprox:{"amount":"${expected}"}`),
    ).toBeInTheDocument()
    expect(screen.queryByText(/costUnpriced/)).not.toBeInTheDocument()
  })

  it('混选：缺价的不折进合计，合计降级成「起」并单独报条数', () => {
    render(
      <StudioCostPreview
        models={[model(PRICED_A), model(UNPRICED)]}
        basis={imageBasis(1)}
      />,
    )
    const expected = formatUnitPriceAmount(amountOf(PRICED_A))
    // ⭐ 少一个加数的和是下限 —— 用 `costApproxFrom`，不是 `costApprox`。
    expect(
      screen.getByText(`costApproxFrom:{"amount":"${expected}"}`),
    ).toBeInTheDocument()
    expect(screen.queryByText(/^costApprox:/)).not.toBeInTheDocument()
    expect(screen.getByText('costUnpriced:{"count":1}')).toBeInTheDocument()
  })

  it('⚠ 按秒计价的条目当缺价处理，不当 0 也不加进按张的合计', () => {
    render(
      <StudioCostPreview
        models={[model(PRICED_A), model(PER_SECOND)]}
        basis={imageBasis(1)}
      />,
    )
    expect(getModelUnitPriceByStringId(PER_SECOND)?.unit).toBe('second')
    const expected = formatUnitPriceAmount(amountOf(PRICED_A))
    expect(
      screen.getByText(`costApproxFrom:{"amount":"${expected}"}`),
    ).toBeInTheDocument()
    expect(screen.getByText('costUnpriced:{"count":1}')).toBeInTheDocument()
  })

  it('全部缺价：不印任何金额，只报条数', () => {
    render(
      <StudioCostPreview models={[model(UNPRICED)]} basis={imageBasis(4)} />,
    )
    expect(screen.queryByText(/costApprox/)).not.toBeInTheDocument()
    expect(screen.getByText('costUnpriced:{"count":1}')).toBeInTheDocument()
  })

  describe('视频档', () => {
    it('按「每秒单价 × 时长」求和，报等号口径', () => {
      render(
        <StudioCostPreview
          models={[model(TIERED_VIDEO)]}
          basis={videoBasis(10, '720p')}
        />,
      )
      const perSecond = getVideoUnitPricePerSecond(TIERED_VIDEO, '720p')
      expect(perSecond).not.toBeNull()
      expect(
        screen.getByText(
          `costApprox:{"amount":"${formatUnitPriceAmount((perSecond ?? 0) * 10)}"}`,
        ),
      ).toBeInTheDocument()
    })

    it('⭐ 换档要跟着变价：1080p 是 480p 的四倍，不是同一个数', () => {
      const { unmount } = render(
        <StudioCostPreview
          models={[model(TIERED_VIDEO)]}
          basis={videoBasis(5, '480p')}
        />,
      )
      const cheap = formatUnitPriceAmount(
        (getVideoUnitPricePerSecond(TIERED_VIDEO, '480p') ?? 0) * 5,
      )
      expect(
        screen.getByText(`costApprox:{"amount":"${cheap}"}`),
      ).toBeInTheDocument()
      unmount()

      render(
        <StudioCostPreview
          models={[model(TIERED_VIDEO)]}
          basis={videoBasis(5, '1080p')}
        />,
      )
      const pricey = formatUnitPriceAmount(
        (getVideoUnitPricePerSecond(TIERED_VIDEO, '1080p') ?? 0) * 5,
      )
      expect(
        screen.getByText(`costApprox:{"amount":"${pricey}"}`),
      ).toBeInTheDocument()
      expect(cheap).not.toBe(pricey)
    })

    it('⚠ 没填逐档的模型：非基准档当缺价，绝不拿 720p 的数去顶', () => {
      render(
        <StudioCostPreview
          models={[model(BASE_ONLY_VIDEO)]}
          basis={videoBasis(5, BASE_ONLY_MISSING_TIER)}
        />,
      )
      expect(
        getModelUnitPriceByStringId(BASE_ONLY_VIDEO)?.resolutionAmounts,
      ).toBeUndefined()
      expect(screen.queryByText(/costApprox/)).not.toBeInTheDocument()
      expect(screen.getByText('costUnpriced:{"count":1}')).toBeInTheDocument()
    })

    it('没填逐档的模型在基准档 720p 上照常报价', () => {
      render(
        <StudioCostPreview
          models={[model(BASE_ONLY_VIDEO)]}
          basis={videoBasis(5, '720p')}
        />,
      )
      const expected = formatUnitPriceAmount(amountOf(BASE_ONLY_VIDEO) * 5)
      expect(
        screen.getByText(`costApprox:{"amount":"${expected}"}`),
      ).toBeInTheDocument()
    })

    it('⚠ 按张计价的图片条目在视频档里当缺价', () => {
      render(
        <StudioCostPreview
          models={[model(TIERED_VIDEO), model(PRICED_A)]}
          basis={videoBasis(5, '720p')}
        />,
      )
      const expected = formatUnitPriceAmount(
        (getVideoUnitPricePerSecond(TIERED_VIDEO, '720p') ?? 0) * 5,
      )
      expect(
        screen.getByText(`costApproxFrom:{"amount":"${expected}"}`),
      ).toBeInTheDocument()
      expect(screen.getByText('costUnpriced:{"count":1}')).toBeInTheDocument()
    })
  })
})
