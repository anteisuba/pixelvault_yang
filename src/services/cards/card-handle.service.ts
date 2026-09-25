import 'server-only'

import { allocateCardHandle, cardHandleKey } from '@/lib/card-bus'
import type { Prisma } from '@/lib/generated/prisma/client'

/**
 * **给一张新角色卡分配 `@handle`**（卡片总线 v3，进度表 35）。
 *
 * ⭐ 读已占用与写新卡放在**同一个事务**里；唯一索引兜底并发。
 * ⚠ 软删的卡也占着名字（唯一索引不看 `isDeleted`），一起算进已占用。
 * ⚠ 只有角色卡有 `@名字`（owner 09-25：背景卡下线）。
 */
export async function allocateHandleForNewCard(
  tx: Prisma.TransactionClient,
  userId: string,
  base: string,
): Promise<string> {
  const rows = await tx.characterCard.findMany({
    where: { userId, handle: { not: null } },
    select: { handle: true },
  })
  const taken = new Set(
    rows.flatMap((row) => (row.handle ? [cardHandleKey(row.handle)] : [])),
  )
  return allocateCardHandle(base, taken)
}
