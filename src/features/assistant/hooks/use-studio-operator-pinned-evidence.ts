'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'

import {
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_TOOL_IDS,
} from '@/constants/assistant-operator'
import type { AssistantOperatorRoundSummary } from '@/types/assistant-operator'
import type { StudioOperatorThreadEntry } from '@/types/studio-assistant-operator'
import {
  getOperatorState,
  updateOperatorRoundSummary,
} from '@/hooks/use-studio-operator-store'
import { updateAssistantConversationRoundAPI } from '@/lib/api-client'
import {
  derivePinnedEvidence,
  isEvidencePinned,
  togglePinnedEvidence,
  type StudioOperatorPinPatch,
  type StudioOperatorPinState,
} from '@/lib/studio-operator-pinned-evidence'

/**
 * 面板上**钉住的证据**（v2 §3.2 / §7.2）：时间线卡上的图钉、顶部那条常驻条、× 摘掉、点回原卡。
 * 11-10 从 `StudioOperatorPanel` 原样搬出（拆前端第 4 片），行为不变。
 */

/** 图钉那一下要的那几样（卡上那份调查摘要）。 */
export interface PinSummary {
  conclusion: string
  sourceCount: number
  corroborated: number
  evidenceRefs: string[]
}

export function useStudioOperatorPinnedEvidence({
  entries,
  historyRounds,
  sessionId,
  workspaceKey,
  threadRef,
}: {
  /** 这一屏的时间线条目（在飞那一轮的结论记录也在里面）。 */
  entries: readonly StudioOperatorThreadEntry[]
  /** 载回来那几轮的结论记录。 */
  historyRounds: readonly AssistantOperatorRoundSummary[]
  sessionId: string | null
  workspaceKey: string | null
  threadRef: RefObject<HTMLDivElement | null>
}) {
  /**
   * **还没落进结论记录的那几条钉住**（v2 §3.2 / §7.2，2026-09-12 实测第三组 B）。
   *
   * ⭐ 钉住的真值从此是**结论记录的 `pinnedEvidence` 一列**（走 §7.7 那条 PATCH）
   * —— 实测第 8 步：钉住条刷新一次就没了，而用户钉它正是为了「接下来别让我忘
   * 了这句」。这里剩下的只有**暂存**：一轮还没结账时库里没有那条记录可写，
   * 先留在本地，结账那一帧再合并进去（下面那条 effect）。
   * ⚠ 拿不到证据编号的那几轮（没有会话 id）**永远停在这里** —— 无号可写，
   * ⛔ 不编一个号出来。
   */
  const [localPins, setLocalPins] = useState<readonly StudioOperatorPinState[]>(
    [],
  )

  /**
   * 点面板顶部那条常驻条 → **滚回时间线里那张卡**（§3.2：常驻条只说结论，
   * 来源 / 候选 / 过程都还在卡上）。
   * ⚠ 走 `threadRef` 里的 `data-research-run` 锚点，⛔ 不用全局 `document`
   * 查询：同一屏上可能挂着两台工作台的面板（手机 Sheet + 桌面 aside 过渡期）。
   */
  const jumpToResearch = useCallback(
    (runKey: string) => {
      const target = threadRef.current?.querySelector(
        `[data-research-run="${CSS.escape(runKey)}"]`,
      )
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    },
    [threadRef],
  )

  /**
   * 这段会话到手的**全部结论记录** —— 载回来那几条 + 在飞那一条（§7.2）。
   * ⚠ 在飞那条排在后面：同一个 `roundIndex` 两边都可能有，后给的那份才是最新的
   * （`derivePinnedEvidence` 按号去重、留后者）。
   */
  const rounds = useMemo<readonly AssistantOperatorRoundSummary[]>(
    () => [
      ...historyRounds,
      ...entries.flatMap((entry) =>
        entry.kind === 'roundSummary' ? [entry.summary] : [],
      ),
    ],
    [entries, historyRounds],
  )

  /**
   * 证据编号 → 时间线锚点（常驻条点回原卡靠它）。
   * ⚠ 它**只从这一屏的时间线现算**，⛔ 不入库：`runKey` 是这一次页面加载现造的
   * 串，写进记录里刷新之后指不到任何东西。刷新之后那一条常驻条因此点不回卡
   * ——有意的：历史里本来就没有证据卡（`StudioOperatorHistoryStepSchema` 不留
   * 证据列表），那一句结论由记录自己带着。
   */
  const runKeyByRef = useMemo(() => {
    const map = new Map<string, string>()
    for (const entry of entries) {
      if (entry.kind !== 'step') continue
      const { step } = entry
      if (step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.done) continue
      if (step.tool !== ASSISTANT_OPERATOR_TOOL_IDS.research) continue
      for (const item of step.result?.evidence ?? []) {
        if (item.evidenceRef) map.set(item.evidenceRef, entry.runKey)
      }
    }
    return map
  }, [entries])

  /**
   * 钉住那一列的**乐观回写**（与 `saveRoundSummary` 逐字同一条判据）：先写屏幕
   * 再写库，失败用原值退回去。⛔ 不弹错误对话框 —— 钉一条结论是个小动作。
   */
  const savePinnedEvidence = useCallback(
    (patch: StudioOperatorPinPatch) => {
      if (!workspaceKey) return
      const thread = getOperatorState().localThreadId
      const previous =
        rounds.find((round) => round.roundIndex === patch.roundIndex)
          ?.pinnedEvidence ?? []
      updateOperatorRoundSummary(patch.roundIndex, {
        pinnedEvidence: patch.pinnedEvidence,
      })
      if (!sessionId) return
      void updateAssistantConversationRoundAPI({
        id: sessionId,
        workspaceKey,
        roundIndex: patch.roundIndex,
        pinnedEvidence: patch.pinnedEvidence,
      }).then((result) => {
        if (getOperatorState().localThreadId !== thread) return
        if (!result.success) {
          updateOperatorRoundSummary(patch.roundIndex, {
            pinnedEvidence: previous,
          })
        }
      })
    },
    [sessionId, rounds, workspaceKey],
  )

  /** 已经落进结论记录的那几条钉住（含它在哪一轮）。 */
  const pinnedRecords = useMemo(() => derivePinnedEvidence(rounds), [rounds])

  /**
   * 面板顶部那条常驻条要画的那几条 = 暂存的 + 已落库的。
   * ⚠ 暂存那几条**已经并进记录的就不再画一遍**：并完之后它仍留在 `localPins`
   * 里（⛔ 不在 effect 里 setState），去重靠编号。
   */
  const pinnedItems = useMemo<readonly StudioOperatorPinState[]>(
    () => [
      ...localPins
        .filter((pin) => !isEvidencePinned(rounds, pin.refs))
        .map((pin) => ({
          runKey: pin.runKey,
          conclusion: pin.conclusion,
          sourceCount: pin.sourceCount,
          corroborated: pin.corroborated,
          refs: pin.refs,
        })),
      ...pinnedRecords.map((pinned) => ({
        runKey:
          (pinned.refs[0] ? runKeyByRef.get(pinned.refs[0]) : undefined) ??
          `round:${pinned.roundIndex}`,
        conclusion: pinned.conclusion,
        sourceCount: pinned.sourceCount,
        corroborated: pinned.corroborated,
        refs: pinned.refs,
      })),
    ],
    [localPins, pinnedRecords, rounds, runKeyByRef],
  )

  /** 这张卡（这几条编号）钉住了没有 —— 暂存与记录两处都算。 */
  const isPinned = useCallback(
    (runKey: string, refs: readonly string[]) =>
      localPins.some((pin) => pin.runKey === runKey) ||
      isEvidencePinned(rounds, refs),
    [localPins, rounds],
  )

  /** 一条钉住在「已经并过没有」那张表里的键。 */
  const pinKey = (refs: readonly string[]) => refs.join(' ')
  /**
   * 已经并进记录的那几条暂存 —— ⛔ 不是 state：它只防「同一条并两次」，
   * 重渲染一次不该让它复活。
   */
  const flushedPinsRef = useRef(new Set<string>())

  /**
   * 图钉那一下（§3.2）—— 有结论记录就直接写进它，没有就先暂存。
   */
  const togglePin = useCallback(
    (runKey: string, summary: PinSummary) => {
      const pin: StudioOperatorPinState = {
        runKey,
        refs: summary.evidenceRefs,
        conclusion: summary.conclusion,
        sourceCount: summary.sourceCount,
        corroborated: summary.corroborated,
      }
      if (isPinned(runKey, pin.refs)) {
        setLocalPins((current) =>
          current.filter((item) => item.runKey !== runKey),
        )
        flushedPinsRef.current.delete(pinKey(pin.refs))
        if (pin.refs.length > 0 && isEvidencePinned(rounds, pin.refs)) {
          const patch = togglePinnedEvidence(rounds, pin)
          if (patch) savePinnedEvidence(patch)
        }
        return
      }
      const patch =
        pin.refs.length > 0 ? togglePinnedEvidence(rounds, pin) : null
      if (!patch) {
        setLocalPins((current) => [...current, pin])
        return
      }
      flushedPinsRef.current.add(pinKey(pin.refs))
      savePinnedEvidence(patch)
    },
    [isPinned, rounds, savePinnedEvidence],
  )

  /** × 那一下 —— 常驻条上摘掉一条（暂存的就地删，落库的走 PATCH）。 */
  const unpinEvidence = useCallback(
    (runKey: string) => {
      const item = pinnedItems.find((entry) => entry.runKey === runKey)
      setLocalPins((current) => current.filter((pin) => pin.runKey !== runKey))
      const refs = [...(item?.refs ?? [])]
      if (refs.length === 0 || !item) return
      flushedPinsRef.current.delete(pinKey(refs))
      if (!isEvidencePinned(rounds, refs)) return
      const patch = togglePinnedEvidence(rounds, {
        refs,
        conclusion: item.conclusion,
        sourceCount: item.sourceCount,
        corroborated: item.corroborated,
      })
      if (patch) savePinnedEvidence(patch)
    },
    [pinnedItems, rounds, savePinnedEvidence],
  )

  /**
   * **结账那一帧把暂存的钉住并进记录**（§7.5 ⑤：以卡结束的轮次也结账）。
   *
   * ⚠ 一条一条地并，每并一条就把结果喂给下一条：两条暂存都按同一份 `rounds`
   * 算出来的 patch 会互相顶掉（后写的那份里没有前一条）。
   * ⚠ ⛔ 这里不 setState（`react-hooks/set-state-in-effect`）：并过的那几条留在
   * `localPins` 里由上面那层去重，effect 只负责把它写出去一次。
   */
  useEffect(() => {
    if (rounds.length === 0) return
    let working: readonly AssistantOperatorRoundSummary[] = rounds
    for (const pin of localPins) {
      if (pin.refs.length === 0) continue
      const key = pinKey(pin.refs)
      if (flushedPinsRef.current.has(key)) continue
      if (isEvidencePinned(working, pin.refs)) continue
      flushedPinsRef.current.add(key)
      const patch = togglePinnedEvidence(working, pin)
      if (!patch) continue
      working = working.map((round) =>
        round.roundIndex === patch.roundIndex
          ? { ...round, pinnedEvidence: patch.pinnedEvidence }
          : round,
      )
      savePinnedEvidence(patch)
    }
  }, [localPins, rounds, savePinnedEvidence])

  return { pinnedItems, isPinned, togglePin, unpinEvidence, jumpToResearch }
}
