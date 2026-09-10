/**
 * 逐项目惰性升级 v3 → v4（node-canvas-v2 §14.2 · owner 拍板「画-3」）。
 *
 * ── 为什么是「加载时迁移、首次保存即升级」而不是双写 ──────────────────
 * 工程原则 1 不留兼容层：读到 `version !== 4` 就在内存里跑**同一个纯函数**得到
 * v4 视图，之后**只写 v4**。等价于逐项目惰性迁移，且与 C3 的批量脚本
 * （`scripts/migrate-node-workflow-v4.ts`）用同一份映射，结果一致。
 *
 * ── 顺序纪律（⚠ 不能反）────────────────────────────────────────────────
 * **备份成功才允许写 v4**。备份失败 → `canPersist: false`，画布不写、报错可见。
 * 静默失败等于用户的 v3 图在下一次防抖写入时被 v4 覆盖且没有退路。
 *
 * ⛔ 本模块不发请求：`backup` 由调用方注入（画布传 api-client，单测传桩）。
 */

import { logger } from '@/lib/logger'
import { migrateNodeWorkflowStateToV4 } from '@/lib/node-workflow-migrate-v4'
import type { V3State } from '@/lib/node-workflow-migrate-v4'
import { reconcileStateSlots } from '@/lib/node-slot-binding'
import {
  NodeWorkflowStateV4Schema,
  type NodeWorkflowStateV4,
} from '@/types/node-workflow'

export const NODE_V4_UPGRADE_OUTCOMES = {
  /** 本来就是 v4，什么都没做。 */
  alreadyV4: 'alreadyV4',
  /** v3 → 备份成功 → 已升级，可以写回。 */
  upgraded: 'upgraded',
  /** v3 → 备份失败 → **不升级、不写**。画布继续显示迁移后的视图但禁止持久化。 */
  backupFailed: 'backupFailed',
  /** 连迁移都跑不动（state 坏到映射不出来）。 */
  migrationFailed: 'migrationFailed',
} as const

export type NodeV4UpgradeOutcome =
  (typeof NODE_V4_UPGRADE_OUTCOMES)[keyof typeof NODE_V4_UPGRADE_OUTCOMES]

export interface NodeV4UpgradeResult {
  readonly outcome: NodeV4UpgradeOutcome
  /** 渲染用的 v4 视图。`migrationFailed` 时为 `undefined`。 */
  readonly state?: NodeWorkflowStateV4
  /** ⚠ 只有它为 true 时画布才被允许把 v4 写回服务端。 */
  readonly canPersist: boolean
  readonly backupKey?: string
  readonly error?: string
}

export interface UpgradeToV4Params {
  readonly projectId: string
  readonly rawState: unknown
  /** 备份 v3 原始 JSON。返回 key = 成功；抛错或返回 null = 失败。 */
  backup(projectId: string): Promise<{ key: string } | null>
  readonly now?: string
}

function isV4(state: unknown): state is NodeWorkflowStateV4 {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as { version?: unknown }).version === 4
  )
}

/**
 * 一份存量 state → 可渲染的 v4 视图 + 「能不能写回」这一个布尔。
 */
export async function upgradeNodeWorkflowStateToV4(
  params: UpgradeToV4Params,
): Promise<NodeV4UpgradeResult> {
  if (isV4(params.rawState)) {
    const parsed = NodeWorkflowStateV4Schema.safeParse(params.rawState)
    if (!parsed.success) {
      // v4 的读路径**不把 parse 失败翻译成空状态**（§9.2 第 4 条）：静默清空
      // 那条路在 v4 里彻底封死。
      return {
        outcome: NODE_V4_UPGRADE_OUTCOMES.migrationFailed,
        canPersist: false,
        error: parsed.error.message,
      }
    }
    return {
      outcome: NODE_V4_UPGRADE_OUTCOMES.alreadyV4,
      state: reconcileStateSlots(parsed.data, { now: params.now }),
      canPersist: true,
    }
  }

  let migrated: NodeWorkflowStateV4
  try {
    migrated = migrateNodeWorkflowStateToV4(
      (params.rawState ?? {}) as V3State,
      {
        ...(params.now ? { now: params.now } : {}),
      },
    ).state
  } catch (error) {
    logger.error('[node-workflow] v3 → v4 migration failed', {
      projectId: params.projectId,
      error: error instanceof Error ? error.message : String(error),
    })
    return {
      outcome: NODE_V4_UPGRADE_OUTCOMES.migrationFailed,
      canPersist: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  const state = reconcileStateSlots(migrated, { now: params.now })

  let backupKey: string | undefined
  try {
    backupKey = (await params.backup(params.projectId))?.key
  } catch (error) {
    backupKey = undefined
    logger.error('[node-workflow] v3 backup threw; refusing to persist v4', {
      projectId: params.projectId,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  if (!backupKey) {
    // ⛔ 不升级、不写。画布可以显示这份 v4 视图（用户看得见自己的图），但持久化
    // 关闸——否则下一次防抖写入就把 v3 原件覆盖了。
    return {
      outcome: NODE_V4_UPGRADE_OUTCOMES.backupFailed,
      state,
      canPersist: false,
      error: 'backupFailed',
    }
  }

  logger.info(
    '[node-workflow] project upgraded to v4 after successful backup',
    {
      projectId: params.projectId,
      backupKey,
      nodes: state.nodes.length,
      edges: state.edges.length,
    },
  )
  return {
    outcome: NODE_V4_UPGRADE_OUTCOMES.upgraded,
    state,
    canPersist: true,
    backupKey,
  }
}
