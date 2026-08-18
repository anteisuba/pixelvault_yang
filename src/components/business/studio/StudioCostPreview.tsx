'use client'

import { memo, useMemo } from 'react'
import { useTranslations } from 'next-intl'

import {
  formatUnitPriceAmount,
  getModelUnitPriceByStringId,
} from '@/constants/models/unit-prices'

/**
 * 只要 id —— 不收整个 `SelectedModelOption`。这颗组件唯一需要知道的是「这一轮跑
 * 哪些模型」，把整个选项对象收进来会让它跟着模型面板的形状一起变。
 */
interface CostPreviewModel {
  optionId: string
  modelId: string
}

interface StudioCostPreviewProps {
  /** 这一轮要跑的模型名单（主模型 + 额外模型）。 */
  models: readonly CostPreviewModel[]
  /** 每个模型各出几张。总张数 = models.length × perModelCount。 */
  perModelCount: number
}

/**
 * 成本预览 —— 工作台参数栏底部、生成按钮上方（任务包
 * `studio-workbench-redesign-2026-08-14.md` §4.11 切片 4）。
 *
 * ## 两条底线
 *
 * 1. **缺价的模型绝不折进那个数**。`MODEL_UNIT_PRICES` 的策略是宁可留空不填猜的
 *    数（一个错的数比没有数更糟），预览这一侧必须把这条守住：有价的照加，缺价的
 *    单独报「N 个模型未标价」，并把合计从「约 $X」降级成「约 $X 起」——
 *    ⭐ 少一个加数的和是**下限**，不是等号。写成等号就等于替缺价模型填了个 0。
 * 2. **只加 `unit: 'image'` 的**。工作台今天是图片专用（`StudioWorkspaceUI` 只在
 *    `outputType === 'image'` 时走 `StudioWorkbenchLayout`），但按秒计价的视频条目
 *    与按张计价的图片条目相加没有意义 —— 真混进来就当它缺价，不当它 0。
 *
 * ⚠ 单价是**参考价不是计费依据**（见 `unit-prices.ts` 文件头）：口径按产品实际
 * 发出去的尺寸取档，扣费走服务端 credit policy。所以永远带「约」，即使算式是精确的。
 */
export const StudioCostPreview = memo(function StudioCostPreview({
  models,
  perModelCount,
}: StudioCostPreviewProps) {
  const t = useTranslations('StudioV2')

  const { total, pricedCount, unpricedCount } = useMemo(() => {
    let sum = 0
    let priced = 0
    for (const model of models) {
      const price = getModelUnitPriceByStringId(model.modelId)
      if (!price || price.unit !== 'image') continue
      sum += price.amount * perModelCount
      priced += 1
    }
    return {
      total: sum,
      pricedCount: priced,
      unpricedCount: models.length - priced,
    }
  }, [models, perModelCount])

  // 一个模型都没选时不占位：那一刻按钮上写的是「请先选择模型」，旁边再挂一行
  // 「预计费用 —」是拿一条空信息去挤已经说清楚的那条。
  if (models.length === 0) return null

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-2 text-2xs">
        <span className="font-medium text-muted-foreground/70">
          {t('costLabel')}
        </span>
        {pricedCount > 0 ? (
          <span className="font-medium tabular-nums text-foreground">
            {t(unpricedCount > 0 ? 'costApproxFrom' : 'costApprox', {
              amount: formatUnitPriceAmount(total),
            })}
          </span>
        ) : null}
      </div>
      {/* 缺价的单独说 —— 不并进上面那个数，也不省略。省略了用户会以为合计是全的。 */}
      {unpricedCount > 0 ? (
        <span className="text-2xs text-muted-foreground">
          {t('costUnpriced', { count: unpricedCount })}
        </span>
      ) : null}
    </div>
  )
})
