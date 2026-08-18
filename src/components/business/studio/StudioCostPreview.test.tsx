import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AI_MODELS } from '@/constants/models/enum'
import {
  formatUnitPriceAmount,
  getModelUnitPriceByStringId,
} from '@/constants/models/unit-prices'

import { StudioCostPreview } from './StudioCostPreview'

// 值要能读出来 —— 只回 key 的话 `约 $0.13` 与 `约 $99` 在断言里长得一样，
// 这颗组件的全部职责恰恰就是那个数算得对不对。
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))

const model = (modelId: string) => ({ optionId: `opt-${modelId}`, modelId })

/** 有价的图片模型，两条，价格从表里取 —— 不写死金额，改价不该弄红这个测试。 */
const PRICED_A = AI_MODELS.FLUX_2_PRO
const PRICED_B = AI_MODELS.SEEDREAM_50_LITE
/** 故意留空的那条（quality=auto，35 倍价差，见 unit-prices.ts 待补段）。 */
const UNPRICED = AI_MODELS.OPENAI_GPT_IMAGE_2
/** 按秒计价的视频条目 —— 混进来必须当缺价，不许折进按张算的合计。 */
const PER_SECOND = AI_MODELS.SEEDANCE_25_VOLCENGINE

const amountOf = (modelId: string) =>
  getModelUnitPriceByStringId(modelId)?.amount ?? 0

describe('StudioCostPreview', () => {
  it('一个模型都没选时不占位', () => {
    const { container } = render(
      <StudioCostPreview models={[]} perModelCount={1} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('全部有价：按「单价 × 每模型张数」求和，报等号口径', () => {
    render(
      <StudioCostPreview
        models={[model(PRICED_A), model(PRICED_B)]}
        perModelCount={2}
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
        perModelCount={1}
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
        perModelCount={1}
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
    render(<StudioCostPreview models={[model(UNPRICED)]} perModelCount={4} />)
    expect(screen.queryByText(/costApprox/)).not.toBeInTheDocument()
    expect(screen.getByText('costUnpriced:{"count":1}')).toBeInTheDocument()
  })
})
