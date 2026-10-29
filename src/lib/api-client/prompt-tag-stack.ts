import { z } from 'zod'

import { API_ENDPOINTS } from '@/constants/config'
import {
  PromptTagStackSidesSchema,
  type PromptTagStackSides,
} from '@/types/prompt-tags'
import { apiFetch } from '@/lib/api-client/api-fetch'

/** 标签堆的客户端出口；失败一律抛，调用方决定要不要重试。 */

async function readData(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(`PROMPT_TAG_STACK_${response.status}`)
  const body = await response.json()
  if (!body.success) throw new Error('PROMPT_TAG_STACK_FAILED')
  return body.data
}

/** `null` = 账号里还没存过。 */
export async function getPromptTagStackAPI(): Promise<PromptTagStackSides | null> {
  const data = z
    .object({ stack: PromptTagStackSidesSchema.nullable() })
    .parse(await readData(await apiFetch(API_ENDPOINTS.PROMPT_TAG_STACK)))
  return data.stack
}

export async function savePromptTagStackAPI(
  stack: PromptTagStackSides,
): Promise<void> {
  await readData(
    await apiFetch(API_ENDPOINTS.PROMPT_TAG_STACK, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stack),
    }),
  )
}
