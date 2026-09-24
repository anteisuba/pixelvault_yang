import { z } from 'zod'

import {
  ASSISTANT_OPERATOR_CONFIRM_FIELDS,
  type AssistantOperatorConfirmField,
  type AssistantOperatorDomain,
} from '@/constants/assistant-operator'
import { STUDIO_OPERATOR_AUTHORSHIP } from '@/constants/studio-assistant-operator'

/**
 * 助手最后一次写进提示词 / 负面框的全文，按域落 localStorage。
 *
 * ⭐ 内存里的改动登记簿刷新就没了，而草稿会把提示词恢复回来 —— 于是刷新后助手
 * 认不出自己写的那段，又问一遍「追加 / 覆盖 / 保留」（拆分与反推实跑 09-24）。
 * ⚠ 读写都安静：读不动当没存过，写不进去（无痕 / 配额满）不抛。
 */
const TextSchema = z.string().max(STUDIO_OPERATOR_AUTHORSHIP.maxTextChars)
const AuthorshipSchema = z.object({
  [ASSISTANT_OPERATOR_CONFIRM_FIELDS.prompt]: TextSchema.optional(),
  [ASSISTANT_OPERATOR_CONFIRM_FIELDS.negative]: TextSchema.optional(),
})
type Authorship = z.infer<typeof AuthorshipSchema>

function storageKey(domain: AssistantOperatorDomain): string {
  return `${STUDIO_OPERATOR_AUTHORSHIP.keyPrefix}.${domain}`
}

function readAll(domain: AssistantOperatorDomain): Authorship {
  try {
    const raw = globalThis.localStorage?.getItem(storageKey(domain))
    if (!raw) return {}
    const parsed = AuthorshipSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : {}
  } catch {
    return {}
  }
}

export function readOperatorWrittenText(
  domain: AssistantOperatorDomain,
  field: AssistantOperatorConfirmField,
): string | undefined {
  return readAll(domain)[field]
}

export function writeOperatorWrittenText(
  domain: AssistantOperatorDomain,
  field: AssistantOperatorConfirmField,
  text: string,
): void {
  if (text.length > STUDIO_OPERATOR_AUTHORSHIP.maxTextChars) return
  try {
    globalThis.localStorage?.setItem(
      storageKey(domain),
      JSON.stringify({ ...readAll(domain), [field]: text }),
    )
  } catch {
    // 落不了盘只是刷新后多问一句，⛔ 不许它打断这一轮。
  }
}
