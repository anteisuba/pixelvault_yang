import { neonConfig } from '@neondatabase/serverless'
import { PrismaNeon } from '@prisma/adapter-neon'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { normalizeDatabaseConnectionString } from '@/lib/database-utils'

// Node.js needs a WebSocket polyfill; edge/browser runtimes have it natively
if (typeof WebSocket === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  neonConfig.webSocketConstructor = require('ws')
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const adapter = new PrismaNeon({
    connectionString: normalizeDatabaseConnectionString(
      process.env.DATABASE_URL!,
    ),
  })
  return new PrismaClient({ adapter })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}
