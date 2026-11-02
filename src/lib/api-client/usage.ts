import { API_ENDPOINTS } from '@/constants/config'
import {
  MonthlyUsageSummarySchema,
  type MonthlyUsageSummary,
} from '@/types/usage'

import { getErrorPayload } from '@/lib/api-client/shared'
import { ApiClientError } from '@/lib/api-client/error-fields'
import { apiFetch } from '@/lib/api-client/api-fetch'

/** 本月按模型的请求次数（`/settings/usage` 那张表）。 */
export async function fetchMonthlyUsageByModel(): Promise<MonthlyUsageSummary> {
  const response = await apiFetch(API_ENDPOINTS.USAGE_BY_MODEL)

  if (!response.ok) {
    throw new ApiClientError(await getErrorPayload(response))
  }

  const payload = (await response.json()) as { data?: unknown }
  return MonthlyUsageSummarySchema.parse(payload.data)
}
