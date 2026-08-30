'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { XYPosition } from '@xyflow/react'

import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import {
  NODE_STUDIO_GENERATE_COMPOSER,
  NODE_STUDIO_NODE_PLACEMENT,
} from '@/constants/node-studio'
import { getMaxReferenceImages } from '@/constants/provider-capabilities'
import { DEFAULT_ASPECT_RATIO, type AspectRatio } from '@/constants/config'
import { STUDIO_IMAGE_ASPECT_RATIOS } from '@/constants/studio'
import { useNodeWorkflowActions } from '@/components/business/node/NodeWorkflowActionsContext'
import { useNodeSelection } from '@/hooks/node/use-node-selection'
import { pushComposerHistory } from '@/lib/generate-composer-history'
import {
  resolveNodeDisplayName,
  toNodeDisplayLabel,
} from '@/lib/node-display-name'
import { resolveGenerateTargetKind } from '@/lib/node-workflow-graph'
import type { GenerationRecord } from '@/types'
import type {
  NodeWorkflowModelSelection,
  NodeWorkflowNode,
} from '@/types/node-workflow'

/** The two modes this round wires — video stays on 组装台, text has no home
 *  (canvas-generate-composer.md §3). */
export type GenerateComposerMode = 'image' | 'audio'

/** §4/《画布修法》02 节刀 1「按物种说话」—— i18n key，不是翻译好的文本，组件
 *  仍要自己调 `t()`（`StudioNode.generateComposer.*`）。
 *
 *  这是 placeholder / aria-label 按 `(mode, hasMedia)` 取值的**唯一闸门**：
 *  旧实现里 `GenerateComposer.tsx` 只读 `hasMedia`（`isEditing ? …editing :
 *  …empty`），从不读 `mode` —— 空音色卡（mode='audio'）落进图片的空态文案
 *  「描述你想生成的画面…」；`MentionInput` 的 `aria-label` 更是硬编码成
 *  `t('placeholderEmpty')`，连 `hasMedia` 都不看。两处调用方现在都读这一个
 *  函数的返回值，杜绝再出现「只读一维」。 */
export type ComposerPlaceholderKey =
  | 'placeholderEmpty'
  | 'placeholderEditing'
  | 'placeholderEmptyAudio'
  | 'placeholderEditingAudio'

export function resolveComposerPlaceholderKey(
  mode: GenerateComposerMode,
  hasMedia: boolean,
): ComposerPlaceholderKey {
  if (mode === 'audio') {
    return hasMedia ? 'placeholderEditingAudio' : 'placeholderEmptyAudio'
  }
  return hasMedia ? 'placeholderEditing' : 'placeholderEmpty'
}

export type ImageResolutionTier =
  (typeof NODE_STUDIO_GENERATE_COMPOSER.imageResolutionTiers)[number]

/** A resolved reference chip in the composer's own slot row — distinct from
 *  `ComposerReferenceToken` (VideoComposer's graph-anchored token): these
 *  slots are plain resolved media (host thumbnail or a library pick), not
 *  wired to an upstream node/edge, so they carry no `edgeId`/`kind` union. */
export interface ComposerReferenceSlot {
  id: string
  url: string
  thumbnailUrl?: string
  label?: string
  /** True only for the pinned host slot — §4 "第一格钉宿主图缩略，不可删". */
  pinned?: boolean
  generationId?: string
}

/** §7 结果落点 depends on which of the two host shapes is selected — see
 *  canvas-generate-composer.md §4. `null` = no eligible single selection
 *  (multi-select, unsupported type, or nothing selected). */
export interface ComposerHost {
  nodeId: string
  mode: GenerateComposerMode
  hasMedia: boolean
  mediaUrl?: string
  mediaLabel?: string
}

interface BlankInvokeState {
  flowPosition: XYPosition
  screenPosition: { x: number; y: number }
  mode: GenerateComposerMode | null
}

/**
 * §7 结果落点 — everything `NodeWorkflowCanvasActions.runGenerateComposer`
 * needs to do the actual graph work. Defined here (not in
 * NodeWorkflowActionsContext) because this hook is the input's one producer;
 * the context/StudioNodeWorkbench import the type, not the other way round.
 *
 * `addNode` / `onConnect` / `onNodesChange` are NOT exposed on the shared
 * canvas context — only `StudioNodeWorkbench` (which owns `useNodeWorkflow`)
 * has them, same as every other graph-mutating capability (spawnReference,
 * extractReference, …) this context already wraps behind a semantic verb
 * instead of the raw primitive. `runGenerateComposer` follows that pattern:
 * one action that creates/fills the target node(s), wires the edge, seeds
 * the generation input, runs it, and reselects — all with data it's handed
 * directly (never re-reading `workflow.nodes` after its own writes, which
 * would race the same-tick stale-closure problem `handleGenerateMediaNode`
 * sidesteps by never needing to).
 */
export interface GenerateComposerSendInput {
  hostNodeId: string | null
  hostHasMedia: boolean
  /** Flow-space position to spawn new node(s) near when there's no host
   *  (blank-canvas invoke) or the host is populated (new sibling). */
  sourcePosition: XYPosition
  prompt: string
  model: NodeWorkflowModelSelection
  aspectRatio: AspectRatio
  imageResolution: ImageResolutionTier
  referenceUrls: string[]
  batchCount: number
}

/** §7.5 宿主推断: selected node → which family, which state. Pure so it's
 *  independently testable without mounting React Flow.
 *
 *  卡片（角色卡 / 背景卡）判据与「只认 image/audio、视频留给组装台」的收窄
 *  现在都经 `resolveGenerateTargetKind`（node-workflow-graph.ts）——与
 *  `node-assistant-op-plan.ts` 的 `generate` op 共用同一处地基，见该函数的
 *  文档注释（《画布修法》02 节刀 1）。 */
export function inferComposerHost(
  node: NodeWorkflowNode | null,
): ComposerHost | null {
  if (!node) return null
  const kind = resolveGenerateTargetKind(node)
  if (
    kind !== NODE_MEDIA_KIND_IDS.image &&
    kind !== NODE_MEDIA_KIND_IDS.audio
  ) {
    return null
  }
  const mediaUrl =
    typeof node.data.mediaUrl === 'string' && node.data.mediaUrl.trim()
      ? node.data.mediaUrl
      : undefined
  // 画布修法 08-A：直接读 node.data.mediaLabel 绕开了机器值守卫，改走共享
  // 解析器（同批 ImageNode/ImageSourceStarter/SeedanceNode 那次台账 B7(b)
  // 修的是同一类问题，这里当时漏了）。
  const mediaLabel = resolveNodeDisplayName(node.data)
  return {
    nodeId: node.id,
    mode: kind,
    hasMedia: Boolean(mediaUrl),
    mediaUrl,
    mediaLabel,
  }
}

/** §7 新卡落原卡右侧 — same grid math `placeDerivedImages` uses for a
 *  multi-output batch (`NODE_STUDIO_NODE_PLACEMENT.derivedImage`), reused
 *  rather than inventing a second offset table. `index` is 0-based among the
 *  new nodes created THIS send (not counting an in-place fill). */
export function computeSpawnPosition(
  source: XYPosition,
  index: number,
): XYPosition {
  const placement = NODE_STUDIO_NODE_PLACEMENT.derivedImage
  const column = index % placement.columns
  const row = Math.floor(index / placement.columns)
  return {
    x: source.x + placement.offsetX + column * placement.columnOffsetX,
    y: source.y + row * placement.rowOffsetY,
  }
}

function createSlotId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `ref-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export interface UseGenerateComposerValue {
  /** 'hidden' when nothing eligible is selected/invoked — the component
   *  renders nothing. 'attached' hangs off `host.nodeId` via NodeToolbar.
   *  'blank' floats at `blankScreen` with no backing node yet. */
  visibility: 'hidden' | 'attached' | 'blank'
  host: ComposerHost | null
  blankScreen: { x: number; y: number } | null
  mode: GenerateComposerMode | null
  chooseBlankMode(mode: GenerateComposerMode): void
  openBlank(flowPosition: XYPosition, screenPosition: XYPosition): void
  closeBlank(): void

  promptDraft: string
  setPromptDraft(value: string): void

  referenceSlots: ComposerReferenceSlot[]
  addReferenceFromAsset(generation: GenerationRecord): void
  removeReferenceSlot(slotId: string): void
  referenceCap: number

  modelSelection: NodeWorkflowModelSelection | undefined
  setModelSelection(model: NodeWorkflowModelSelection): void
  aspectRatio: AspectRatio
  setAspectRatio(value: AspectRatio): void
  aspectOptions: readonly AspectRatio[]
  imageResolution: ImageResolutionTier
  setImageResolution(value: ImageResolutionTier): void
  batchCount: number
  setBatchCount(value: number): void

  canSend: boolean
  disabledReason: 'noModel' | 'noInput' | null
  isSending: boolean
  send(): void
  /**
   * Bumped whenever the prompt input should steal focus — §2「新建节点 →
   * 自动出现并聚焦输入框」and §7's "生成完成后...可以立刻接着改下一版".
   * Deliberately NOT fired on a plain host switch (selecting an existing
   * card should never autofocus — touch-keyboard policy: the soft keyboard
   * only pops on a DIRECT tap into the input). The component watches this
   * counter and calls `focusUnlessTouch`, never a raw `.focus()`.
   */
  focusToken: number
}

/**
 * 生成提示词框的编排层（canvas-generate-composer.md）。画布级共享组件，不属
 * 于任何单一节点族——host 完全由「当前单选节点」推出（§7.5「宿主推断」），
 * 组件本身不持有"我现在挂在哪张卡"的状态。
 *
 * §7「结果落点」的实际图操作（建节点/建边/选中）全部委托给
 * `runGenerateComposer`（StudioNodeWorkbench 实现，见该函数与
 * `GenerateComposerSendInput` 的文档）——这个 hook 只负责收集草稿、拼装输入、
 * 调用它，不直接碰 addNode/onConnect/onNodesChange（那三个不在共享 context
 * 上，只有拥有 `useNodeWorkflow` 的 workbench 自己摸得到）。
 */
export function useGenerateComposer(): UseGenerateComposerValue {
  const {
    runGenerateComposer,
    heavyOverlayOpen,
    transientLayerOpen,
    multiSelectActive,
    canvasNodeDragActive,
    quickEditNodeId,
  } = useNodeWorkflowActions()
  const selection = useNodeSelection()

  const host = useMemo(
    () =>
      selection.mode === 'single' ? inferComposerHost(selection.primary) : null,
    [selection.mode, selection.primary],
  )

  const [blankState, setBlank] = useState<BlankInvokeState | null>(null)
  // A real single-node selection always wins over a stale blank invoke — the
  // user picked an actual card, so the "no host yet" affordance is moot.
  //
  // ⚠ 这里**推导**而不是在 effect 里 setState 清空。原实现是
  // `useEffect(() => { if (host) setBlank(null) }, [host])`，被
  // `react-hooks/set-state-in-effect` 拦下——那条规则是对的：effect 里同步
  // setState 会多触发一轮渲染，而这件事根本不需要状态同步，纯推导就够。
  // 残留的 blankState 不会被读到，下一次 openBlank 直接覆盖它。
  const blank = host ? null : blankState

  const openBlank = useCallback(
    (flowPosition: XYPosition, screenPosition: XYPosition) => {
      setBlank({ flowPosition, screenPosition, mode: null })
    },
    [],
  )
  const closeBlank = useCallback(() => setBlank(null), [])
  const [focusToken, setFocusToken] = useState(0)
  const chooseBlankMode = useCallback((mode: GenerateComposerMode) => {
    setBlank((current) => (current ? { ...current, mode } : current))
    // §2 起手势: picking a mode from the blank picker is the "just started
    // composing" moment — focus the prompt right away.
    setFocusToken((token) => token + 1)
  }, [])

  const mode: GenerateComposerMode | null = host
    ? host.mode
    : (blank?.mode ?? null)

  // §2 多选 / 重叠层让位：与其它 L3 节点局部面板同一套纪律
  // （R3-4 §4.2 rule 3）——heavier 层打开时，这层先收。
  //
  // ⚠ 这里一度**故意不判** `transientLayerOpen`，理由是它当时恒为 true、会让本
  // 组件永远不出现。根因不在它自己：`castDockExpanded` 恒真**不是 bug，是如实
  // 反映现实**（CastDock 的 `collapsed` 默认就是 false，卡匣本来就是展开的），
  // 过期的是**语义**——S5d「卡匣回横匣」把卡匣从 popover-flyout 改回常驻左栏之
  // 后，这个标志还把「常驻面板是展开的」当成「有浮层遮住了输入」。
  //
  // `4a01eb47` 已经把语义修好（`castDockExpanded` → `castDockOverlayOpen`，
  // CastDock 只在浮层族布局上报、panel 恒报 false），所以 `transientLayerOpen`
  // 现在只剩它本该有的含义：**添加菜单开着**。按当初注释里立的约定加回来。
  // ⚠ `canvasNodeDragActive`（2026-07-28 owner「拖拽的时候上下两边的框不应该
  // 打开」）：拖卡时本组件跟着卡跑，既遮住落点又像还能点。拖拽期间收起。
  const suppressedByOverlay =
    heavyOverlayOpen ||
    transientLayerOpen ||
    multiSelectActive ||
    canvasNodeDragActive
  // §0 与「快编」互斥 — 见 NodeWorkflowActionsContext.quickEditNodeId 的文档。
  const suppressedByQuickEdit = Boolean(
    host && quickEditNodeId && quickEditNodeId === host.nodeId,
  )

  const visibility: UseGenerateComposerValue['visibility'] = suppressedByOverlay
    ? 'hidden'
    : host && !suppressedByQuickEdit
      ? 'attached'
      : !host && blank
        ? 'blank'
        : 'hidden'

  // ---- Draft state, keyed by host so switching cards keeps each draft. ----
  const [draftByHost, setDraftByHost] = useState<Record<string, string>>({})
  const draftKey = host?.nodeId ?? '__blank__'
  const promptDraft = draftByHost[draftKey] ?? ''
  const setPromptDraft = useCallback(
    (value: string) => {
      setDraftByHost((current) => ({ ...current, [draftKey]: value }))
    },
    [draftKey],
  )

  const [refsByHost, setRefsByHost] = useState<
    Record<string, ComposerReferenceSlot[]>
  >({})
  const extraSlots = refsByHost[draftKey] ?? []

  // §7 owner 2026-07-28 defect ②: a send must carry the draft forward, never
  // wipe it — "可以立刻接着改下一版" requires the box to still show this
  // exact text (and reference slots) right after sending, success or not.
  // The tricky part: `draftByHost`/`refsByHost` are keyed by host id, and a
  // send frequently moves the host to a BRAND NEW sibling node (§7's main
  // path — an existing image always spawns a sibling on send; only the
  // empty-card + batchCount=1 path fills in place and keeps the same id).
  // When the host id changes, simply leaving the OLD key's entry untouched
  // isn't enough — the visibly-current key is now the NEW id, which has no
  // entry of its own yet. This ref carries {prompt, refs} forward so the
  // effect below can seed the new host's entry the moment selection lands on
  // it. Guarded to fire at most once per send or the ref sitting there
  // indefinitely (`use-generate-composer.test.ts` never triggers `host` to
  // move) would eventually stamp itself onto an unrelated later host.
  const pendingCarryRef = useRef<{
    prompt: string
    refs: ComposerReferenceSlot[]
  } | null>(null)
  useEffect(() => {
    const carry = pendingCarryRef.current
    if (!host || !carry) return
    pendingCarryRef.current = null
    // Only seed if this host has no draft of its own yet — always true for a
    // freshly minted sibling (never sent from before), and a harmless no-op
    // for the in-place-fill case (its own entry, never cleared, already
    // holds the same text).
    setDraftByHost((current) =>
      current[host.nodeId] !== undefined
        ? current
        : { ...current, [host.nodeId]: carry.prompt },
    )
    setRefsByHost((current) =>
      current[host.nodeId] !== undefined
        ? current
        : { ...current, [host.nodeId]: carry.refs },
    )
  }, [host])

  const addReferenceFromAsset = useCallback(
    (generation: GenerationRecord) => {
      if (!generation.url) return
      setRefsByHost((current) => {
        const existing = current[draftKey] ?? []
        if (existing.some((slot) => slot.url === generation.url)) return current
        const next: ComposerReferenceSlot = {
          id: createSlotId(),
          url: generation.url ?? '',
          thumbnailUrl: generation.thumbnailUrl ?? undefined,
          label: toNodeDisplayLabel(generation.prompt ?? generation.model),
          generationId: generation.id,
        }
        return { ...current, [draftKey]: [...existing, next] }
      })
    },
    [draftKey],
  )
  const removeReferenceSlot = useCallback(
    (slotId: string) => {
      setRefsByHost((current) => ({
        ...current,
        [draftKey]: (current[draftKey] ?? []).filter(
          (slot) => slot.id !== slotId,
        ),
      }))
    },
    [draftKey],
  )

  // Pinned host slot (§4) — derived, never stored: it disappears the instant
  // the host stops having media, and can't be removed by the user.
  const pinnedSlot: ComposerReferenceSlot | null =
    host && host.hasMedia && host.mediaUrl
      ? {
          id: `pinned-${host.nodeId}`,
          url: host.mediaUrl,
          thumbnailUrl: host.mediaUrl,
          label: host.mediaLabel,
          pinned: true,
        }
      : null
  const referenceSlots = pinnedSlot ? [pinnedSlot, ...extraSlots] : extraSlots

  // ---- Params — session-sticky, not reset per host (§5). ----
  const [modelSelection, setModelSelection] = useState<
    NodeWorkflowModelSelection | undefined
  >(undefined)
  const [aspectRatio, setAspectRatio] =
    useState<AspectRatio>(DEFAULT_ASPECT_RATIO)
  const [imageResolution, setImageResolution] =
    useState<ImageResolutionTier>('auto')
  const [batchCount, setBatchCount] = useState<number>(
    NODE_STUDIO_GENERATE_COMPOSER.defaultBatchCount,
  )

  const referenceCap = modelSelection
    ? getMaxReferenceImages(modelSelection.adapterType, modelSelection.modelId)
    : NODE_STUDIO_GENERATE_COMPOSER.extraReferenceFallbackCap

  // ---- Send (§7). ----
  // (§6 2026-07-27 修订: composer 自建的 ExpandedModal 退役，扩大态的
  // expanded/history 状态随之一起收掉——`pushComposerHistory` 在 send() 里
  // 继续写，读端交给重设计后的节点详情页，见 generate-composer-history.ts
  // 文件头。)
  const [isSending, setIsSending] = useState(false)

  const disabledReason: 'noModel' | 'noInput' | null =
    mode === 'audio'
      ? 'noModel' // §8: audio params are a placeholder this round — never sendable.
      : !modelSelection
        ? 'noModel'
        : !promptDraft.trim() && !pinnedSlot
          ? 'noInput'
          : null
  const canSend =
    disabledReason === null && !isSending && Boolean(runGenerateComposer)

  const send = useCallback(() => {
    if (
      !canSend ||
      mode !== 'image' ||
      !modelSelection ||
      !runGenerateComposer
    ) {
      return
    }
    setIsSending(true)
    const sourcePosition = selection.primary?.position ??
      blank?.flowPosition ?? { x: 0, y: 0 }
    const sentPrompt = promptDraft

    // §7 owner 2026-07-28 defect ②: capture what's about to be sent so the
    // carry-forward effect (declared above, next to draftByHost/refsByHost)
    // can seed whichever host ends up selected once this send lands a
    // target — see that effect's doc comment for why a plain "leave the old
    // entry alone" isn't sufficient by itself.
    pendingCarryRef.current = { prompt: sentPrompt, refs: extraSlots }

    void runGenerateComposer({
      hostNodeId: host?.nodeId ?? null,
      hostHasMedia: Boolean(host?.hasMedia),
      sourcePosition,
      prompt: sentPrompt.trim(),
      model: modelSelection,
      aspectRatio,
      imageResolution,
      referenceUrls: referenceSlots.map((slot) => slot.url),
      batchCount,
    }).finally(() => {
      setIsSending(false)
    })

    // §7 "可以立刻接着改下一版" + owner 2026-07-28 defect ②: the draft and
    // reference slots are deliberately NOT reset here anymore — the previous
    // "optimistic reset" cleared them before the send was even known to have
    // succeeded, so a failure (or even a slow success) lost the user's exact
    // words along with it. Selection moves to the new target synchronously
    // inside `runGenerateComposer` (before its own first await); the carry-
    // forward effect above picks that up once React re-renders with it, so
    // the box keeps showing this exact text — ready to tweak, never blank.
    // The PINNED slot (position 0) needs no help here: it's derived straight
    // from `host.mediaUrl`, so it already updates to the new card's image the
    // instant `host` does — only the user's OWN extra slots needed carrying.
    pushComposerHistory(sentPrompt)
    setBlank(null)
    setFocusToken((token) => token + 1)
  }, [
    aspectRatio,
    batchCount,
    blank,
    canSend,
    extraSlots,
    host,
    imageResolution,
    mode,
    modelSelection,
    promptDraft,
    referenceSlots,
    runGenerateComposer,
    selection.primary,
  ])

  return {
    visibility,
    host,
    blankScreen: blank?.screenPosition ?? null,
    mode,
    chooseBlankMode,
    openBlank,
    closeBlank,
    promptDraft,
    setPromptDraft,
    referenceSlots,
    addReferenceFromAsset,
    removeReferenceSlot,
    referenceCap,
    modelSelection,
    setModelSelection,
    aspectRatio,
    setAspectRatio,
    aspectOptions: STUDIO_IMAGE_ASPECT_RATIOS,
    imageResolution,
    setImageResolution,
    batchCount,
    setBatchCount,
    canSend,
    disabledReason,
    isSending,
    send,
    focusToken,
  }
}
