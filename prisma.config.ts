import { defineConfig } from 'prisma/config'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

/**
 * Neon 官方两端点模式：CLI（migrate/db/studio）必须走 **direct** 端点，运行时
 * （`src/lib/db.ts` 的 `@prisma/adapter-pg`，以及各 backfill/seed 脚本）继续读
 * `DATABASE_URL` 的 **-pooler** 端点——两条链路不共用同一个变量。
 *
 * 为什么分开：PgBouncer 事务池化模式下 advisory lock 不可靠，而
 * `prisma migrate deploy` 靠它做迁移互斥；反过来运行时如果改走 direct，Vercel
 * 突发并发下每实例 `DATABASE_POOL.MAX_CONNECTIONS` 条连接会直接打满 Neon 的连接
 * 上限。见 https://neon.com/docs/guides/prisma-migrations
 *
 * ⛔ 这里不写 `DIRECT_URL ?? DATABASE_URL` 回落——那会在没配 DIRECT_URL 时悄悄
 * 退回 pooler，正好是这次要修的问题本身。缺失时必须在这里就大声失败，不能让
 * `prisma migrate deploy` 带着错的端点悄悄跑下去。
 *
 * 唯一的例外是纯 schema 静态命令（generate/validate/format）：它们不建立数据库
 * 连接，Prisma 7.2+ 官方允许在没有任何 datasource url 时运行——本仓 CI 的
 * lint/test/build 三个 job 就是在完全不设 DATABASE_URL/DIRECT_URL 的情况下跑
 * `prisma generate` 的（见 `.github/workflows/ci.yml`），这条路径必须继续可用，
 * 否则会连累这三个跟迁移无关的 job。
 */
const SCHEMA_ONLY_COMMANDS = new Set(['generate', 'validate', 'format'])

function resolveDirectUrl(): string | undefined {
  const directUrl = process.env['DIRECT_URL']
  if (directUrl || SCHEMA_ONLY_COMMANDS.has(process.argv[2] ?? '')) {
    return directUrl
  }
  throw new Error(
    'DIRECT_URL 未设置。Prisma migrate 必须走 Neon 的 direct 端点（主机名不带 ' +
      '-pooler），见 https://neon.com/docs/guides/prisma-migrations —— ' +
      '运行时的 DATABASE_URL 保持 -pooler 不变，两者不能共用同一个变量。',
  )
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: resolveDirectUrl(),
    shadowDatabaseUrl: process.env['SHADOW_DATABASE_URL'],
  },
})
