/**
 * 用量的 schema 层 —— `/settings/usage`（D3 ④）那张表的数据形状。
 *
 * ⚠ 故意**按模型**而不是按 provider 返回：花费要用「次数 × 该模型单价」累加，
 * 而单价住 `constants/models/unit-prices.ts`（客户端可读的常量）。服务端只数
 * 次数，⛔ 不在服务端算钱——那样单价就有了第二个家。
 * ⚠ 没有单价的模型仍然回一行：那一家的花费因此是**部分未知**，表上只显次数。
 */

import { z } from 'zod'

export const MonthlyUsageRowSchema = z.object({
  adapterType: z.string().min(1),
  modelId: z.string().min(1),
  requests: z.number().int().nonnegative(),
})

export type MonthlyUsageRow = z.infer<typeof MonthlyUsageRowSchema>

export const MonthlyUsageSummarySchema = z.object({
  /** 统计月份，`YYYY-MM`（UTC 自然月，与 runner 额度同一条口径）。 */
  month: z.string().regex(/^\d{4}-\d{2}$/),
  rows: z.array(MonthlyUsageRowSchema),
})

export type MonthlyUsageSummary = z.infer<typeof MonthlyUsageSummarySchema>
