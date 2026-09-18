import { API_ENDPOINTS } from '@/constants/config'
import {
  MonthlyUsageSummarySchema,
  type MonthlyUsageSummary,
} from '@/types/usage'

import { getErrorMessage } from '@/lib/api-client/shared'

/** 本月按模型的请求次数（`/settings/usage` 那张表）。 */
export async function fetchMonthlyUsageByModel(): Promise<MonthlyUsageSummary> {
  const response = await fetch(API_ENDPOINTS.USAGE_BY_MODEL)

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, `Failed with status ${response.status}`),
    )
  }

  const payload = (await response.json()) as { data?: unknown }
  return MonthlyUsageSummarySchema.parse(payload.data)
}
