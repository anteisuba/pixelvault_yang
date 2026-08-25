import { describe, expect, it } from 'vitest'

import {
  HOMEPAGE_MODEL_REFERENCE_PRICES,
  resolveHomepageReferencePrice,
} from '@/constants/homepage'
import { getModelById } from '@/constants/models'
import { AI_MODELS } from '@/constants/models/enum'
import {
  MODEL_UNIT_PRICES,
  formatUnitPriceAmount,
  getModelUnitPrice,
  getVideoUnitPricePerSecond,
} from '@/constants/models/unit-prices'
import { getVideoModelCapabilities } from '@/constants/video-model-capabilities'
import type { VideoResolution } from '@/constants/video-options'

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

  it('⚠ 分档表只许填模型真发得出去的档', () => {
    // 判据是**产品能不能出这一档**，不是「官方页上还印着别的档」。给一个用户
    // 永远选不到的档标价，会在跨模型比价时把这条说成另一个价位 —— 例如 H3 的
    // 768P（$0.08）比它实际恒发的 2K（$0.13）便宜 38%。
    for (const [id, price] of entries) {
      if (!price.resolutionAmounts) continue
      const allowed = getVideoModelCapabilities(id).supportedResolutions ?? []
      for (const [resolution, amount] of Object.entries(
        price.resolutionAmounts,
      )) {
        expect(
          allowed,
          `${id} prices ${resolution} but the model cannot output it`,
        ).toContain(resolution)
        expect(amount, `${id}.${resolution} must be positive`).toBeGreaterThan(
          0,
        )
        expect(amount, `${id}.${resolution} looks like a typo`).toBeLessThan(
          100,
        )
      }
    }
  })

  it('⚠ 分档表里的 720p 必须与 amount 一致', () => {
    // `amount` 按文件头口径就是 720p 那一档。两个数字说同一件事却不相等 =
    // 有人只改了一半，而横向比价读的是 `amount`、成本预览读的是分档表 ——
    // 同一个模型会在两个界面上报两个价。
    for (const [id, price] of entries) {
      const tiered = price.resolutionAmounts?.['720p']
      if (tiered === undefined) continue
      expect(tiered, `${id}: resolutionAmounts['720p'] !== amount`).toBe(
        price.amount,
      )
    }
  })

  it('没有分辨率旋钮的视频模型必须报得出价', () => {
    // 回归守卫：H3 恒发 2k、Kling 恒出 1080p，它们的默认档都不是 720p 基准档。
    // 少了分档表，`getVideoUnitPricePerSecond` 会把一个明明有价的模型判成缺价，
    // 成本预览就只剩一行「N 个模型未标价」。
    const knobless: [AI_MODELS, VideoResolution][] = [
      [AI_MODELS.MINIMAX_H3, '2k'],
      [AI_MODELS.MINIMAX_H3_REFERENCE, '2k'],
      [AI_MODELS.MINIMAX_H3_CN, '2k'],
      [AI_MODELS.MINIMAX_H3_REFERENCE_CN, '2k'],
      [AI_MODELS.KLING_V3_PRO, '1080p'],
      [AI_MODELS.KLING_O3_PRO, '1080p'],
    ]
    for (const [id, resolution] of knobless) {
      expect(
        getVideoUnitPricePerSecond(id, resolution),
        `${id} has no price at its only tier ${resolution}`,
      ).toBeGreaterThan(0)
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

  it('⚠ 两张表不得重叠 —— 首页存量表只放本表没覆盖的', () => {
    // 这条断言变过两次，记一下为什么：
    //
    //  1. 最初「不得重叠」—— 立错了：补齐 fal 价格后必然重叠。
    //  2. 改成「只比单位不比金额」—— 也不对：它把「首页低报 3 倍」正当化成了
    //     「两个口径」，于是那个 bug 被测试保护了起来。
    //  3. 现在（owner 2026-08-08 拍板首页从本表派生）重叠**真的**不该存在了：
    //     同一个模型两个数字，就是漂移本身。
    for (const [id] of entries) {
      expect(
        HOMEPAGE_MODEL_REFERENCE_PRICES[id],
        `${id} 在两张表里都有 —— 首页那条要删，取值走 resolveHomepageReferencePrice`,
      ).toBeUndefined()
    }
  })

  it('首页取价走本表；本表没有的才退回存量表', () => {
    for (const [id, price] of entries) {
      const resolved = resolveHomepageReferencePrice(id)
      expect(resolved, `${id} 应当能从本表取到价`).not.toBeNull()
      expect(resolved?.amount).toBe(price.amount)
      expect(resolved?.unit).toBe(price.unit)
    }
  })

  it('⚠ 口径成立的前提：有价的视频模型全都默认开音频', () => {
    // owner 选的是「按产品默认档」。当前它恰好等于本表的含音频口径 —— 因为所有
    // 有价视频模型都 `generateAudio: true`。**这是巧合不是定理**：哪天进来一个
    // 默认关音频的模型，本表就必须加一列区分，否则首页会高报它的价。
    for (const [id] of entries) {
      const model = getModelById(id)
      if (!model || model.outputType !== 'VIDEO') continue
      expect(
        model.videoDefaults?.generateAudio,
        `${id} 默认不开音频 —— 「按产品默认档」不再等于含音频口径，见本表头部注释`,
      ).toBe(true)
    }
  })

  it('金额格式：不足 1 分的不许被四舍五入到 $0.01', () => {
    // FLUX 2 Flash 是 $0.005/张。两位小数会印成 `$0.01` —— 把最便宜那档说贵一倍，
    // 而它的卖点就是便宜。这条守的是那个退到三位的分支。
    expect(formatUnitPriceAmount(0.005)).toBe('$0.005')
    expect(formatUnitPriceAmount(0.0336)).toBe('$0.03')
    expect(formatUnitPriceAmount(0.03)).toBe('$0.03')
    expect(formatUnitPriceAmount(1.072)).toBe('$1.07')
    // 尾随 0 去掉：`$0.003` 而不是 `$0.0030`
    expect(formatUnitPriceAmount(0.003)).toBe('$0.003')
  })
})
