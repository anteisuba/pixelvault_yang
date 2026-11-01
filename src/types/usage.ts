/**
 * 用量的 schema 层 —— `/settings/usage`（D3 ④）那张表的数据形状。
 *
 * ⚠ 故意**按模型**而不是按 provider 返回：花费要用「次数 × 该模型单价」累加，
 * 而单价住 `constants/models/unit-prices.ts`（客户端可读的常量）。服务端只数
 * 次数，⛔ 不在服务端算钱——那样单价就有了第二个家。
 * ⚠ 没有单价的模型仍然回一行：那一家的花费因此是**部分未知**，表上只显次数。
 * ⭐ 平台点数第 2 片起：账本里已经结算了点数的行（LLM 按 token、Runner 按 GPU 秒）回 `points`，
 *   点数同样是按 `constants/models/*` 的单价算的（服务端入账那一刻），客户端优先用它。
 */

import { z } from 'zod'

export const MonthlyUsageRowSchema = z.object({
  adapterType: z.string().min(1),
  modelId: z.string().min(1),
  requests: z.number().int().nonnegative(),
  /** 这一组里已结算点数的合计；`null` = 一行都没结算（旧行 / 缺价），照旧按次数 × 单价估。 */
  points: z.number().nonnegative().nullable(),
})

export type MonthlyUsageRow = z.infer<typeof MonthlyUsageRowSchema>

export const MonthlyUsageSummarySchema = z.object({
  /** 统计月份，`YYYY-MM`（UTC 自然月，与 runner 额度同一条口径）。 */
  month: z.string().regex(/^\d{4}-\d{2}$/),
  rows: z.array(MonthlyUsageRowSchema),
})

export type MonthlyUsageSummary = z.infer<typeof MonthlyUsageSummarySchema>
