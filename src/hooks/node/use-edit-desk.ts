'use client'

/**
 * 剪辑台的**状态与动作出口**（S8 · spec §6）。
 *
 * ── 与图引擎的分工 ──────────────────────────────────────────────────────
 * 时间线的每一次改动都走 `graph.dispatchBatch` → op 执行器 → `state.edit`。
 * 于是撤销栈**只有一份**（`use-node-graph-v4.ts` 那一份），⌘Z 在剪辑台里和在画布上
 * 是同一个栈、同一条规则；⛔ 这里不另存一份时间线、不另开一个撤销栈。
 *
 * 只有三样东西住在本 hook 的内存里，因为它们是**视图状态**而不是项目内容：
 * 选中的段、播放头、I / O 区间。刷新即归零，与画布的选中同一条纪律。
 *
 * ── 「一批 = 一个撤销条目」怎么落 ────────────────────────────────────────
 * 时间线还不存在时，第一个手势要发两条 op（先 `edit_set_timeline` 播一份带名字的
 * 空表，再落这次的段）。两条在**同一批**里发出去，所以撤销仍然一步回到位。
 * op 执行器**不**替调用方兜这份空表 —— 名字是 i18n 的事，理由写在那边。
 */

import { useCallback, useMemo, useState } from 'react'

import {
  EDIT_TRACKS,
  EDIT_TRACK_IDS,
  type EditAspect,
  type EditExportRangeId,
  type EditResolution,
  type EditTrackId,
} from '@/constants/edit-desk'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import {
  buildClipFromNode,
  buildTimelineRows,
  clipIndexAt,
  clipStartSec,
  createEmptyEditProject,
  defaultTrackFor,
  listEditableAssets,
  projectDurationSec,
  readClipSource,
  splitClipAt,
  toRenderPlan,
  type EditTimelineRow,
  type RenderPlanRange,
} from '@/lib/edit-project'
import type { RenderPlan } from '@/constants/render-video'
import type { TimelineProposal } from '@/types/edit-desk-plan'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type {
  EditClip,
  EditProject,
  NodeV4,
  NodeWorkflowStateV4,
} from '@/types/node-workflow'

export interface UseEditDeskOptions {
  readonly state: NodeWorkflowStateV4
  /** 图引擎的批量出口 —— **唯一**的写入路径。 */
  dispatchBatch(ops: readonly NodeAssistantOpV4[]): { readonly applied: number }
  /** 新段 id 生成器。测试注入可预测值。 */
  mintId(prefix: string): string
  /** 时间线第一次落表时的成片名（i18n 由调用方给）。 */
  readonly defaultTimelineName: string
}

/** 选中的那一段（右栏属性读它）。 */
export interface EditDeskSelection {
  readonly track: EditTrackId
  readonly clipId: string
}

export interface EditDesk {
  /** 渲染用的时间线。⚠ `state.edit` 缺席时是一份**未落库**的空表。 */
  readonly project: EditProject
  /** 这个项目进没进过剪辑台。 */
  readonly exists: boolean
  readonly rows: Readonly<Record<EditTrackId, readonly EditTimelineRow[]>>
  readonly durationSec: number
  /** 能拖进时间线的画布卡（有产物的视频 / 音频）。 */
  readonly assets: readonly NodeV4[]

  readonly selection: EditDeskSelection | null
  select(selection: EditDeskSelection | null): void
  readonly selectedClip: EditClip | null
  readonly selectedRow: EditTimelineRow | null

  readonly playheadSec: number
  setPlayhead(seconds: number): void
  /** I / O 区间（导出「I·O 区间」读它）。`null` = 没标。 */
  readonly inPointSec: number | null
  readonly outPointSec: number | null
  markIn(): void
  markOut(): void

  /* ── 动作（每个都发一批 op）───────────────────────────────────────── */
  /** 把画布上的几张卡追加进对应轨道。返回真的加进去几段。 */
  addClips(nodeIds: readonly string[], track?: EditTrackId): number
  /** 拖投落段：`index` 是插入位（`undefined` = 追加）。 */
  dropNode(nodeId: string, track: EditTrackId, index?: number): boolean
  updateClip(track: EditTrackId, clipId: string, patch: EditClipPatch): boolean
  moveClip(track: EditTrackId, clipId: string, toIndex: number): boolean
  removeClip(track: EditTrackId, clipId: string): boolean
  /** ⌫：删选中的那一段。 */
  removeSelected(): boolean
  /** S：在播放头处切开选中轨的段。 */
  splitAtPlayhead(track?: EditTrackId): boolean
  /** 「上游已更新 → 一点换新」。 */
  refreshClipSource(track: EditTrackId, clipId: string): boolean

  rename(name: string): boolean
  setSettings(patch: {
    readonly aspect?: EditAspect
    readonly resolution?: EditResolution
    readonly magnetic?: boolean
  }): boolean

  /** 落点像素 → 插入下标。磁吸开着时吸到最近的段边界。 */
  insertIndexAt(track: EditTrackId, seconds: number): number

  /* ── 一句话排片的提案态（S10 · spec §6）────────────────────────────── */
  /**
   * 当前提案。`null` = 没有提案（绝大多数时候）。
   *
   * ⚠ 它**不落库**：提案只活在这一次会话里。⛔ 不写进 `state.edit` —— 那等于
   * 「还没采用就已经改了时间线」，撤销键也就找不到回到提案前的那一步。
   */
  readonly proposal: TimelineProposal | null
  /** 提案的三轨（幽灵段读它）。`null` = 没有提案。 */
  readonly proposalRows: Readonly<
    Record<EditTrackId, readonly EditTimelineRow[]>
  > | null
  setProposal(proposal: TimelineProposal | null): void
  /** 「撤销」= 丢掉提案，时间线一个字都没动过。 */
  discardProposal(): void
  /** 「采用」= 整批落表，**一个撤销条目**。 */
  applyProposal(): boolean
  /** 「逐段看」当前看到第几段。`null` = 不在逐段模式。 */
  readonly proposalClipIndex: number | null
  /** 进入逐段模式（从第一段起）。 */
  enterProposalReview(): void
  /** ← → 换段。越界即停在两端（⛔ 不绕回去：绕一圈会让人以为看完了）。 */
  stepProposalReview(delta: number): void
  /** 「采用这段」/「跳过」——都只是记一笔，最后一段决定完才整批落表。 */
  decideProposalClip(accept: boolean): void
  /** 逐段模式里已经点过「采用这段」的那几段。 */
  readonly proposalAcceptedClipIds: readonly string[]

  /**
   * 导出确认 → **渲染计划**（S9）。
   *
   * ⚠ 只**建计划**，不发请求：请求、轮询、落卡是台面那一侧的事（`useEditDeskRender`）。
   * 分开的理由是这份算术要能在纯函数测试里逐条钉住 —— 一个会 `fetch` 的函数做不到。
   * 建不出来（缺 url / 空区间 / 零时长）时**抛** `RenderPlanError`，⛔ 不返回 null：
   * 用户按了导出，什么都不说是最坏的一种结果。
   */
  exportTimeline(options: EditExportOptions): RenderPlan
}

export interface EditExportOptions {
  readonly range: EditExportRangeId
  /** 成片落在哪个项目下（R2 key 的第一段）。 */
  readonly projectId: string
  /** 导出对话框上那颗下拉 —— 覆盖时间线自己的清晰度。 */
  readonly resolution?: EditResolution
}

export interface EditClipPatch {
  readonly in?: number
  readonly out?: number
  readonly speed?: number
  readonly muted?: boolean
  readonly transitionOut?: EditClip['transitionOut']
  readonly gain?: number
  readonly sourceVersionId?: string
}

export function useEditDesk(options: UseEditDeskOptions): EditDesk {
  const { state, dispatchBatch, mintId, defaultTimelineName } = options

  const [selection, setSelection] = useState<EditDeskSelection | null>(null)
  const [playheadSec, setPlayheadSec] = useState(0)
  const [inPointSec, setInPointSec] = useState<number | null>(null)
  const [outPointSec, setOutPointSec] = useState<number | null>(null)
  const [proposal, setProposalState] = useState<TimelineProposal | null>(null)
  const [proposalClipIndex, setProposalClipIndex] = useState<number | null>(
    null,
  )
  const [proposalAccepted, setProposalAccepted] = useState<readonly string[]>(
    [],
  )

  const stored = state.edit
  const project = useMemo(
    () => stored ?? createEmptyEditProject(defaultTimelineName),
    [stored, defaultTimelineName],
  )

  const rows = useMemo(() => {
    const built = {} as Record<EditTrackId, readonly EditTimelineRow[]>
    for (const track of EDIT_TRACKS) {
      built[track] = buildTimelineRows(project.tracks[track], state.nodes)
    }
    return built
  }, [project, state.nodes])

  const durationSec = useMemo(() => projectDurationSec(project), [project])
  const assets = useMemo(() => listEditableAssets(state), [state])

  /**
   * 一批 op 前面要不要先播一份空表。
   *
   * ⚠ 播的是**当前渲染用的那一份**（`project`），不是新建一份：用户可能已经在
   * 一份未落库的空表上改过名字。
   */
  const withEnsure = useCallback(
    (ops: readonly NodeAssistantOpV4[]): NodeAssistantOpV4[] =>
      stored
        ? [...ops]
        : [{ op: NODE_ASSISTANT_OP_V4_IDS.editSetTimeline, project }, ...ops],
    [stored, project],
  )

  const run = useCallback(
    (ops: readonly NodeAssistantOpV4[]): boolean => {
      if (ops.length === 0) return false
      return dispatchBatch(withEnsure(ops)).applied > 0
    },
    [dispatchBatch, withEnsure],
  )

  const setTimeline = useCallback(
    (next: EditProject): boolean =>
      dispatchBatch([
        { op: NODE_ASSISTANT_OP_V4_IDS.editSetTimeline, project: next },
      ]).applied > 0,
    [dispatchBatch],
  )

  const insertIndexAt = useCallback(
    (track: EditTrackId, seconds: number): number => {
      const clips = project.tracks[track]
      if (clips.length === 0) return 0
      const hit = clipIndexAt(clips, seconds)
      if (hit < 0) return clips.length
      if (!project.settings.magnetic) {
        // 磁吸关：落点覆盖哪一段就插在它后面（所见即所得）。
        return hit + 1
      }
      // 磁吸开：吸到最近的**段边界** —— 落在前半段就插它前面。
      const start = clipStartSec(clips, hit)
      const end = clipStartSec(clips, hit + 1)
      return seconds - start < (end - start) / 2 ? hit : hit + 1
    },
    [project],
  )

  const dropNode = useCallback(
    (nodeId: string, track: EditTrackId, index?: number): boolean => {
      const node = state.nodes.find((candidate) => candidate.id === nodeId)
      if (!node) return false
      const clip = buildClipFromNode(node, mintId)
      if (!clip) return false
      return run([
        {
          op: NODE_ASSISTANT_OP_V4_IDS.editAddClip,
          track,
          clip,
          ...(index === undefined ? {} : { index }),
        },
      ])
    },
    [state.nodes, mintId, run],
  )

  const addClips = useCallback(
    (nodeIds: readonly string[], track?: EditTrackId): number => {
      const ops: NodeAssistantOpV4[] = []
      for (const nodeId of nodeIds) {
        const node = state.nodes.find((candidate) => candidate.id === nodeId)
        if (!node) continue
        const target = track ?? defaultTrackFor(node)
        if (!target) continue
        const clip = buildClipFromNode(node, mintId)
        if (!clip) continue
        ops.push({
          op: NODE_ASSISTANT_OP_V4_IDS.editAddClip,
          track: target,
          clip,
        })
      }
      if (ops.length === 0) return 0
      // ⚠ 整批一个撤销条目：「进剪辑台」选了五张卡，撤销就该一次退回五段。
      return run(ops) ? ops.length : 0
    },
    [state.nodes, mintId, run],
  )

  const updateClip = useCallback(
    (track: EditTrackId, clipId: string, patch: EditClipPatch): boolean =>
      run([
        {
          op: NODE_ASSISTANT_OP_V4_IDS.editUpdateClip,
          track,
          clipId,
          patch,
        },
      ]),
    [run],
  )

  const moveClip = useCallback(
    (track: EditTrackId, clipId: string, toIndex: number): boolean =>
      run([
        { op: NODE_ASSISTANT_OP_V4_IDS.editMoveClip, track, clipId, toIndex },
      ]),
    [run],
  )

  const removeClip = useCallback(
    (track: EditTrackId, clipId: string): boolean => {
      const ok = run([
        { op: NODE_ASSISTANT_OP_V4_IDS.editRemoveClip, track, clipId },
      ])
      if (ok && selection?.clipId === clipId) setSelection(null)
      return ok
    },
    [run, selection],
  )

  const removeSelected = useCallback((): boolean => {
    if (!selection) return false
    return removeClip(selection.track, selection.clipId)
  }, [selection, removeClip])

  const splitAtPlayhead = useCallback(
    (
      track: EditTrackId = selection?.track ?? EDIT_TRACK_IDS.video,
    ): boolean => {
      const clips = project.tracks[track]
      const next = splitClipAt(clips, playheadSec, mintId)
      if (!next) return false
      // ⚠ 分割 = 一段变两段，用**整表替换**：拆成 update + add 两条 op 会让撤销
      // 中间出现「一段已经变短、另一半还没出现」的半截状态。
      return setTimeline({
        ...project,
        tracks: { ...project.tracks, [track]: [...next] },
      })
    },
    [selection, project, playheadSec, mintId, setTimeline],
  )

  const refreshClipSource = useCallback(
    (track: EditTrackId, clipId: string): boolean => {
      const clip = project.tracks[track].find((item) => item.id === clipId)
      if (!clip) return false
      const facts = readClipSource(state.nodes, clip)
      if (!facts.stale || !facts.currentVersionId) return false
      return updateClip(track, clipId, {
        sourceVersionId: facts.currentVersionId,
      })
    },
    [project, state.nodes, updateClip],
  )

  const rename = useCallback(
    (name: string): boolean => {
      const trimmed = name.trim()
      if (!trimmed || trimmed === project.name) return false
      return setTimeline({ ...project, name: trimmed })
    },
    [project, setTimeline],
  )

  const setSettings = useCallback(
    (patch: {
      readonly aspect?: EditAspect
      readonly resolution?: EditResolution
      readonly magnetic?: boolean
    }): boolean =>
      setTimeline({
        ...project,
        settings: { ...project.settings, ...patch },
      }),
    [project, setTimeline],
  )

  /* ── 提案态（S10）─────────────────────────────────────────────────── */

  const proposalRows = useMemo(() => {
    if (!proposal) return null
    const built = {} as Record<EditTrackId, readonly EditTimelineRow[]>
    for (const track of EDIT_TRACKS) {
      built[track] = buildTimelineRows(
        proposal.project.tracks[track],
        state.nodes,
      )
    }
    return built
  }, [proposal, state.nodes])

  const setProposal = useCallback((next: TimelineProposal | null) => {
    setProposalState(next)
    // ⚠ 新提案一律从「整份看」起步，旧的逐段进度清零：留着上一份的下标会让
    //   「采用这段」落到另一份提案的段上。
    setProposalClipIndex(null)
    setProposalAccepted([])
  }, [])

  const discardProposal = useCallback(() => {
    setProposal(null)
  }, [setProposal])

  const applyProposal = useCallback((): boolean => {
    if (!proposal) return false
    const ok = setTimeline(proposal.project)
    if (ok) setProposal(null)
    return ok
  }, [proposal, setTimeline, setProposal])

  const enterProposalReview = useCallback(() => {
    if (!proposal) return
    setProposalClipIndex(0)
    setProposalAccepted([])
  }, [proposal])

  const stepProposalReview = useCallback(
    (delta: number) => {
      if (!proposal) return
      const last = proposal.rationale.length - 1
      setProposalClipIndex((current) =>
        current === null ? 0 : Math.max(0, Math.min(last, current + delta)),
      )
    },
    [proposal],
  )

  /**
   * 「采用这段」/「跳过」。
   *
   * ⚠ **最后一段决定完才落表**，而且是**一批**：逐段各发一条 op 的版本会让
   * ⌘Z 变成「一段一段往回退」，而用户心里那一步是「回到提案之前」。
   */
  const decideProposalClip = useCallback(
    (accept: boolean) => {
      if (!proposal || proposalClipIndex === null) return
      const entry = proposal.rationale[proposalClipIndex]
      if (!entry) return
      const accepted = accept
        ? [...proposalAccepted, entry.clipId]
        : proposalAccepted
      if (proposalClipIndex < proposal.rationale.length - 1) {
        setProposalAccepted(accepted)
        setProposalClipIndex(proposalClipIndex + 1)
        return
      }
      // 最后一段：一段都没采用就等于撤销（⛔ 不落一条空时间线）。
      if (accepted.length === 0) {
        setProposal(null)
        return
      }
      const keep = new Set(accepted)
      const video = proposal.project.tracks.video.filter((clip) =>
        keep.has(clip.id),
      )
      const ok = setTimeline({
        ...proposal.project,
        tracks: { ...proposal.project.tracks, video },
      })
      if (ok) setProposal(null)
    },
    [proposal, proposalClipIndex, proposalAccepted, setTimeline, setProposal],
  )

  const exportTimeline = useCallback(
    (options: EditExportOptions): RenderPlan => {
      const range: RenderPlanRange = {
        range: options.range,
        inPointSec,
        outPointSec,
        clipId: selection?.clipId ?? null,
        ...(selection ? { track: selection.track } : {}),
      }
      return toRenderPlan(project, state.nodes, range, {
        projectId: options.projectId,
        ...(options.resolution ? { resolution: options.resolution } : {}),
      })
    },
    [project, state.nodes, inPointSec, outPointSec, selection],
  )

  const selectedClip = useMemo(() => {
    if (!selection) return null
    return (
      project.tracks[selection.track].find(
        (clip) => clip.id === selection.clipId,
      ) ?? null
    )
  }, [selection, project])

  const selectedRow = useMemo(() => {
    if (!selection) return null
    return (
      rows[selection.track].find((row) => row.clip.id === selection.clipId) ??
      null
    )
  }, [selection, rows])

  const setPlayhead = useCallback(
    (seconds: number) => {
      setPlayheadSec(Math.max(0, Math.min(seconds, durationSec)))
    },
    [durationSec],
  )

  const markIn = useCallback(() => {
    setInPointSec(playheadSec)
    // 入点越过出点时把出点让开 —— ⛔ 不留一个反的区间。
    setOutPointSec((current) =>
      current !== null && current <= playheadSec ? null : current,
    )
  }, [playheadSec])

  const markOut = useCallback(() => {
    setOutPointSec(playheadSec)
    setInPointSec((current) =>
      current !== null && current >= playheadSec ? null : current,
    )
  }, [playheadSec])

  return {
    project,
    exists: Boolean(stored),
    rows,
    durationSec,
    assets,
    selection,
    select: setSelection,
    selectedClip,
    selectedRow,
    playheadSec,
    setPlayhead,
    inPointSec,
    outPointSec,
    markIn,
    markOut,
    addClips,
    dropNode,
    updateClip,
    moveClip,
    removeClip,
    removeSelected,
    splitAtPlayhead,
    refreshClipSource,
    rename,
    setSettings,
    insertIndexAt,
    exportTimeline,
    proposal,
    proposalRows,
    setProposal,
    discardProposal,
    applyProposal,
    proposalClipIndex,
    enterProposalReview,
    stepProposalReview,
    decideProposalClip,
    proposalAcceptedClipIds: proposalAccepted,
  }
}
