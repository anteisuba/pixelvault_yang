import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 按目录名顺序读出 prisma/migrations 下每次迁移的 SQL。
 *
 * 真库测试不走 `prisma migrate deploy`：prisma.config.ts 会读 .env.local 里的
 * DIRECT_URL（生产库），在开发机上跑错一次就是改生产。这里直接执行 SQL，只碰测试库。
 */
export function readMigrationSql(root = process.cwd()): string[] {
  const dir = join(root, 'prisma/migrations')
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => readFileSync(join(dir, name, 'migration.sql'), 'utf8'))
}
