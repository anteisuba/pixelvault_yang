'use client'

/**
 * 操作员面板在**节点画布**（`/studio/node`）这个宿主上的实现（C1 正片）。
 *
 * ── 与另外两份宿主的关系 ───────────────────────────────────────────
 * 同一个契约（`contexts/studio-operator-host.tsx`）的第三份实现。工作台读写
 * `studio-context` 的 reducer，装配台读写 `GenerateBranch` 的局部 state，这一份
 * 读写 `useNodeWorkflow` 的项目状态 —— 快照从活的图长出来
 * （`lib/canvas-operator-snapshot.ts`），落笔经纯函数
 * `applyCanvasOperatorStep` 算成 `{ patch, inverse }` 再一次施加
 * （`lib/canvas-operator-apply.ts`）。
 *
 * ── 三条硬规矩 ─────────────────────────────────────────────────────
 * ① **一批 = 一个撤销步**：每一步的施加都包在 `runAsSingleHistoryStep` 里；
 *    `stage_nodes` / `connect_nodes` 只给「撤销这一批」，仅当它仍是最近一步
 *    （撤销栈顶还是落笔时扣下的那个引用，`readUndoTarget()`）可点，否则置灰给理由
 *    （拍板 3）；批撤走 `workflow.undo()`，理由见 `CanvasOperatorLedgerEntry`。
 * ② **图现读**：每一步都从 `workflow.readState()` 拿此刻的图，⛔ 不用 render
 *    快照 —— 同一轮里上一步刚建的节点这一步要连线（旧执行块的台账 K-2）。
 * ③ **落不下去往线程里插一行，⛔ 不静默**：服务端放行了而图上对不上（节点被人手
 *    删了 / 别名没登记），日志条写着「已做」画布纹丝不动是本仓最难查的失败。
 *
 * ── C1 只挂不接 UI ───────────────────────────────────────────────
 * dock 仍走 marker 链（C2 平价后整体退役）。宿主先以 hook 形式存在并在
 * `StudioNodeWorkbench` 用 `<StudioOperatorHostProvider>` 挂上，可用性由单测证明。
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'

import { ASSISTANT_OPERATOR_LIMITS } from '@/constants/assistant-operator'
import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import type { NodeWorkflowNodeType } from '@/constants/node-types'
import {
  CANVAS_OPERATOR_BATCH_UNDO_REASON_IDS,
  type CanvasOperatorChangeKey,
} from '@/constants/studio-assistant-operator'
import type { StudioOperatorHost } from '@/contexts/studio-operator-host'
import type { AssistantOperatorSnapshot } from '@/types/assistant-operator'
import type {
  NodeWorkflowEdge,
  NodeWorkflowGraphPatch,
  NodeWorkflowModelOptionsByType,
  NodeWorkflowNode,
  NodeWorkflowState,
} from '@/types/node-workflow'
import type { ScriptDoc } from '@/types/script-doc'
import { createWorkflowId } from '@/hooks/node/use-node-workflow'
import {
  appendOperatorEntry,
  nextOperatorEntryId,
  setOperatorPrimed,
} from '@/hooks/use-studio-operator-store'
import {
  applyCanvasOperatorStep,
  type CanvasOperatorAliases,
  type CanvasOperatorAppliedStep,
  type CanvasOperatorApplyInput,
  type CanvasOperatorApplyOutcome,
} from '@/lib/canvas-operator-apply'
import { buildCanvasOperatorSnapshot } from '@/lib/canvas-operator-snapshot'
import type {
  CanvasOperatorBatchUndoGate,
  StudioOperatorApplyContext,
  StudioOperatorCanvasContext,
} from '@/lib/studio-operator-apply'

/**
 * 宿主真正用到的那几只手 —— ⚠ 有意不写成 `ReturnType<typeof useNodeWorkflow>`：
 * 这个 hook 只碰七样东西，把 60 个成员的返回值拖进签名只会让它看起来依赖更多，
 * 而且测试得伪造一整份工作流。
 */
export interface CanvasOperatorWorkflow {
  nodes: readonly NodeWorkflowNode[]
  edges: readonly NodeWorkflowEdge[]
  currentProjectId: string
  currentProjectName: string
  scriptDoc: ScriptDoc | undefined
  readState(): NodeWorkflowState
  applyGraphPatch(patch: NodeWorkflowGraphPatch): void
  runAsSingleHistoryStep<T>(run: () => T | Promise<T>): Promise<T>
  readUndoTarget(): NodeWorkflowState | undefined
  undo(): void
}

export interface UseCanvasOperatorHostInput {
  workflow: CanvasOperatorWorkflow
  modelOptionsByType: NodeWorkflowModelOptionsByType
  getNodeTypeLabel(type: NodeWorkflowNodeType): string
  open: boolean
  setOpen(open: boolean): void
}

/**
 * 落笔那一刻扣下的本钱：逆补丁 + 那时的撤销栈顶（`before`）。
 *
 * ── 批步为什么撤的是 `workflow.undo()` 而不是逆补丁 ─────────────────
 * 一批 = 一个撤销步（拍板 3）。用逆补丁撤会**再记一步**，于是它前面那一批永远不再
 * 是「最近一步」—— 先建后连、先撤连再撤建这条最常见的路就走不通了。`undo()` 把
 * 栈顶弹回去，前一批自然又成了栈顶。判「还是不是最近一步」= 栈顶还是不是落笔时
 * 扣下的那个引用（`readUndoTarget()`）。`set_*` 是字段级 inverse，照旧走逆补丁。
 *
 * ⭐ 按 **step 对象**存（`Map` 是为了 `changes()` 能遍历）：服务端每轮从 `step-1`
 * 重编号，`step.id` 在线程里不唯一；线程条目里存的正是同一个对象
 * （`upsertOperatorStep` 原样收进去、`revertOperatorStep` 原样传回来）。刷新后
 * 载回的历史是新对象 → 查不到 → `unknownStep`，那正是「本钱丢了」的诚实答案。
 */
interface CanvasOperatorLedgerEntry {
  inverse: NodeWorkflowGraphPatch
  /** 落笔那一刻的撤销栈顶（= 这一步之前的状态引用）；非批步不读它。 */
  before: NodeWorkflowState | undefined
  batch: boolean
  changes: readonly CanvasOperatorChangeKey[]
  undone: boolean
}

export function useCanvasOperatorHost(
  input: UseCanvasOperatorHostInput,
): StudioOperatorHost {
  /** 与另外两份宿主同一条：事件循环跨很多次 render，每一样都从 ref 里读。 */
  const latest = useRef(input)
  useEffect(() => {
    latest.current = input
  }, [input])

  /** `new:<n>` → 真实 id。随 run 存活（见 `canvas-operator-apply.ts` 头注）。 */
  const aliasesRef = useRef<CanvasOperatorAliases>(new Map())
  const ledger = useRef(new Map<object, CanvasOperatorLedgerEntry>())

  const buildSnapshot = useCallback((): AssistantOperatorSnapshot => {
    const { workflow, modelOptionsByType, getNodeTypeLabel } = latest.current
    return buildCanvasOperatorSnapshot({
      projectId: workflow.currentProjectId,
      projectName: workflow.currentProjectName,
      nodes: workflow.nodes,
      edges: workflow.edges,
      scriptDoc: workflow.scriptDoc,
      modelOptionsByType,
      getNodeTypeLabel,
    })
  }, [])

  const canvas = useMemo<StudioOperatorCanvasContext>(() => {
    const applyInput: CanvasOperatorApplyInput = {
      createId: createWorkflowId,
      now: () => new Date().toISOString(),
      /**
       * 目录查表：与快照里 `modelOptions` 同一张表（`useWorkflowModelOptions`），
       * 服务端只认表内组合，所以查不到只可能是表在两次请求之间变了。
       */
      resolveModelOption: (nodeType, modelId, optionId) =>
        latest.current.modelOptionsByType[nodeType]?.find(
          (option) =>
            option.modelId === modelId && option.optionId === optionId,
        ) ?? null,
    }

    const gate = (
      step: CanvasOperatorAppliedStep,
      requireBatch: boolean,
    ): CanvasOperatorBatchUndoGate => {
      const entry = ledger.current.get(step)
      if (!entry) {
        return {
          ok: false,
          reason: CANVAS_OPERATOR_BATCH_UNDO_REASON_IDS.unknownStep,
        }
      }
      if (requireBatch && !entry.batch) {
        return {
          ok: false,
          reason: CANVAS_OPERATOR_BATCH_UNDO_REASON_IDS.notBatch,
        }
      }
      if (entry.undone) {
        return {
          ok: false,
          reason: CANVAS_OPERATOR_BATCH_UNDO_REASON_IDS.alreadyUndone,
        }
      }
      if (
        entry.batch &&
        entry.before !== latest.current.workflow.readUndoTarget()
      ) {
        return {
          ok: false,
          reason: CANVAS_OPERATOR_BATCH_UNDO_REASON_IDS.notLatest,
        }
      }
      return { ok: true }
    }

    return {
      apply: (step): CanvasOperatorApplyOutcome => {
        const { workflow } = latest.current
        const outcome = applyCanvasOperatorStep(
          workflow.readState(),
          step,
          aliasesRef.current,
          applyInput,
        )
        switch (outcome.kind) {
          case 'patch': {
            aliasesRef.current = outcome.aliases
            let before = workflow.readUndoTarget()
            // ⚠ `run` 同步执行到第一个 await，而这里面没有 await：补丁在 `apply` 返回前
            //    已经在图上；栈顶要在 `runAsSingleHistoryStep` 记完账**之后**读。
            void workflow.runAsSingleHistoryStep(() => {
              before = workflow.readUndoTarget()
              workflow.applyGraphPatch(outcome.patch)
            })
            ledger.current.set(step, {
              inverse: outcome.inverse,
              before,
              batch: outcome.batch,
              changes: outcome.changes,
              undone: false,
            })
            return outcome
          }
          case 'read':
            return outcome
          case 'notApplicable':
            appendOperatorEntry({
              kind: 'system',
              id: nextOperatorEntryId('sys'),
              code: 'canvasStepDeferred',
              subject: step.title,
            })
            return outcome
          case 'refused':
            appendOperatorEntry({
              kind: 'system',
              id: nextOperatorEntryId('sys'),
              code: 'canvasStepRefused',
              subject: step.title,
            })
            return outcome
        }
      },
      revert: (step) => {
        const verdict = gate(step, false)
        if (!verdict.ok) return verdict
        const entry = ledger.current.get(step)
        if (!entry) {
          return {
            ok: false,
            reason: CANVAS_OPERATOR_BATCH_UNDO_REASON_IDS.unknownStep,
          }
        }
        const { workflow } = latest.current
        if (entry.batch) {
          workflow.undo()
        } else {
          void workflow.runAsSingleHistoryStep(() => {
            workflow.applyGraphPatch(entry.inverse)
          })
        }
        entry.undone = true
        return verdict
      },
      canUndoBatch: (step) => gate(step, true),
      changes: () => {
        const keys: CanvasOperatorChangeKey[] = []
        for (const entry of ledger.current.values()) {
          if (!entry.undone) keys.push(...entry.changes)
        }
        return keys
      },
    }
  }, [])

  const apply = useMemo<StudioOperatorApplyContext>(
    () => ({
      /**
       * ⚠ 画布上没有「这台工作台的提示词框 / 负面框」—— 两格给空。到得了这份
       * 上下文的只有画布域工具表允许的那些（域闸 + 服务端 `noSuchControl` 两道），
       * `set_prompt` 那一族根本送不上来。下面那些空手同一个论据（与装配台的
       * `addAudioReference` 那几条同源）：缺席在运行时不会发生，这里是类型层的诚实。
       */
      getState: () => ({ prompt: '', advancedParams: {} }),
      dispatch: () => {},
      resolveOptionId: () => null,
      addReference: () => {},
      removeReference: () => {},
      addAudioReference: () => {},
      removeAudioReference: () => {},
      setSound: () => {},
      mountUserUrl: () => {},
      unmountUserUrl: () => {},
      /** 工作台级的 primed 态照常按域分槽（`prime_node_generate` 走的是节点上的字段）。 */
      setPrimed: setOperatorPrimed,
      canvas,
    }),
    [canvas],
  )

  return useMemo(
    () => ({
      domain: ASSISTANT_PROTOCOL_DOMAIN_IDS.canvas,
      buildSnapshot,
      apply,
      // 画布上没有表单参考位；联网候选一行能选几张回落到载荷护栏上限。
      referenceLimit: ASSISTANT_OPERATOR_LIMITS.maxSnapshotReferences,
      open: input.open,
      setOpen: input.setOpen,
    }),
    [apply, buildSnapshot, input.open, input.setOpen],
  )
}
