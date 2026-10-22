import 'server-only'

import { db } from '@/lib/db'
import { ensureUser } from '@/services/user.service'
import {
  PromptTagSelectionSchema,
  type PromptTagSelection,
  type PromptTagStackSides,
} from '@/types/prompt-tags'

/**
 * LoRA 台的标签堆，一个用户一份，存在账号里跨设备同步（owner 2026-10-22）。
 * 读到 `null` = 这个账号还没存过：客户端会把浏览器里旧的那份传上来。
 */

/** 坏掉的单条丢掉，⛔ 不让整份读失败。 */
function readSelections(value: unknown): PromptTagSelection[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const parsed = PromptTagSelectionSchema.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
}

export async function getPromptTagStack(
  clerkId: string,
): Promise<PromptTagStackSides | null> {
  const user = await ensureUser(clerkId)
  const row = await db.promptTagStack.findUnique({
    where: { userId: user.id },
    select: { positive: true, negative: true },
  })
  if (!row) return null
  return {
    positive: readSelections(row.positive),
    negative: readSelections(row.negative),
  }
}

export async function savePromptTagStack(
  clerkId: string,
  stack: PromptTagStackSides,
): Promise<void> {
  const user = await ensureUser(clerkId)
  await db.promptTagStack.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...stack },
    update: stack,
  })
}
