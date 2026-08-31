'use client'

/**
 * 撤销 / 还原 —— **两个宿主共用的那一份**。
 *
 * 调用方有两个：面板里的日志条（hover 撤销，拍板 18）与参数栏里的归属标记
 * （✦ 点一下还原这个字段）。它们分属两棵组件树，但做的是同一件事，所以逻辑住在
 * 这里而不是任何一个宿主里 —— 抄两份的下场是「日志里划了线、✦ 还亮着」。
 *
 * ⚠ 这个 hook **不碰流**：撤销是纯客户端动作（`inverse` 已经在手上），它唯一的
 * 外溢是往线程里插一条系统行通报助手（拍板 18 的后半句）。
 */

import { useCallback } from 'react'

import {
  ASSISTANT_OPERATOR_READ_TOOLS,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
} from '@/constants/assistant-operator'
import {
  STUDIO_OPERATOR_FIELDS,
  type StudioOperatorField,
} from '@/constants/studio-assistant-operator'
import { useStudioOperatorHost } from '@/contexts/studio-operator-host'
import {
  appendOperatorEntry,
  clearOperatorChange,
  clearOperatorChanges,
  getOperatorState,
  markOperatorStepUndone,
  nextOperatorEntryId,
  useStudioOperatorState,
} from '@/hooks/use-studio-operator-store'
import {
  getOperatorStepField,
  revertOperatorStep,
  type StudioOperatorApplyContext,
} from '@/lib/studio-operator-apply'
import type {
  StudioOperatorStepEntry,
  StudioOperatorThreadEntry,
} from '@/types/studio-assistant-operator'

/**
 * 落笔的那几只手 —— **由宿主提供**（P4-C）。
 *
 * ⭐ 实现搬到了两个宿主各自的文件里：工作台在
 * `hooks/use-studio-workbench-operator-host.ts`，LoRA 装配台在
 * `hooks/use-lora-operator-host.ts`。这里只保留取用口，理由见
 * `contexts/studio-operator-host.tsx` 的头注 —— 撤销这条链原本 `useStudioForm()`，
 * 而 `/studio/lora` 故意不挂 `<StudioProvider>`，那条路上它会直接抛。
 *
 * ⚠ 留着这个名字（而不是让调用方直接 `useStudioOperatorHost().apply`）是因为它有
 * 两个调用方，而「应用与撤销共用同一份判据的两侧」这句话该在名字上看得见。
 */
export function useStudioOperatorApplyContext(): StudioOperatorApplyContext {
  return useStudioOperatorHost().apply
}

export interface UseStudioOperatorRevertResult {
  /**
   * 撤销一条日志（拍板 18：划线 + 线程插系统行）。
   * ⚠ 收的是**线程条目 id**，不是服务端的 `step.id`（后者每轮从 `step-1` 重编号，
   *   见 `operatorStepEntryId`）。
   */
  undoStep(entryId: string): void
  /** 还原一个字段（归属标记 ✦ 点一下）。 */
  revertField(field: StudioOperatorField): void
  /** 还原全部（二击确认由 UI 承担，这里只做事）。 */
  revertAll(): void
  /**
   * 还原**这一轮**（P3-C，评价卡上那颗「还原这轮」）。
   * 收的是那一轮的 token（`StudioOperatorStepEntry.runKey`）。
   */
  revertRound(runKey: string): void
  /** 那一轮有几处可还原 —— 按钮上写的那个数；0 时按钮不该出现。 */
  countRoundChanges(runKey: string): number
  /** 现在有几处改动 —— 「还原助手的全部改动（N 处）」里的那个数。 */
  changeCount: number
}

/**
 * 一条日志**能不能撤**。
 *
 * ⚠ 判据取词表不是手列：读类工具没有 inverse，撤它什么都撤不掉（`critique_result`
 * 就是新加的那条 —— 评价本身撤不掉，要撤的是它之后那几条 `set_*`）。
 * 与 `StudioOperatorLogItem` 里 `canUndo` 的判据逐字同源。
 */
function isRevertableStepEntry(entry: StudioOperatorThreadEntry): boolean {
  return (
    entry.kind === 'step' &&
    !entry.undone &&
    entry.step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done &&
    !(ASSISTANT_OPERATOR_READ_TOOLS as readonly string[]).includes(
      entry.step.tool,
    )
  )
}

export function useStudioOperatorRevert(): UseStudioOperatorRevertResult {
  const applyContext = useStudioOperatorApplyContext()
  const operatorState = useStudioOperatorState()

  const undoStep = useCallback(
    (entryId: string) => {
      const entry = getOperatorState().entries.find(
        (item) => item.kind === 'step' && item.id === entryId,
      )
      if (!entry || entry.kind !== 'step') return
      // ⚠ `status === 'done'` 同时收窄类型：被拒的那一支没有 inverse 可用。
      const applied = entry.step
      if (applied.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.done) return

      revertOperatorStep(applied, applyContext)
      markOperatorStepUndone(entryId)

      const field = getOperatorStepField(applied)
      // 同一个字段只要还有别的没撤的步就留着登记 —— 否则 ✦ 会在字段仍被改过的
      // 情况下消失（「标记没了，值还在」）。
      if (field) {
        const stillChanged = getOperatorState().entries.some(
          (item) =>
            item.kind === 'step' &&
            item.id !== entryId &&
            !item.undone &&
            item.step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done &&
            getOperatorStepField(item.step) === field,
        )
        if (!stillChanged) clearOperatorChange(field)
      }

      appendOperatorEntry({
        kind: 'system',
        id: nextOperatorEntryId('sys'),
        code: 'undoStep',
        subject: applied.title,
      })
    },
    [applyContext],
  )

  const revertField = useCallback(
    (field: StudioOperatorField) => {
      const change = getOperatorState().changes[field]
      if (!change) return
      revertOperatorStep(change.firstInverse, applyContext)
      clearOperatorChange(field)
      // 那个字段上所有没撤的步一起划线 —— 否则日志里会留下几条「已生效」的条目，
      // 而它们描述的值早就被还原了。
      for (const entry of getOperatorState().entries) {
        if (entry.kind !== 'step' || entry.undone) continue
        if (getOperatorStepField(entry.step) === field) {
          markOperatorStepUndone(entry.id)
        }
      }
      appendOperatorEntry({
        kind: 'system',
        id: nextOperatorEntryId('sys'),
        code: 'revertField',
        subject: field,
      })
    },
    [applyContext],
  )

  const revertAll = useCallback(() => {
    const changes = getOperatorState().changes
    const count = STUDIO_OPERATOR_FIELDS.filter(
      (field) => changes[field] !== undefined,
    ).length
    if (count === 0) return
    /**
     * ⚠ **倒着还原**：`set_specs` 与 `set_negative` 都读 `advancedParams` 的当前
     * 值再整体替换，正序走会让后一条把前一条刚还原好的键又覆盖回去。
     */
    for (const field of [...STUDIO_OPERATOR_FIELDS].reverse()) {
      const change = changes[field]
      if (change) revertOperatorStep(change.firstInverse, applyContext)
    }
    for (const entry of getOperatorState().entries) {
      if (entry.kind === 'step' && !entry.undone) {
        markOperatorStepUndone(entry.id)
      }
    }
    // ⚠ 顺手把生成键熄灭（拍板 14）：清完还留一个亮着的生成键，等于把用户
    //    推去点一次它自己已经撤销掉的那版配置。`clearOperatorChanges` 负责这件事。
    clearOperatorChanges()
    appendOperatorEntry({
      kind: 'system',
      id: nextOperatorEntryId('sys'),
      code: 'revertAll',
      count,
    })
  }, [applyContext])

  /**
   * 还原**这一轮**（P3-C，评价卡上那颗「还原这轮」）。
   *
   * ⭐ 复用的是同一条撤销机制（`revertOperatorStep` + 同一份 `inverse`），
   * ⛔ 没有第二套 —— 区别只在「选哪几条」和「插几行系统行」。
   *
   * ⚠ **倒着撤**：同一个字段这一轮被改过两次时，正序撤会先回到第一次改之前、
   * 再被第二条的 inverse 覆盖成中间版本。逆序是唯一能落回起点的顺序
   * （与 `revertAll` 里那条「倒着还原」同源，只是那边分的是字段、这边分的是步）。
   *
   * ⚠ 只插**一行**系统行：逐条 `undoStep` 会插 N 行，线程被自己的通报刷屏，
   * 而助手那边 `priorSteps` 已经从划线里知道了。
   */
  const revertRound = useCallback(
    (runKey: string) => {
      const entries = getOperatorState().entries
      const round = entries.filter(
        (entry): entry is StudioOperatorStepEntry =>
          entry.kind === 'step' &&
          entry.runKey === runKey &&
          isRevertableStepEntry(entry),
      )
      if (round.length === 0) return

      for (const entry of [...round].reverse()) {
        // ⚠ `status === 'done'` 同时把类型收窄成「应用过的那一支」。
        if (entry.step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.done) {
          continue
        }
        revertOperatorStep(entry.step, applyContext)
        markOperatorStepUndone(entry.id)
      }

      /**
       * 登记簿按字段收尾：这个字段在**别的轮**还有没撤的步就留着 ✦，
       * 否则清掉。⛔ 别无脑 `clearOperatorChange` —— 那会让「标记没了、值还在」。
       * ⚠ `firstInverse` 有意不动：它记的是助手第一次碰这个字段之前的原文，
       * 而这一轮只撤了这一轮，字段可能仍停在上一轮的值上。
       */
      const touched = new Set(
        round
          .map((entry) => getOperatorStepField(entry.step))
          .filter((field): field is StudioOperatorField => field !== null),
      )
      for (const field of touched) {
        const stillChanged = getOperatorState().entries.some(
          (entry) =>
            isRevertableStepEntry(entry) &&
            entry.kind === 'step' &&
            getOperatorStepField(entry.step) === field,
        )
        if (!stillChanged) clearOperatorChange(field)
      }

      appendOperatorEntry({
        kind: 'system',
        id: nextOperatorEntryId('sys'),
        code: 'revertRound',
        count: round.length,
      })
    },
    [applyContext],
  )

  /**
   * ⚠ 从 `operatorState` 现算而不是从 `getOperatorState()`：这个数印在按钮上，
   * 要跟着渲染走。（`revertRound` 里读的是「此刻」，那是事件处理器，两者不同。）
   */
  const countRoundChanges = useCallback(
    (runKey: string) =>
      operatorState.entries.filter(
        (entry) =>
          entry.kind === 'step' &&
          entry.runKey === runKey &&
          isRevertableStepEntry(entry),
      ).length,
    [operatorState.entries],
  )

  const changeCount = STUDIO_OPERATOR_FIELDS.filter(
    (field) => operatorState.changes[field] !== undefined,
  ).length

  return {
    undoStep,
    revertField,
    revertAll,
    revertRound,
    countRoundChanges,
    changeCount,
  }
}
