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
