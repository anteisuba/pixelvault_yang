/**
 * 存量盘点：已经公开的作品里，按现行公开闸（`getPublishBlockedErrorCode`）会被拦的有多少。
 * 2026-11-11 画廊改全年龄、露骨词单独就拦之后，规则收紧前公开的那些还挂在画廊上。
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.json scripts/audit-public-content.ts
 *
 * ⛔ 只读：不改任何一行。被拦的存量怎么处理（撤下公开 / 留着）由 owner 定，另写。
 * 判据与 visibility 路由、批量公开同一个函数，脚本 ⛔ 自己再写一份词表。
 */

import { getPublishBlockedErrorCode } from '@/lib/content-safety'

const PAGE_SIZE = 500

export interface PublicRow {
  readonly id: string
  readonly userId: string | null
  readonly prompt: string | null
  readonly recipe: unknown
  readonly searchGrounded: boolean
  readonly outputType: string
  readonly isFeatured: boolean
  readonly createdAt: Date
}

export interface PublicAudit {
  readonly total: number
  readonly blocked: readonly PublicRow[]
  readonly blockedByCode: Readonly<Record<string, number>>
  readonly blockedByOutputType: Readonly<Record<string, number>>
}

/** 纯函数：一批公开行 → 哪些过不了现行公开闸。 */
export function auditPublicRows(rows: readonly PublicRow[]): PublicAudit {
  const blocked: PublicRow[] = []
  const blockedByCode: Record<string, number> = {}
  const blockedByOutputType: Record<string, number> = {}
  for (const row of rows) {
    const code = getPublishBlockedErrorCode(row)
    if (!code) continue
    blocked.push(row)
    blockedByCode[code] = (blockedByCode[code] ?? 0) + 1
    blockedByOutputType[row.outputType] =
      (blockedByOutputType[row.outputType] ?? 0) + 1
  }
  return { total: rows.length, blocked, blockedByCode, blockedByOutputType }
}

async function main(): Promise<void> {
  const dotenv = await import('dotenv')
  dotenv.config({ path: '.env.local' })
  const { db } = await import('@/lib/db')

  console.log(
    `[audit-public] DB ${new URL(process.env.DATABASE_URL ?? '').host}（只读）`,
  )

  const rows: PublicRow[] = []
  let cursor: string | undefined
  for (;;) {
    const page = await db.generation.findMany({
      where: { isPublic: true },
      select: {
        id: true,
        userId: true,
        prompt: true,
        recipe: true,
        searchGrounded: true,
        outputType: true,
        isFeatured: true,
        createdAt: true,
      },
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    })
    rows.push(...page)
    if (page.length < PAGE_SIZE) break
    cursor = page.at(-1)?.id
  }

  const audit = auditPublicRows(rows)
  const creators = new Set(audit.blocked.map((row) => row.userId))
  console.log(`[audit-public] 公开作品 ${audit.total} 件`)
  console.log(
    `[audit-public] 按现行公开闸会被拦 ${audit.blocked.length} 件 · 涉及创作者 ${creators.size} 位 · 其中精选 ${audit.blocked.filter((row) => row.isFeatured).length} 件`,
  )
  console.log(`[audit-public] 按原因 ${JSON.stringify(audit.blockedByCode)}`)
  console.log(
    `[audit-public] 按类型 ${JSON.stringify(audit.blockedByOutputType)}`,
  )
  for (const row of [...audit.blocked].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  )) {
    console.log(
      `[audit-public] ${row.id} ${row.outputType} ${row.createdAt.toISOString()} user=${row.userId}`,
    )
  }

  await db.$disconnect()
}

if (process.argv[1]?.endsWith('audit-public-content.ts')) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
