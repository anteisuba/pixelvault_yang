import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * 「约束型迁移」闸门。
 *
 * ## 它防的是什么
 *
 * 2026-08-22：`20260821210442_lora_unique_user_url` 给 `LoraAsset(userId, loraUrl)`
 * 建唯一索引，作者清的是本地库，生产上仍有 2 组重复。真跑的话
 * `prisma migrate deploy` 失败 → `vercel.json` 的 `buildCommand` 短路 → **整个
 * 生产构建炸掉**，并在 `_prisma_migrations` 留下 failed 记录，得 `migrate resolve`
 * 才能继续。
 *
 * ⚠ **CI 结构性地看不见这类问题**：`ci.yml` 的「从零重建数据库」是在**空库**上
 * 跑迁移历史，没有存量数据，唯一索引/NOT NULL/外键怎么都建得上。绿色的 CI 在
 * 约束型迁移上不构成证据。
 *
 * ## 为什么闸在这里而不在 CI
 *
 * 本项目直接在 main 上干活，push 即触发 Vercel 生产部署，而 GitHub CI 与 Vercel
 * 构建是**并行**跑的 —— CI 报警时构建已经炸了。所以闸必须在 push 之前生效，
 * 而 `pre-push` 钩子跑的正是全量 vitest。放在这里它才真的拦得住。
 *
 * ## 为什么理由写在这个文件里，而不是写进迁移的 SQL
 *
 * ⛔ **迁移 SQL 一旦被应用过就不能再改**：Prisma 为每个迁移存了校验和，改动
 * 一个字符（哪怕只是加一行注释）都会让 `migrate deploy` 报
 * 「migration was modified after it was applied」。所以登记簿只能放在迁移文件
 * 外面。
 *
 * ## 为什么不用「文件里有 DELETE 就放行」这种自动判据
 *
 * 因为那正好放过最危险的一类：**清理写了，但写错了**。今天那段 DELETE 是手写
 * 的，靠的是拿生产数据做只读干跑才敢发。自动判据只会看到「有 DELETE」然后放行，
 * 等于把闸门变成安慰剂。所以这里要的是**一句人写下来的、说明怎么验的话**。
 */

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  'migrations',
)

/**
 * 已登记的约束型迁移：目录名 → 「为什么它在真实数据上是安全的」。
 *
 * ⚠ 新增条目**不是走过场**。写进来之前请真的确认过一件事：这条约束在**目标库
 * 的现有数据**上成立。手段任选其一：
 *   · `node prisma/preflight-migrations.mjs` —— 从生产开一个即用即弃的 Neon 分支把迁移
 *     真跑一遍（最彻底）；
 *   · 拿生产数据做只读查询验证（例如唯一索引就 `GROUP BY ... HAVING count(*)>1`）；
 *   · 该迁移已经在生产成功应用过（历史条目属于这种）。
 *
 * 然后把**你用的是哪种、什么时候验的**写进值里。值不是给闸门看的，是给三个月后
 * 的人看的。
 */
const ACKNOWLEDGED: Record<string, string> = {
  '20260314101500_add_provider_type_to_user_api_keys':
    '历史迁移，2026-03-14 已在生产成功应用（本闸门 2026-08-22 才建立）。⛔ 校验和已冻结，不可改动其 SQL。',
  '20260314123500_add_adapter_type_and_provider_config':
    '历史迁移，2026-03-14 已在生产成功应用（本闸门 2026-08-22 才建立）。⛔ 校验和已冻结，不可改动其 SQL。',
  '20260327000000_add_project_model':
    '历史迁移，2026-03-27 已在生产成功应用（本闸门 2026-08-22 才建立）。⛔ 校验和已冻结，不可改动其 SQL。',
  '20260328000000_baseline_align_schema':
    '基线迁移，2026-03-28 已在生产成功应用（本闸门 2026-08-22 才建立）。⛔ 校验和已冻结，不可改动其 SQL。',
  '20260522000000_add_project_parent_id':
    '历史迁移，2026-05-22 已在生产成功应用（本闸门 2026-08-22 才建立）。⛔ 校验和已冻结，不可改动其 SQL。',
  '20260808000000_assistant_surface_per_domain':
    '⭐ 这条是「做对了」的范例，别照抄成反面教材：它手写 USING (CASE "surface"::text WHEN \'STUDIO\' THEN \'IMAGE_STUDIO\' ELSE ... END) 正是因为 Prisma 自动生成的 ::text::"AssistantSurface_new" 对存量的 STUDIO 行会直接报错——值的改写与类型替换必须在同一条 ALTER 里完成。2026-08-08 已在生产成功应用。',
  '20260821210442_lora_unique_user_url':
    '2026-08-21T12:05:01Z 已在 Vercel 所用的生产库（ep-flat-violet-…）成功应用——作者当时的「本地库」就是生产库（.env.local 指向它），重复在那一刻已经清掉。前一条 20260821210441_dedupe_lora_assets 是给**别的**库重放这段历史时兜底的（例如落后 6 条迁移、至今仍有 2 组重复的 ep-solitary-dew-…）。⚠ 别照抄 d5fa8587 的提交信息：那条写的「部署前查生产仍有 2 组重复」查错了库，见 docs/references/cicd.md。',
}

interface ConstraintHit {
  table: string
  kind: string
  statement: string
}

/** 去掉行注释，免得被注释掉的 SQL 误判成真语句。 */
function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '')
}

/**
 * 找出这个迁移里「给**已经存在的表**加约束」的语句。
 *
 * 同一个文件里 `CREATE TABLE` 出来的表不算 —— 新表没有存量数据，约束一定建得上，
 * 而这是绝大多数迁移的形状（实测 50 条里 44 条属于此类）。只盯剩下那几条，闸门
 * 才不会变成天天要绕开的噪声。
 */
function findConstraintsOnExistingTables(sql: string): ConstraintHit[] {
  const body = stripComments(sql)
  const createdHere = new Set(
    [...body.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?"([^"]+)"/gi)].map(
      (m) => m[1],
    ),
  )

  const hits: ConstraintHit[] = []
  for (const raw of body.split(';')) {
    const statement = raw.replace(/\s+/g, ' ').trim()
    if (!statement) continue

    let table: string | undefined
    let kind: string | undefined

    const uniqueIndex =
      /^CREATE UNIQUE INDEX\s+(?:IF NOT EXISTS\s+)?"[^"]+"\s+ON\s+"([^"]+)"/i.exec(
        statement,
      )
    if (uniqueIndex) {
      table = uniqueIndex[1]
      kind = 'CREATE UNIQUE INDEX'
    }

    const alter = /^ALTER TABLE\s+(?:ONLY\s+)?"([^"]+)"\s+(.*)$/i.exec(
      statement,
    )
    if (alter) {
      const [, alterTable, rest] = alter
      if (/ADD CONSTRAINT/i.test(rest)) {
        table = alterTable
        kind = 'ADD CONSTRAINT'
      } else if (/SET NOT NULL/i.test(rest)) {
        table = alterTable
        kind = 'SET NOT NULL'
      } else if (/SET DATA TYPE|ALTER COLUMN .* TYPE /i.test(rest)) {
        table = alterTable
        kind = 'ALTER COLUMN TYPE'
      } else if (
        /ADD COLUMN/i.test(rest) &&
        /NOT NULL/i.test(rest) &&
        !/DEFAULT/i.test(rest)
      ) {
        // 非空且无默认值的新列，在有存量行的表上必失败。
        table = alterTable
        kind = 'ADD COLUMN NOT NULL (no default)'
      }
    }

    if (table && kind && !createdHere.has(table)) {
      hits.push({ table, kind, statement })
    }
  }
  return hits
}

function listMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

describe('约束型迁移必须登记「在真实数据上为什么安全」', () => {
  const migrations = listMigrations()

  it('迁移目录读得到（防止路径写错让整个闸门空转）', () => {
    expect(migrations.length).toBeGreaterThan(0)
  })

  it.each(migrations)('%s', (name) => {
    const sql = readFileSync(
      join(MIGRATIONS_DIR, name, 'migration.sql'),
      'utf8',
    )
    const hits = findConstraintsOnExistingTables(sql)
    if (hits.length === 0) return

    const reason = ACKNOWLEDGED[name]
    const detail = hits.map((h) => `  · ${h.kind} on "${h.table}"`).join('\n')

    expect(
      reason,
      `\n${name} 给已存在的表加了约束：\n${detail}\n\n` +
        '空库上它一定能建成，有存量数据的生产库上未必 —— 失败会让 ' +
        'prisma migrate deploy 挂掉并连带炸掉整个 Vercel 构建。\n' +
        '确认过之后，把「怎么验的」写进 prisma/migration-safety.test.ts 的 ' +
        'ACKNOWLEDGED（⛔ 别去改迁移 SQL，校验和会对不上）。\n' +
        '最彻底的验法：node prisma/preflight-migrations.mjs\n',
    ).toBeDefined()

    // 空字符串 / "ok" 这类占位不算登记。
    expect(reason?.trim().length ?? 0).toBeGreaterThan(10)
  })

  it('ACKNOWLEDGED 里没有指向不存在迁移的死条目', () => {
    const known = new Set(migrations)
    const stale = Object.keys(ACKNOWLEDGED).filter((name) => !known.has(name))
    expect(stale).toEqual([])
  })

  it('ACKNOWLEDGED 里没有已经不需要登记的条目（迁移改形状后要清掉）', () => {
    const unnecessary = Object.keys(ACKNOWLEDGED).filter((name) => {
      const sql = readFileSync(
        join(MIGRATIONS_DIR, name, 'migration.sql'),
        'utf8',
      )
      return findConstraintsOnExistingTables(sql).length === 0
    })
    expect(unnecessary).toEqual([])
  })
})
