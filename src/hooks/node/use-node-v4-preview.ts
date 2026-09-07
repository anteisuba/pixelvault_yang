'use client'

/**
 * v4 渲染的**本地预览通道**（第三期 · 画布 C3c-① D）。
 *
 * ── 为什么要有它 ────────────────────────────────────────────────────────
 * `NODE_V4_COMPONENTS` 至今零消费者：v4 的卡、槽格、展开态、生成编排区全都写完
 * 了，但画布上一个都渲染不出来，owner 无法在真机上看见任何一块。翻转（把
 * `nodeTypes` 整体换掉、删 v3 分支）是 C3c-③ 的事，这一片先给一条**只读预览**：
 * 画布仍然是 v3 的，加 `?v4=1` 时额外在内存里升级出一份 v4 视图并用 v4 组件渲染。
 *
 * ── 三条边界（⚠ 别越）────────────────────────────────────────────────
 * ① **不写库**：`backup` 注入成恒返回 `null` 的桩 → `upgradeNodeWorkflowStateToV4`
 *    落在 `backupFailed`，`canPersist: false`。这不是「凑合」，正是那个函数为
 *    「能看不能写」设计的档 —— ⛔ 不打真的备份接口、不走 `saveNow`。
 * ② **不改 v3**：预览态的编辑（设为当前 / 断开 / 改提示词）只落在这份内存视图上，
 *    关掉 `?v4=1` 就没了。这条必须说在前面，否则用户会以为自己改了图。
 * ③ **一次快照**：升级只在项目切换时跑一次，⛔ 不跟着 v3 的每次改动重跑 ——
 *    重跑会把用户在预览里的改动冲掉。
 */

import { useEffect, useRef, useState } from 'react'

import { upgradeNodeWorkflowStateToV4 } from '@/lib/node-workflow-v4-upgrade'
import type { NodeWorkflowStateV4 } from '@/types/node-workflow'

export interface NodeV4PreviewValue {
  /** `null` = 没开预览，或这份 state 迁移不出来（理由在 `error`）。 */
  readonly state: NodeWorkflowStateV4 | null
  readonly error: string | null
  setState(next: NodeWorkflowStateV4): void
}

export function useNodeV4Preview({
  enabled,
  projectId,
  rawState,
}: {
  readonly enabled: boolean
  readonly projectId: string
  readonly rawState: unknown
}): NodeV4PreviewValue {
  const [state, setState] = useState<NodeWorkflowStateV4 | null>(null)
  const [error, setError] = useState<string | null>(null)
  // ⚠ 快照钉在项目上：v3 state 每次防抖写入都会换引用，跟着它重跑等于每敲一个字
  // 就把预览里的改动重置一次。
  const snapshotRef = useRef<string | null>(null)

  useEffect(() => {
    // ⚠ 关掉预览时**什么都不做**：返回值里已经按 `enabled` 收窄成 null，
    // 在 effect 里同步 setState 只会多一轮级联渲染。
    if (!enabled) return
    if (snapshotRef.current === projectId) return
    snapshotRef.current = projectId
    let cancelled = false
    void upgradeNodeWorkflowStateToV4({
      projectId,
      rawState,
      // ⛔ 预览不备份也不持久化 —— 见文件头边界①。
      backup: async () => null,
    }).then((result) => {
      if (cancelled) return
      setState(result.state ?? null)
      setError(result.state ? null : (result.error ?? result.outcome))
    })
    return () => {
      cancelled = true
    }
    // ⚠ `rawState` 在依赖里，但 `snapshotRef` 的早退让它**每个项目只跑一次**：
    // v3 state 每次防抖写入都换引用，跟着它重跑会冲掉预览里的改动。
  }, [enabled, projectId, rawState])

  return {
    state: enabled ? state : null,
    error: enabled ? error : null,
    setState,
  }
}
