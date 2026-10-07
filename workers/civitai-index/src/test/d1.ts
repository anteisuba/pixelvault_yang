import { readdirSync, readFileSync } from 'node:fs'

import { convertV4MiniflareOptions, Miniflare } from 'miniflare'

const MIGRATIONS_DIR = new URL('../../migrations/', import.meta.url)

/** 迁移文件按语句切开：触发器体里的分号不算，读到 `END;` 才收。 */
function splitStatements(sql: string): string[] {
  const statements: string[] = []
  let current: string[] = []
  let inTrigger = false
  for (const rawLine of sql.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('--')) continue
    if (current.length === 0 && /^CREATE TRIGGER/i.test(line)) inTrigger = true
    current.push(rawLine)
    const ends = inTrigger ? /^END;$/i.test(line) : line.endsWith(';')
    if (ends) {
      statements.push(current.join('\n'))
      current = []
      inTrigger = false
    }
  }
  return statements
}

/** 本地 D1（miniflare 里的同一套 SQLite + FTS5），套上迁移。 */
export async function createTestDb(): Promise<{
  db: D1Database
  dispose: () => Promise<void>
}> {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {}',
      d1Databases: { DB: crypto.randomUUID() },
    }),
  )
  const db = (await mf.getD1Database('DB')) as unknown as D1Database
  const migrations = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort()
  for (const file of migrations) {
    const sql = readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8')
    for (const statement of splitStatements(sql)) {
      await db.prepare(statement).run()
    }
  }
  return { db, dispose: () => mf.dispose() }
}
