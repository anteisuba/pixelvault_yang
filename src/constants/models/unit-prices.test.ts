import { describe, expect, it } from 'vitest'

import { HOMEPAGE_MODEL_REFERENCE_PRICES } from '@/constants/homepage'
import { AI_MODELS } from '@/constants/models/enum'
import {
  MODEL_UNIT_PRICES,
  getModelUnitPrice,
} from '@/constants/models/unit-prices'

/**
 * 渠道比价数据的卫生与自洽性。见 `unit-prices.ts` 文件头的口径说明。
 *
 * 这里**不断言覆盖率** —— 缺失是有意的（宁可留空，不填没核实过的数字），断言
 * 覆盖率只会逼人拿猜的数去凑绿。守的是「已填的必须可信」。
 */

const entries = Object.entries(MODEL_UNIT_PRICES) as [
  AI_MODELS,
  NonNullable<(typeof MODEL_UNIT_PRICES)[AI_MODELS]>,
][]

describe('model unit prices', () => {
  it('has at least the Seedance VolcEngine line priced', () => {
    // 火山是目前唯一端到端跑通、且我们主推的视频线；它没价，第三层比价就没意义。
    expect(getModelUnitPrice(AI_MODELS.SEEDANCE_25_VOLCENGINE)).toBeTruthy()
    expect(getModelUnitPrice(AI_MODELS.SEEDANCE_20_VOLCENGINE)).toBeTruthy()
  })

  it('keeps every filled entry well-formed', () => {
    for (const [id, price] of entries) {
      expect(price.amount, `${id} amount must be positive`).toBeGreaterThan(0)
      // 上界纯粹是打字错误的护栏（多打一个零）。视频每秒没有接近 100 美元的。
      expect(price.amount, `${id} amount looks like a typo`).toBeLessThan(100)
      expect(['second', 'image', 'kchars']).toContain(price.unit)
      // source 是这张表能被下一个人复核的唯一凭据，不许空着。
      expect(price.source.length, `${id} needs a source`).toBeGreaterThan(10)
      expect(price.verifiedAt, `${id} verifiedAt must be YYYY-MM-DD`).toMatch(
        /^\d{4}-\d{2}-\d{2}$/,
      )
    }
  })

  it('prices the reference endpoint the same as the plain one', () => {
    // 火山按 token 计费、不分端点，所以同型号同渠道的两个端点必须同价。
    // 不同价说明有人只改了一半。
    const pairs: [AI_MODELS, AI_MODELS][] = [
      [
        AI_MODELS.SEEDANCE_25_VOLCENGINE,
        AI_MODELS.SEEDANCE_25_REFERENCE_VOLCENGINE,
      ],
      [
        AI_MODELS.SEEDANCE_20_VOLCENGINE,
        AI_MODELS.SEEDANCE_20_REFERENCE_VOLCENGINE,
      ],
    ]
    for (const [plain, reference] of pairs) {
      const a = getModelUnitPrice(plain)
      const b = getModelUnitPrice(reference)
      if (!a || !b) continue
      expect(b.amount, `${reference} must match ${plain}`).toBe(a.amount)
      expect(b.unit).toBe(a.unit)
    }
  })

  it('keeps the unit consistent with the homepage table where they overlap', () => {
    // ⚠ 这条原本断言「两表不得重叠」，2026-08-08 改掉了 —— 那个约束立错了。
    // 补齐 fal 价格后必然重叠，而重叠本身不是问题：两张表用途和口径都不同
    // （homepage 是营销展示，可能有意取不含音频的低价；本表是决策比价，钉死
    // 720p 含音频）。所以**不断言金额一致**，只断言单位一致 —— 单位错配才是
    // 真 bug（一个按秒一个按张，那是数据填错了行）。
    //
    // ⚠ 金额差异已知且尚未对账，例（2026-08-08 实查 fal 官方标价）：
    //   SEEDANCE_20      homepage $0.1  vs fal 官方 $0.3034  ← homepage 疑似过时
    //   SEEDANCE_20_FAST homepage $0.06 vs fal 官方 $0.2419  ← 同上
    //   KLING_V3_PRO     homepage $0.3  vs fal 官方 $0.168   ← 对不上任何档
    //   VEO_31           homepage $0.2  vs fal 官方 $0.40    ← homepage 取的是不含音频档
    // 对账结论见 docs/plans/canvas-video-domain-cleanup-2026-08-08.md §9.7。
    for (const [id, price] of entries) {
      const homepage = HOMEPAGE_MODEL_REFERENCE_PRICES[id]
      if (!homepage) continue
      expect(homepage.unit, `${id} unit mismatch between the two tables`).toBe(
        price.unit,
      )
    }
  })
})
