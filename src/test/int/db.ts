import { randomUUID } from 'node:crypto'

import { db } from '@/lib/db'

/**
 * 真库测试（L2a）用的小工具。真库测试串行跑（vitest.config.ts 的 int 组），
 * 每例开头 `resetDatabase()` 清空所有业务表，互不串数据。
 */
export async function resetDatabase(): Promise<void> {
  const rows = await db.$queryRawUnsafe<{ tablename: string }[]>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
  )
  if (rows.length === 0) return
  const tables = rows.map((row) => `"public"."${row.tablename}"`).join(', ')
  await db.$executeRawUnsafe(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`)
}

/**
 * 建一个资料齐全的用户：`ensureUser` 见到资料齐全的行直接返回，不去问 Clerk。
 */
export async function createTestUser(overrides: { clerkId?: string } = {}) {
  const tag = randomUUID().slice(0, 8)
  return db.user.create({
    data: {
      clerkId: overrides.clerkId ?? `clerk_${tag}`,
      email: `${tag}@example.test`,
      username: `user_${tag}`,
      displayName: `User ${tag}`,
    },
  })
}
