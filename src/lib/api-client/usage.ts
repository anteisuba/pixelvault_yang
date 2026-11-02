import { API_ENDPOINTS } from '@/constants/config'
import type { GrantCreditsRequest, GrantCreditsResult } from '@/types'
import {
  MonthlyUsageSummarySchema,
  type MonthlyUsageSummary,
} from '@/types/usage'

import { getErrorMessage } from '@/lib/api-client/shared'
import { apiFetch } from '@/lib/api-client/api-fetch'

/** 本月按模型的请求次数（`/settings/usage` 那张表）。 */
export async function fetchMonthlyUsageByModel(): Promise<MonthlyUsageSummary> {
  const response = await apiFetch(API_ENDPOINTS.USAGE_BY_MODEL)

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, `Failed with status ${response.status}`),
    )
  }

  const payload = (await response.json()) as { data?: unknown }
  return MonthlyUsageSummarySchema.parse(payload.data)
}

/** admin 给某人送点（设置 · 用量里 admin 才看得到的那一行）。 */
export async function grantCreditsAPI(
  request: GrantCreditsRequest,
): Promise<GrantCreditsResult> {
  const response = await apiFetch(API_ENDPOINTS.ADMIN_CREDITS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(response, `Failed with status ${response.status}`),
    )
  }

  const payload = (await response.json()) as { data: GrantCreditsResult }
  return payload.data
}
