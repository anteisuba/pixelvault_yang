import { PrismaPg } from '@prisma/adapter-pg'

import { DATABASE_POOL } from '@/constants/config'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { normalizeDatabaseConnectionString } from '@/lib/database-utils'

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient
}

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: normalizeDatabaseConnectionString(
      process.env.DATABASE_URL!,
    ),
    max: DATABASE_POOL.MAX_CONNECTIONS,
    connectionTimeoutMillis: DATABASE_POOL.CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: DATABASE_POOL.IDLE_TIMEOUT_MS,
  })
  return new PrismaClient({ adapter })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}

/**
 * 这个错是不是「撞了唯一约束」（Prisma 的 P2002）。
 *
 * ⚠ **别改成匹配错误文案**：那串字受 Prisma 版本和数据库语言影响，换个版本就
 * 静默失效 —— 而失效的表现是「本该幂等的写变成了 500」，很难查。code 是契约，
 * 文案不是。
 *
 * 用途：并发下两个请求同时通过「先查有没有」的检查、都去写，其中一个必然撞约束。
 * 那一个应当**回查并返回既有行**（对用户就是幂等），而不是把 500 甩出去。
 */
export function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  )
}
