import type { TestProject } from 'vitest/node'

import { readMigrationSql } from './migrations'

declare module 'vitest' {
  export interface ProvidedContext {
    databaseUrl: string
  }
}

/**
 * L2a 真库测试的库（docs/references/testing.md「测试标准」）。
 *
 * - CI：`TEST_DATABASE_URL` 指向一次性 Postgres 16 容器（ci.yml 的 Integration Tests）。
 * - 本机：不设就起一个内存里的 PGlite（真 Postgres 编进 WASM），用 socket 暴露成
 *   普通连接串，应用代码照旧走 `@prisma/adapter-pg`，不用装 Docker。
 *
 * 两种都先把 prisma/migrations 全部执行一遍，库结构和生产一致（含 pg_trgm）。
 */
export default async function setup(project: TestProject) {
  const external = process.env.TEST_DATABASE_URL
  if (external) {
    if (/neon\.tech|pooler/i.test(external)) {
      throw new Error(
        'TEST_DATABASE_URL 看起来是线上库，真库测试只连一次性库。',
      )
    }
    const pg = await import('pg')
    const client = new pg.default.Client({ connectionString: external })
    await client.connect()
    try {
      const { rows } = await client.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public'",
      )
      if ((rows[0]?.n ?? 0) === 0) {
        for (const sql of readMigrationSql()) await client.query(sql)
      }
    } finally {
      await client.end()
    }
    project.provide('databaseUrl', external)
    return
  }

  const { PGlite } = await import('@electric-sql/pglite')
  const { pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm')
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket')
  const db = await PGlite.create({ extensions: { pg_trgm } })
  for (const sql of readMigrationSql()) await db.exec(sql)
  // 连接池 + 测试自己的清库连接，都排在同一个 PGlite 上（服务端按查询排队）。
  const server = new PGLiteSocketServer({
    db,
    port: 0,
    host: '127.0.0.1',
    maxConnections: 32,
  })
  await server.start()
  project.provide(
    'databaseUrl',
    `postgresql://postgres:postgres@${server.getServerConn()}/postgres?sslmode=disable`,
  )
  return async () => {
    await server.stop()
    await db.close()
  }
}
