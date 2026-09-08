/**
 * 一次性回填 CLI：`NodeWorkflowProject.state` v3 → v4（node-canvas-v2 §9.2）。
 *
 * Usage:
 *   npx tsx --conditions=react-server --tsconfig tsconfig.json \
 *     scripts/migrate-node-workflow-v4.ts --dry-run
 *   npx tsx --conditions=react-server --tsconfig tsconfig.json \
 *     scripts/migrate-node-workflow-v4.ts --apply [--project <id>] [--limit N]
 *
 * ⚠ `--conditions=react-server` 不是装饰：`--apply` 要调
 * `node-workflow-v3-backup.service`，而它（和 `r2.ts`）顶着 `import 'server-only'`，
 * 默认条件下加载即抛。
 *
 * ⚠ 映射本体住在 `src/lib/node-workflow-migrate-v4.ts`，升级编排住在
 * `src/lib/node-workflow-v4-upgrade.ts` —— 画布的逐项目惰性升级（C2）与本脚本的
 * 批量回填走**同一条路径**，结果必须一致。⛔ 脚本不许自己再写一份映射。
 *
 * ── 顺序纪律（⚠ 不能反）──────────────────────────────────────────────────
 * `NodeWorkflowStateSchema.nodes` 是 `z.array()` **无逐项 `.catch()`**：先删 legacy
 * enum 再迁移 = 存量项目整份 parse 失败 → `validateState` 兜成空状态 → 用户看到
 * 空画布且静默无报错。所以**回填跑完并验证之后**才删 v3 schema / enum。
 *
 * ── 备份纪律 ────────────────────────────────────────────────────────────
 * 每个项目改写前先把原始 `state` 传上 R2（key 由 `buildV3BackupKey` 拼，同项目重跑
 * 不互相覆盖）。**备份不成功就不写这个项目**，并计入失败清单大声报出来。
 */

import type { Prisma } from '@/lib/generated/prisma/client'
import {
  NODE_V4_UPGRADE_OUTCOMES,
  upgradeNodeWorkflowStateToV4,
} from '@/lib/node-workflow-v4-upgrade'
import {
  NodeWorkflowStateV4Schema,
  type NodeWorkflowStateV4,
} from '@/types/node-workflow'

/* ── CLI 解析（纯函数，可测）──────────────────────────────────────────── */

export const MIGRATION_MODES = {
  /** 只统计 + 校验升级结果，不碰 R2、不写库。默认。 */
  dryRun: 'dry-run',
  /** 备份 → 升级 → 写回 `version: 4`。 */
  apply: 'apply',
} as const

export type MigrationMode =
  (typeof MIGRATION_MODES)[keyof typeof MIGRATION_MODES]

export interface CliOptions {
  readonly mode: MigrationMode
  /** 只处理这一个项目。 */
  readonly projectId?: string
  /** 最多处理几个（普查仍然覆盖全表）。 */
  readonly limit?: number
}

/** ⛔ 认不出来的参数一律抛：一次性回填脚本上「悄悄忽略拼错的 flag」代价太高。 */
export function parseCliArgs(argv: readonly string[]): CliOptions {
  let mode: MigrationMode = MIGRATION_MODES.dryRun
  let projectId: string | undefined
  let limit: number | undefined

  const readValue = (index: number, flag: string): string => {
    const value = argv[index]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`[migrate-v4] ${flag} 需要一个值`)
    }
    return value
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string
    if (arg === '--dry-run') {
      mode = MIGRATION_MODES.dryRun
    } else if (arg === '--apply') {
      mode = MIGRATION_MODES.apply
    } else if (arg === '--project') {
      index += 1
      projectId = readValue(index, '--project')
    } else if (arg.startsWith('--project=')) {
      projectId = arg.slice('--project='.length)
      if (!projectId) throw new Error('[migrate-v4] --project 需要一个值')
    } else if (arg === '--limit' || arg.startsWith('--limit=')) {
      const raw = arg.startsWith('--limit=')
        ? arg.slice('--limit='.length)
        : readValue((index += 1), '--limit')
      const parsed = Number(raw)
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`[migrate-v4] --limit 必须是正整数，收到 ${raw}`)
      }
      limit = parsed
    } else {
      throw new Error(`[migrate-v4] 未知参数 ${arg}`)
    }
  }

  return {
    mode,
    ...(projectId ? { projectId } : {}),
    ...(limit === undefined ? {} : { limit }),
  }
}

/* ── 普查 / 过滤（纯函数，可测）──────────────────────────────────────── */

export interface MigrationProjectRow {
  readonly id: string
  readonly name: string
  readonly isDeleted: boolean
  readonly clerkId: string
  readonly state: unknown
}

/** `state.version` 读数。`null` = 字段缺省（= v3 的形状）。 */
export function readStateVersion(state: unknown): number | null {
  if (typeof state !== 'object' || state === null) return null
  const version = (state as { version?: unknown }).version
  return typeof version === 'number' ? version : null
}

/** 普查表的键：缺省版本记成 `none`，其余记成版本号字符串。 */
export function censusByVersion(
  rows: readonly MigrationProjectRow[],
): Record<string, number> {
  const census: Record<string, number> = {}
  for (const row of rows) {
    const version = readStateVersion(row.state)
    const key = version === null ? 'none' : String(version)
    census[key] = (census[key] ?? 0) + 1
  }
  return census
}

/**
 * 待处理集合：`version` 缺省或 ≠ 4，且未软删。`--project` / `--limit` 在这一步生效。
 *
 * ⚠ 软删项目不进来：备份服务按 `isDeleted: false` 查，进来只会稳定备份失败。
 */
export function selectProjectsToMigrate(
  rows: readonly MigrationProjectRow[],
  options: Pick<CliOptions, 'projectId' | 'limit'> = {},
): MigrationProjectRow[] {
  const selected = rows.filter((row) => {
    if (options.projectId !== undefined && row.id !== options.projectId) {
      return false
    }
    if (row.isDeleted) return false
    return readStateVersion(row.state) !== 4
  })
  return options.limit === undefined
    ? selected
    : selected.slice(0, options.limit)
}

/* ── 逐项目处置（依赖注入，可测）────────────────────────────────────── */

export const PROJECT_OUTCOMES = {
  /** 已经是 v4 —— 幂等跳过，不备份不写。 */
  skippedAlreadyV4: 'skippedAlreadyV4',
  /** dry-run：升级跑通且过 `NodeWorkflowStateV4Schema`，未写库。 */
  validated: 'validated',
  /** apply：备份成功 → 升级 → 已写回 `version: 4`。 */
  migrated: 'migrated',
  /** 备份失败 → 跳过该项目，⛔ 不写。 */
  backupFailed: 'backupFailed',
  /** 迁移本身跑不动（state 坏到映射不出来）。 */
  migrationFailed: 'migrationFailed',
  /** 升级结果过不了 v4 schema。 */
  invalidResult: 'invalidResult',
} as const

export type ProjectOutcome =
  (typeof PROJECT_OUTCOMES)[keyof typeof PROJECT_OUTCOMES]

export interface ProjectReport {
  readonly id: string
  readonly name: string
  readonly outcome: ProjectOutcome
  readonly nodes?: number
  readonly edges?: number
  readonly backupKey?: string
  readonly error?: string
}

export interface MigrateProjectDeps {
  /** 备份原始 v3 state。返回 key = 成功；返回 null 或抛 = 失败。 */
  backup(row: MigrationProjectRow): Promise<{ key: string } | null>
  /** 写回 v4。dry-run 传空实现。 */
  persist(row: MigrationProjectRow, state: NodeWorkflowStateV4): Promise<void>
  readonly now?: string
}

/**
 * 一个项目的完整处置。**不碰 Prisma / R2**：备份与写回都由调用方注入，所以这条
 * 路径（含「备份失败就不写」）可以在单测里原样跑。
 */
export async function migrateOneProject(
  row: MigrationProjectRow,
  deps: MigrateProjectDeps,
  mode: MigrationMode = MIGRATION_MODES.dryRun,
): Promise<ProjectReport> {
  if (readStateVersion(row.state) === 4) {
    // 幂等跳过。⚠ 但标着 v4 的坏 state 要大声报出来：静默跳过等于让一份读不出来
    // 的图混在「已完成」里，回填跑完也没人知道它坏了。
    const existing = NodeWorkflowStateV4Schema.safeParse(row.state)
    return {
      id: row.id,
      name: row.name,
      outcome: existing.success
        ? PROJECT_OUTCOMES.skippedAlreadyV4
        : PROJECT_OUTCOMES.invalidResult,
      ...(existing.success ? {} : { error: existing.error.message }),
    }
  }

  const result = await upgradeNodeWorkflowStateToV4({
    projectId: row.id,
    rawState: row.state,
    backup: () => deps.backup(row),
    ...(deps.now ? { now: deps.now } : {}),
  })

  if (result.outcome === NODE_V4_UPGRADE_OUTCOMES.migrationFailed) {
    return {
      id: row.id,
      name: row.name,
      outcome: PROJECT_OUTCOMES.migrationFailed,
      ...(result.error ? { error: result.error } : {}),
    }
  }
  if (result.outcome === NODE_V4_UPGRADE_OUTCOMES.backupFailed) {
    return {
      id: row.id,
      name: row.name,
      outcome: PROJECT_OUTCOMES.backupFailed,
      error: result.error ?? 'backupFailed',
    }
  }

  // 升级结果自己再过一遍 v4 schema：`--dry-run` 的全部价值就在这一句上。
  const parsed = NodeWorkflowStateV4Schema.safeParse(result.state)
  if (!parsed.success) {
    return {
      id: row.id,
      name: row.name,
      outcome: PROJECT_OUTCOMES.invalidResult,
      error: parsed.error.message,
    }
  }

  const counts = {
    nodes: parsed.data.nodes.length,
    edges: parsed.data.edges.length,
  }
  if (mode === MIGRATION_MODES.dryRun) {
    return {
      id: row.id,
      name: row.name,
      outcome: PROJECT_OUTCOMES.validated,
      ...counts,
    }
  }

  await deps.persist(row, parsed.data)
  return {
    id: row.id,
    name: row.name,
    outcome: PROJECT_OUTCOMES.migrated,
    ...counts,
    ...(result.backupKey ? { backupKey: result.backupKey } : {}),
  }
}

export interface RunSummary {
  readonly succeeded: number
  readonly skipped: number
  readonly failed: number
}

const FAILED_OUTCOMES: ReadonlySet<ProjectOutcome> = new Set([
  PROJECT_OUTCOMES.backupFailed,
  PROJECT_OUTCOMES.migrationFailed,
  PROJECT_OUTCOMES.invalidResult,
])

export function summarize(reports: readonly ProjectReport[]): RunSummary {
  let succeeded = 0
  let skipped = 0
  let failed = 0
  for (const report of reports) {
    if (FAILED_OUTCOMES.has(report.outcome)) failed += 1
    else if (report.outcome === PROJECT_OUTCOMES.skippedAlreadyV4) skipped += 1
    else succeeded += 1
  }
  return { succeeded, skipped, failed }
}

export function formatProjectLine(report: ProjectReport): string {
  const counts =
    report.nodes === undefined
      ? ''
      : ` nodes=${report.nodes} edges=${report.edges}`
  const backup = report.backupKey ? ` backup=${report.backupKey}` : ''
  const error = report.error ? ` error=${report.error}` : ''
  return `[migrate-v4] ${report.outcome} ${report.id} (${report.name})${counts}${backup}${error}`
}

/* ── 真跑 ───────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  const options = parseCliArgs(process.argv.slice(2))

  const dotenv = await import('dotenv')
  dotenv.config({ path: '.env.local' })
  const { db } = await import('@/lib/db')

  const rows: MigrationProjectRow[] = (
    await db.nodeWorkflowProject.findMany({
      select: {
        id: true,
        name: true,
        isDeleted: true,
        state: true,
        user: { select: { clerkId: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
  ).map((row) => ({
    id: row.id,
    name: row.name,
    isDeleted: row.isDeleted,
    clerkId: row.user.clerkId,
    state: row.state,
  }))

  console.log(`[migrate-v4] MODE ${options.mode}`)
  console.log(`[migrate-v4] TOTAL ${rows.length}`)
  console.log(
    `[migrate-v4] BY_VERSION ${JSON.stringify(censusByVersion(rows))}`,
  )
  console.log(
    `[migrate-v4] DELETED ${rows.filter((row) => row.isDeleted).length}`,
  )

  const targets = selectProjectsToMigrate(rows, options)
  console.log(`[migrate-v4] TARGETS ${targets.length}`)

  const apply = options.mode === MIGRATION_MODES.apply
  const deps: MigrateProjectDeps = apply
    ? await buildApplyDeps()
    : {
        // dry-run：不碰 R2、不写库。备份桩返回一个假 key，只为让升级路径走完。
        backup: async () => ({ key: 'dry-run-no-backup' }),
        persist: async () => {},
      }

  const reports: ProjectReport[] = []
  for (const row of targets) {
    const report = await migrateOneProject(row, deps, options.mode)
    reports.push(report)
    console.log(formatProjectLine(report))
  }

  const summary = summarize(reports)
  console.log(
    `\n[migrate-v4] SUMMARY 成功 ${summary.succeeded} · 跳过 ${summary.skipped} · 失败 ${summary.failed}`,
  )
  if (summary.failed > 0) {
    console.error(
      `[migrate-v4] 失败清单\n${JSON.stringify(
        reports.filter((report) => FAILED_OUTCOMES.has(report.outcome)),
        null,
        2,
      )}`,
    )
    process.exitCode = 1
  }
  await db.$disconnect()
}

/**
 * `--apply` 的真实依赖。⚠ 动态 import：这两条链顶着 `import 'server-only'`，
 * dry-run 不该为它们付加载成本，更不该在没装 R2 凭据的机器上直接崩。
 */
async function buildApplyDeps(): Promise<MigrateProjectDeps> {
  const { db } = await import('@/lib/db')
  const { backupNodeWorkflowV3State } =
    await import('@/services/node/node-workflow-v3-backup.service')
  return {
    backup: async (row) => {
      const result = await backupNodeWorkflowV3State(row.clerkId, row.id)
      return result ? { key: result.key } : null
    },
    persist: async (row, state) => {
      await db.nodeWorkflowProject.update({
        where: { id: row.id },
        data: { state: state as unknown as Prisma.InputJsonValue },
      })
    },
  }
}

// tsx 直跑时才执行；被单测 import 时不跑。
if (process.argv[1]?.endsWith('migrate-node-workflow-v4.ts')) {
  void main()
}
