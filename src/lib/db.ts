import { getCloudflareContext } from '@opennextjs/cloudflare'
import { PrismaPg } from '@prisma/adapter-pg'

import { DATABASE_POOL } from '@/constants/config'
import { PrismaClient } from '@/lib/generated/prisma/client'
import { normalizeDatabaseConnectionString } from '@/lib/database-utils'

/**
 * 跑在 Cloudflare Workers 上时，连接串优先用 Hyperdrive（就近连接池，替 Neon 省握手）；
 * 没配 Hyperdrive（本地 / Vercel）就用 DATABASE_URL。
 */
function databaseUrl(): string {
  const hyperdrive = isWorkersRuntime()
    ? getCloudflareContext().env.HYPERDRIVE
    : undefined
  return (
    hyperdrive?.connectionString ??
    normalizeDatabaseConnectionString(process.env.DATABASE_URL!)
  )
}

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: databaseUrl(),
    max: DATABASE_POOL.MAX_CONNECTIONS,
    connectionTimeoutMillis: DATABASE_POOL.CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: DATABASE_POOL.IDLE_TIMEOUT_MS,
  })
  return new PrismaClient({ adapter, omit: RETIRED_COLUMNS })
}

type Database = ReturnType<typeof createPrismaClient>

function isWorkersRuntime(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    navigator.userAgent === 'Cloudflare-Workers'
  )
}

/**
 * 已停读停写、下一次部署删掉的列：先从默认查询里拿掉，删列那次迁移跑起来时
 * 还在线的这一版就不会去查一个已经没有的列。删列那次把对应条目一起删，平时为空。
 * 形如 `{ recipe: { visibility: true } }`。
 */
const RETIRED_COLUMNS = {} as const

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: Database
}

/**
 * Workers 上每个请求一个客户端：Workers ⛔ 跨请求复用连接（上一个请求开的 socket
 * 在下一个请求里用会直接报错），所以按这次请求的执行上下文缓存，请求结束一起回收。
 * `after()` 里的活走同一个上下文（waitUntil），拿到的也是同一个客户端。
 */
const perRequestClients = new WeakMap<object, Database>()

function requestScopedClient(): Database {
  const { ctx } = getCloudflareContext()
  let client = perRequestClients.get(ctx)
  if (!client) {
    client = createPrismaClient()
    perRequestClients.set(ctx, client)
  }
  return client
}

function resolveClient(): Database {
  if (isWorkersRuntime()) return requestScopedClient()
  globalForPrisma.prisma ??= createPrismaClient()
  return globalForPrisma.prisma
}

/** 用法不变（`db.user.findMany(...)`）；真正的客户端每次取用时按运行环境挑。 */
export const db = new Proxy({} as Database, {
  get(_target, property) {
    const client = resolveClient()
    const value = Reflect.get(client, property, client)
    return typeof value === 'function' ? value.bind(client) : value
  },
})

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
