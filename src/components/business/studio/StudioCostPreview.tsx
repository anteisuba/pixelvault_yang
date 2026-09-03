'use client'

import { memo, useMemo } from 'react'
import { useTranslations } from 'next-intl'

import {
  formatUnitPriceAmount,
  getModelUnitPriceByStringId,
  getModelUnitPriceRangeByStringId,
  getVideoUnitPricePerSecond,
} from '@/constants/models/unit-prices'
import type { VideoResolution } from '@/constants/video-options'

/**
 * 只要 id —— 不收整个 `SelectedModelOption`。这颗组件唯一需要知道的是「这一轮跑
 * 哪些模型」，把整个选项对象收进来会让它跟着模型面板的形状一起变。
 */
interface CostPreviewModel {
  optionId: string
  modelId: string
}

/**
 * 计价口径由调用方声明，不由组件猜。
 *
 * ⚠ 做成可辨识联合而不是两个可选 prop：图片档需要「每模型几张」，视频档需要
 * 「几秒 + 哪一档分辨率」，两组参数互斥。写成可选 prop 就允许「视频档但没给
 * 时长」这种表示得出来却没意义的状态。
 */
export type CostPreviewBasis =
  | { kind: 'image'; perModelCount: number }
  | { kind: 'video'; durationSeconds: number; resolution: VideoResolution }

interface StudioCostPreviewProps {
  /** 这一轮要跑的模型名单（主模型 + 额外模型）。 */
  models: readonly CostPreviewModel[]
  basis: CostPreviewBasis
  /**
   * 呈现方式。`stack`（默认）= 参数栏底部那一叠（标签 + 金额 + 区间 + 缺价行）；
   * `line` = 移动端 composer 里的**一行** mono 文本（`≈ $0.12 · 5s × $0.024/s`）。
   *
   * ⚠ 只换排版，算式一个字没改 —— 两个宿主共用上面那个 `useMemo`。速率那一段
   * 读的也是同一个 `getVideoUnitPricePerSecond`，不是另算一遍。
   */
  variant?: 'stack' | 'line'
}

/**
 * 成本预览 —— 工作台参数栏底部、生成按钮上方。
 *
 * ## 两条底线
 *
 * 1. **缺价的模型绝不折进那个数**。`MODEL_UNIT_PRICES` 的策略是宁可留空不填猜的
 *    数（一个错的数比没有数更糟），预览这一侧必须把这条守住：有价的照加，缺价的
 *    单独报「N 个模型未标价」，并把合计从「约 $X」降级成「约 $X 起」——
 *    ⭐ 少一个加数的和是**下限**，不是等号。写成等号就等于替缺价模型填了个 0。
 * 2. **单位必须与档位对上**。图片档只加 `unit: 'image'`，视频档只加
 *    `unit: 'second'`；对不上的当缺价，不当 0。按秒的和按张的相加没有意义。
 *
 * ## 视频档为什么会出现「起」
 *
 * 单价表的视频口径钉死在 720p（见 `unit-prices.ts` 文件头）。用户选了别的档时，
 * 只有逐档核过 `resolutionAmounts` 的模型给得出精确数，其余按缺价处理 ——
 * 拿 720p 的数去顶 1080p 会把 Seedance 2.0 说便宜 2.25 倍。**报「起」是诚实的，
 * 报一个腰斩的等号不是。**
 *
 * ⚠ 单价是**参考价不是计费依据**（见 `unit-prices.ts` 文件头）：口径按产品实际
 * 发出去的尺寸取档，扣费走服务端 credit policy。所以永远带「约」，即使算式是精确的。
 */
export const StudioCostPreview = memo(function StudioCostPreview({
  models,
  basis,
  variant = 'stack',
}: StudioCostPreviewProps) {
  const t = useTranslations('StudioV2')

  const { total, pricedCount, unpricedCount, rangeBounds, videoPerSecond } =
    useMemo(() => {
      let sum = 0
      let priced = 0
      /**
       * 台账 M（owner 2026-08-29）：钉不死一个数、但**边界是知道的**那批
       * （今天只有 GPT Image 2：OpenAI 按 quality 分三档，而我们不发 quality）。
       * 它们不进 `sum` —— 把上界累加会报一个用户几乎不会付的数，把下界累加就是
       * 「按低档标价」那个老错。单独攒成一个区间，在缺价那行里说出来：
       * 「1 个模型未标价」把已知的信息也一起藏了，而 owner 要的正是「点生成时
       * 知道要花多少」。
       */
      let rangeMin = 0
      let rangeMax = 0
      let rangedCount = 0
      /**
       * 只有**恰好一条**视频模型时才有「每秒多少」可说 —— 视频档本来就恒单条
       * （`generate()` 的视频那支恒 `mode:'single'`）。多条时留 null，行里就只
       * 剩合计，不去平均一个没人被收的单价。
       */
      let perSecondForLine: number | null = null
      for (const model of models) {
        if (basis.kind === 'image') {
          const price = getModelUnitPriceByStringId(model.modelId)
          if (!price || price.unit !== 'image') {
            const range = getModelUnitPriceRangeByStringId(model.modelId)
            if (range && range.unit === 'image') {
              rangeMin += range.min * basis.perModelCount
              rangeMax += range.max * basis.perModelCount
              rangedCount += 1
            }
            continue
          }
          sum += price.amount * basis.perModelCount
          priced += 1
          continue
        }

        const perSecond = getVideoUnitPricePerSecond(
          model.modelId,
          basis.resolution,
        )
        if (perSecond === null) continue
        sum += perSecond * basis.durationSeconds
        priced += 1
        perSecondForLine = models.length === 1 ? perSecond : null
      }
      return {
        total: sum,
        pricedCount: priced,
        // 有区间的那几个**不再算「未标价」** —— 它们现在报得出东西了。
        unpricedCount: models.length - priced - rangedCount,
        rangeBounds: rangedCount > 0 ? { min: rangeMin, max: rangeMax } : null,
        videoPerSecond: perSecondForLine,
      }
    }, [models, basis])

  // 一个模型都没选时不占位：那一刻按钮上写的是「请先选择模型」，旁边再挂一行
  // 「预计费用 —」是拿一条空信息去挤已经说清楚的那条。
  if (models.length === 0) return null

  /**
   * 移动端 composer 的一行版。金额那一段与上面那叠共用同一个 `total` 与同一条
   * 「起」的判据；后半段的 `Ns × $Y/s` 是**算式本身**，让「这个数怎么来的」在
   * 一行里说得清 —— 手机上没有第二行位置摆解释。
   */
  if (variant === 'line') {
    if (pricedCount === 0) return null
    const amount = t(
      unpricedCount > 0 || rangeBounds ? 'costApproxFrom' : 'costApprox',
      { amount: formatUnitPriceAmount(total) },
    )
    const rate =
      basis.kind === 'video' && videoPerSecond !== null
        ? t('costVideoRate', {
            duration: basis.durationSeconds,
            rate: formatUnitPriceAmount(videoPerSecond),
          })
        : null
    return (
      <p
        data-testid="studio-mobile-cost-line"
        className="truncate font-mono text-2xs tabular-nums text-muted-foreground"
      >
        {rate ? `${amount} · ${rate}` : amount}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-2 text-2xs">
        <span className="font-medium text-muted-foreground/70">
          {t('costLabel')}
        </span>
        {pricedCount > 0 ? (
          <span className="font-medium tabular-nums text-foreground">
            {/* ⭐ 「起」的判据是**有没有加数没进这个和**，不是「有没有未标价的」。
                台账 M 加了「有区间」这一档之后，只看 `unpricedCount` 会让一个
                少了加数的和印成等号 —— 正是这行注释原本要防的那个错。 */}
            {t(
              unpricedCount > 0 || rangeBounds
                ? 'costApproxFrom'
                : 'costApprox',
              { amount: formatUnitPriceAmount(total) },
            )}
          </span>
        ) : null}
      </div>
      {/* 台账 M：能给上下界的先给界 —— 「未标价」把已知信息也藏了。 */}
      {rangeBounds ? (
        <span className="text-2xs tabular-nums text-muted-foreground">
          {t('costRange', {
            min: formatUnitPriceAmount(rangeBounds.min),
            max: formatUnitPriceAmount(rangeBounds.max),
          })}
        </span>
      ) : null}
      {/* 缺价的单独说 —— 不并进上面那个数，也不省略。省略了用户会以为合计是全的。 */}
      {unpricedCount > 0 ? (
        <span className="text-2xs text-muted-foreground">
          {t('costUnpriced', { count: unpricedCount })}
        </span>
      ) : null}
    </div>
  )
})
