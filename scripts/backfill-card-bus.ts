/**
 * 一次性回填 CLI：角色卡的 `handle` 与 `referenceSlots`（卡片总线 v3 · 进度表 35 第 ④ 片）。
 *
 * Usage:
 *   npx tsx --conditions=react-server --tsconfig tsconfig.json \
 *     scripts/backfill-card-bus.ts            # 默认只出报告，不写库
 *   npx tsx --conditions=react-server --tsconfig tsconfig.json \
 *     scripts/backfill-card-bus.ts --apply    # ⚠ 每次都要 owner 当次授权
 *
 * ⚠ `--conditions=react-server` 不是装饰：mapper 顶着 `import 'server-only'`，
 * 默认条件下加载即抛。
 *
 * ── 只动初始值 ──────────────────────────────────────────────────────────
 * 只写 `handle IS NULL` / `referenceSlots IS NULL` 的格子，写库时再用同一条件兜一次
 * （期间有人新建或更新了卡，那一格就不碰）。重跑安全：第二遍没有目标。
 *
 * ── handle 顺序 ─────────────────────────────────────────────────────────
 * 按用户 → 根卡 → 变体（父先于子）→ 创建时间 → id 的确定性顺序分配；已有 handle
 * 与软删卡的 handle 一起算已占用，冲突加 `-2`、`-3`。变体的底子是父卡的 handle
 * （含本轮刚分配的）+ 变体名，与新建卡的双写同一条规则。
 *
 * ⛔ 不碰 persona / summary / extensions：文字侧推后（owner 09-25），没有旧形要改写。
 * ⛔ 映射本体在 `src/lib/card-bus.ts` 与 mapper，脚本不许自己再写一份。
 */

import {
  allocateCardHandle,
  cardHandleKey,
  deriveCardHandleBase,
  deriveVariantHandleBase,
} from '@/lib/card-bus'
import { referenceSlotsFromCardRow } from '@/services/cards/character-card.mapper'
import {
  CharacterReferenceSlotsSchema,
  type CharacterReferenceSlot,
} from '@/types'

/* ── CLI 解析（纯函数，可测）──────────────────────────────────────────── */

export interface CliOptions {
  readonly apply: boolean
}

/** ⛔ 认不出来的参数一律抛：一次性回填脚本上「悄悄忽略拼错的 flag」代价太高。 */
export function parseCliArgs(argv: readonly string[]): CliOptions {
  let apply = false
  for (const arg of argv) {
    if (arg === '--apply') apply = true
    else if (arg === '--dry-run') apply = false
    else throw new Error(`[backfill-card-bus] 认不出的参数：${arg}`)
  }
  return { apply }
}

/* ── 计划（纯函数，可测）──────────────────────────────────────────────── */

export interface BackfillCardRow {
  id: string
  userId: string
  name: string
  parentId: string | null
  variantLabel: string | null
  isDeleted: boolean
  createdAt: Date
  handle: string | null
  referenceSlots: unknown
  sourceImageUrl: string
  sourceImages: unknown
  sourceImageEntries: unknown
  referenceImages: unknown
  referenceRoles: unknown
}

export interface CardBackfillPlan {
  id: string
  userId: string
  name: string
  isDeleted: boolean
  /** 要写的 handle；已有就不出现。 */
  handle?: string
  /** 要写的参考槽；已有就不出现。 */
  referenceSlots?: CharacterReferenceSlot[]
  /** 底子被占、加了后缀。 */
  suffixed?: boolean
  /** 参考槽算不出合法结果（不变量不满足），这一格跳过。 */
  slotsError?: string
}

/** 父先于子：深度小的先排；同深度按创建时间、id。找不到父或成环的按根卡算。 */
function orderWithinUser(rows: readonly BackfillCardRow[]): BackfillCardRow[] {
  const byId = new Map(rows.map((row) => [row.id, row]))
  const depthOf = (row: BackfillCardRow): number => {
    const seen = new Set<string>([row.id])
    let depth = 0
    let parent = row.parentId ? byId.get(row.parentId) : undefined
    while (parent && !seen.has(parent.id)) {
      seen.add(parent.id)
      depth += 1
      parent = parent.parentId ? byId.get(parent.parentId) : undefined
    }
    return depth
  }
  return [...rows]
    .map((row) => ({ row, depth: depthOf(row) }))
    .sort(
      (a, b) =>
        a.depth - b.depth ||
        a.row.createdAt.getTime() - b.row.createdAt.getTime() ||
        a.row.id.localeCompare(b.row.id),
    )
    .map(({ row }) => row)
}

export function planCardBackfill(
  rows: readonly BackfillCardRow[],
): CardBackfillPlan[] {
  const byUser = new Map<string, BackfillCardRow[]>()
  for (const row of rows) {
    byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), row])
  }

  const plans: CardBackfillPlan[] = []
  for (const userId of [...byUser.keys()].sort()) {
    const userRows = byUser.get(userId) ?? []
    const taken = new Set(
      userRows.flatMap((row) =>
        row.handle ? [cardHandleKey(row.handle)] : [],
      ),
    )
    const handleById = new Map(
      userRows.flatMap((row) =>
        row.handle ? [[row.id, row.handle] as const] : [],
      ),
    )
    const nameById = new Map(userRows.map((row) => [row.id, row.name]))

    for (const row of orderWithinUser(userRows)) {
      const plan: CardBackfillPlan = {
        id: row.id,
        userId,
        name: row.name,
        isDeleted: row.isDeleted,
      }

      if (!row.handle) {
        const parentName = row.parentId ? nameById.get(row.parentId) : undefined
        const base =
          row.parentId && parentName !== undefined
            ? deriveVariantHandleBase(
                handleById.get(row.parentId) ??
                  deriveCardHandleBase(parentName),
                row.variantLabel,
              )
            : deriveCardHandleBase(row.name)
        const handle = allocateCardHandle(base, taken)
        handleById.set(row.id, handle)
        plan.handle = handle
        if (handle !== base) plan.suffixed = true
      }

      if (row.referenceSlots === null || row.referenceSlots === undefined) {
        const parsed = CharacterReferenceSlotsSchema.safeParse(
          referenceSlotsFromCardRow(row),
        )
        if (parsed.success) plan.referenceSlots = parsed.data
        else plan.slotsError = parsed.error.issues[0]?.message ?? 'invalid'
      }

      if (plan.handle || plan.referenceSlots || plan.slotsError) {
        plans.push(plan)
      }
    }
  }
  return plans
}

export function formatPlanLine(plan: CardBackfillPlan): string {
  const parts = [
    plan.handle
      ? `handle=@${plan.handle}${plan.suffixed ? '（加了后缀）' : ''}`
      : null,
    plan.referenceSlots ? `slots=${plan.referenceSlots.length}` : null,
    plan.slotsError ? `slots跳过=${plan.slotsError}` : null,
    plan.isDeleted ? '软删' : null,
  ].filter(Boolean)
  return `[backfill-card-bus] ${plan.id} (${plan.name}) ${parts.join(' · ')}`
}

/* ── 真跑 ───────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2))

  const dotenv = await import('dotenv')
  dotenv.config({ path: '.env.local' })
  const { db } = await import('@/lib/db')
  const { Prisma } = await import('@/lib/generated/prisma/client')

  const rows: BackfillCardRow[] = await db.characterCard.findMany({
    select: {
      id: true,
      userId: true,
      name: true,
      parentId: true,
      variantLabel: true,
      isDeleted: true,
      createdAt: true,
      handle: true,
      referenceSlots: true,
      sourceImageUrl: true,
      sourceImages: true,
      sourceImageEntries: true,
      referenceImages: true,
      referenceRoles: true,
    },
  })

  const plans = planCardBackfill(rows)
  console.log(`[backfill-card-bus] MODE ${options.apply ? 'apply' : 'report'}`)
  console.log(
    `[backfill-card-bus] TOTAL ${rows.length} · 用户 ${new Set(rows.map((row) => row.userId)).size} · 软删 ${rows.filter((row) => row.isDeleted).length}`,
  )
  console.log(
    `[backfill-card-bus] 缺 handle ${rows.filter((row) => !row.handle).length} · 缺参考槽 ${rows.filter((row) => row.referenceSlots === null).length}`,
  )
  for (const plan of plans) console.log(formatPlanLine(plan))

  const slotFailures = plans.filter((plan) => plan.slotsError)
  console.log(
    `\n[backfill-card-bus] PLAN 写 handle ${plans.filter((plan) => plan.handle).length} · 写参考槽 ${plans.filter((plan) => plan.referenceSlots).length} · 加后缀 ${plans.filter((plan) => plan.suffixed).length} · 参考槽跳过 ${slotFailures.length}`,
  )

  if (options.apply) {
    let written = 0
    let raced = 0
    for (const plan of plans) {
      await db.$transaction(async (tx) => {
        if (plan.handle) {
          const result = await tx.characterCard.updateMany({
            where: { id: plan.id, handle: null },
            data: { handle: plan.handle },
          })
          if (result.count === 1) written += 1
          else raced += 1
        }
        if (plan.referenceSlots) {
          const result = await tx.characterCard.updateMany({
            where: { id: plan.id, referenceSlots: { equals: Prisma.DbNull } },
            data: {
              referenceSlots: JSON.parse(JSON.stringify(plan.referenceSlots)),
            },
          })
          if (result.count === 1) written += 1
          else raced += 1
        }
      })
    }
    console.log(
      `[backfill-card-bus] APPLIED 写入 ${written} 格 · 期间已被改动跳过 ${raced} 格`,
    )
  }

  if (slotFailures.length > 0) process.exitCode = 1
  await db.$disconnect()
}

// tsx 直跑时才执行；被单测 import 时不跑。
if (process.argv[1]?.endsWith('backfill-card-bus.ts')) {
  void main()
}
