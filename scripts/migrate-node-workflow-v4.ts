/**
 * 一次性回填 CLI：`NodeWorkflowProject.state` v3 → v4（node-canvas-v2 §9.2）。
 *
 * Usage:
 *   npx tsx scripts/migrate-node-workflow-v4.ts --dry-run   # 只打印 diff 统计，不写库
 *   npx tsx scripts/migrate-node-workflow-v4.ts             # 真跑（C3，本片不执行）
 *
 * ⚠ 映射本体住在 `src/lib/node-workflow-migrate-v4.ts` —— 画布的逐项目惰性升级
 * （C2）与本脚本的批量回填用**同一个纯函数**，两处结果必须一致。
 *
 * ── 顺序纪律（⚠ 不能反）──────────────────────────────────────────────────
 * `NodeWorkflowStateSchema.nodes` 是 `z.array()` **无逐项 `.catch()`**：先删 legacy
 * enum 再迁移 = 存量项目整份 parse 失败 → `validateState` 兜成空状态 → 用户看到
 * 空画布且静默无报错。所以**回填跑完并验证之后**才删 v3 schema / enum。
 */

import {
  migrateNodeWorkflowStateToV4,
  type MigrationStats,
  type V3State,
} from '@/lib/node-workflow-migrate-v4'

/* ── CLI ────────────────────────────────────────────────────────────────
 * 只有 dry-run 在本片可用。真跑（备份 → 改写 → 就地校验 → 不等即回滚）是 C3，
 * 那时才接 Prisma 与 `uploadToR2`。
 */
async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')
  if (!dryRun) {
    console.error(
      '[migrate-v4] ⛔ 真跑属于 C3（含 R2 备份与就地校验回滚）。本片只提供 --dry-run。',
    )
    process.exitCode = 1
    return
  }

  const dotenv = await import('dotenv')
  dotenv.config({ path: '.env.local' })
  const { PrismaClient } = await import('../src/lib/generated/prisma/client')
  const { PrismaPg } = await import('@prisma/adapter-pg')
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  })

  const projects = await prisma.nodeWorkflowProject.findMany({
    select: { id: true, name: true, state: true },
  })
  const totals: MigrationStats = {
    nodesIn: 0,
    nodesOut: 0,
    droppedRetiredNodes: 0,
    edgesIn: 0,
    edgesOut: 0,
    droppedEdges: 0,
    bySourceType: {},
    byTarget: {},
    bySlot: {},
  }
  const failures: { id: string; error: string }[] = []

  for (const project of projects) {
    try {
      const { stats } = migrateNodeWorkflowStateToV4(
        (project.state ?? {}) as V3State,
      )
      totals.nodesIn += stats.nodesIn
      totals.nodesOut += stats.nodesOut
      totals.droppedRetiredNodes += stats.droppedRetiredNodes
      totals.edgesIn += stats.edgesIn
      totals.edgesOut += stats.edgesOut
      totals.droppedEdges += stats.droppedEdges
      for (const [key, count] of Object.entries(stats.bySourceType)) {
        totals.bySourceType[key] = (totals.bySourceType[key] ?? 0) + count
      }
      for (const [key, count] of Object.entries(stats.byTarget)) {
        totals.byTarget[key] = (totals.byTarget[key] ?? 0) + count
      }
      for (const [key, count] of Object.entries(stats.bySlot)) {
        totals.bySlot[key] = (totals.bySlot[key] ?? 0) + count
      }
      console.log(
        `[migrate-v4] ${project.id} nodes ${stats.nodesIn}→${stats.nodesOut} (剥除 ${stats.droppedRetiredNodes}) · edges ${stats.edgesIn}→${stats.edgesOut} (丢弃 ${stats.droppedEdges})`,
      )
    } catch (error) {
      failures.push({
        id: project.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  console.log('\n[migrate-v4] 汇总（dry-run，未写库）')
  console.log(JSON.stringify(totals, null, 2))
  if (failures.length > 0) {
    console.error(`\n[migrate-v4] 失败清单 ${failures.length} 项`)
    console.error(JSON.stringify(failures, null, 2))
    process.exitCode = 1
  }
  await prisma.$disconnect()
}

// tsx 直跑时才执行；被单测 import 时不跑。
if (process.argv[1]?.endsWith('migrate-node-workflow-v4.ts')) {
  void main()
}
