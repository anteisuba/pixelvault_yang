'use client'

/**
 * v4 吞噬拖拽的**外壳层**（第三期 · 画布）。③d-4 起挂在 `NodeWorkbenchV4` 上，
 * v3 版 `IngestDragLayer.tsx` 同批删除。
 *
 * ── 为什么是**新文件**而不是给 `IngestDragLayer` 加 props ────────────────
 * 两者的差别不在装饰而在**契约**：v3 那层的 context 出口是
 * `beginDrag(source: CastIngestSourceInfo)`（`NodeWorkflowNode` + `CastSectionId`）
 * 外加一整套「快投」状态机；v4 这层出口是 `NodeV4` + 一个 v3 根本没有的东西 ——
 * **落点候选**（`pendingChoice`）。加 props 意味着同一个 provider 同时挂两台引擎、
 * 两套 source 形状，然后每个消费点再判一次自己拿到的是哪一套。那正是 ③d 要拆掉
 * 的双轨。⛔ 所以是新文件，旧文件在 ③d-4 整份删。
 *
 * ── 这一层做三件事，一件不多 ────────────────────────────────────────────
 * ① ghost / 拒绝理由气泡 portal 到 `document.body`（逃出 RF 的缩放视口与
 *    `overflow:hidden` 祖先）；
 * ② **落点选择器**：`choose` 三态里的那一档 —— 把候选槽点亮让用户挑；
 * ③ 把 `beginDrag` 经 context 交给卡片 / 卡匣。
 * 落边本身在引擎里发（`resolveChoice`），⛔ 这里不重复判一次候选合法性。
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'

import type { NodeSlotId } from '@/constants/node-slots'
import type { NodeV4, NodeWorkflowEdgeV4 } from '@/types/node-workflow'
import { cn } from '@/lib/utils'

import {
  useCastIngestEngineV4,
  type BeginV4DragParams,
  type V4IngestDragState,
  type V4IngestPendingChoice,
} from '@/hooks/node/use-cast-ingest-engine-v4'
import type { V4IngestDropPlan } from '@/hooks/node/use-cast-ingest-v4'

interface IngestDragV4ContextValue {
  readonly dragState: V4IngestDragState
  beginDrag(params: BeginV4DragParams): void
  /** 快投模式（S5f B2）。`null` = 不在模式里。 */
  readonly quickThrowSource: NodeV4 | null
  enterQuickThrow(source: NodeV4): void
  exitQuickThrow(): void
  feedQuickThrow(targetId: string): void
}

const IngestDragV4Context = createContext<IngestDragV4ContextValue | null>(null)

/**
 * ⚠ 缺 provider 时**抛错**，不给空默认值 —— 空默认会让拖拽静默失灵，而那是最难
 * 查的一类画布 bug（`useNodeV4Canvas` 同一条论据）。
 */
export function useIngestDragV4(): IngestDragV4ContextValue {
  const value = useContext(IngestDragV4Context)
  if (!value) {
    throw new Error(
      'useIngestDragV4 must be used inside <IngestDragProviderV4>',
    )
  }
  return value
}

export interface IngestDragProviderV4Props {
  readonly nodes: readonly NodeV4[]
  readonly edges: readonly NodeWorkflowEdgeV4[]
  /** 落一条边（槽必给）。 */
  onConnect(sourceId: string, targetId: string, slot: NodeSlotId): void
  readonly capacityBySlot?: Partial<Record<NodeSlotId, number>>
  readonly children: ReactNode
}

export function IngestDragProviderV4({
  nodes,
  edges,
  onConnect,
  capacityBySlot,
  children,
}: IngestDragProviderV4Props) {
  const t = useTranslations('StudioNode.v4')
  const tReasons = useTranslations('StudioNode.v4.connectRejected')

  /**
   * reason id → 一句话。⚠ 引擎不吃 i18n，翻译只住在这一层 —— 两处各翻一次就会
   * 出现「同一条拒绝在卡上和气泡里说法不同」。
   */
  const translateReason = useMemo(
    () => (plan: V4IngestDropPlan) => {
      if (plan.kind !== 'rejected' || !plan.reason) {
        return tReasons('kindNotAllowed')
      }
      return tReasons(plan.reason)
    },
    [tReasons],
  )

  const engine = useCastIngestEngineV4({
    nodes,
    edges,
    onConnect,
    translateReason,
    ...(capacityBySlot ? { capacityBySlot } : {}),
  })

  const {
    cancelChoice,
    quickThrowSource,
    enterQuickThrow,
    exitQuickThrow,
    feedQuickThrow,
  } = engine
  const hasChoice = engine.dragState.pendingChoice !== null

  // Esc 退出落点选择。⚠ 与画布的 Esc 链是**同一条纪律**（一次一层）：待决的落点
  // 是最上面那一层，所以它先接手。
  useEffect(() => {
    if (!hasChoice) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return
      event.stopPropagation()
      cancelChoice()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [hasChoice, cancelChoice])

  const value = useMemo<IngestDragV4ContextValue>(
    () => ({
      dragState: engine.dragState,
      beginDrag: engine.beginDrag,
      quickThrowSource,
      enterQuickThrow,
      exitQuickThrow,
      feedQuickThrow,
    }),
    [
      engine.dragState,
      engine.beginDrag,
      quickThrowSource,
      enterQuickThrow,
      exitQuickThrow,
      feedQuickThrow,
    ],
  )

  return (
    <IngestDragV4Context.Provider value={value}>
      {children}
      <IngestGhostPortalV4
        dragState={engine.dragState}
        registerGhostElement={engine.registerGhostElement}
      />
      <IngestSlotChooserV4
        choice={engine.dragState.pendingChoice}
        slotLabel={(slot) => t(`slots.${slot}`)}
        cancelLabel={t('ingest.chooseSlotCancel')}
        title={t('ingest.chooseSlot')}
        onPick={engine.resolveChoice}
        onCancel={engine.cancelChoice}
      />
    </IngestDragV4Context.Provider>
  )
}

/**
 * 拖起来的那张卡的浮影 + 咬不动的理由气泡。
 *
 * ⚠ portal 到 `document.body`：ghost 的逐帧位置由引擎**直接写 DOM**
 * （`registerGhostElement` 把节点交出去），React 只在离散跳变时重渲染，
 * ⛔ 不让 60fps 的跟随去和一次 React 重渲染抢帧。
 */
function IngestGhostPortalV4({
  dragState,
  registerGhostElement,
}: {
  readonly dragState: V4IngestDragState
  registerGhostElement(el: HTMLDivElement | null): void
}) {
  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      {dragState.ghost ? (
        <div
          ref={registerGhostElement}
          aria-hidden
          className="pointer-events-none fixed left-0 top-0 z-canvas-drag flex items-center justify-center overflow-hidden rounded-node border bg-card shadow-node-card"
          style={{
            width: dragState.ghost.width,
            height: dragState.ghost.height,
            transform: `translate(${dragState.ghost.originX}px, ${dragState.ghost.originY}px)`,
          }}
        >
          {dragState.ghost.thumbnailUrl ? (
            // 与卡片自身缩略同一条约定：任意 R2 / 三方主机，不是固定资产集。
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={dragState.ghost.thumbnailUrl}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <span className="px-1 text-center text-2xs font-semibold text-card-foreground">
              {dragState.ghost.label}
            </span>
          )}
        </div>
      ) : null}
      {dragState.reason ? (
        <div
          role="status"
          className="pointer-events-none fixed z-canvas-drag -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full border border-node-status-failed/60 bg-card px-3 py-1.5 text-xs font-semibold text-node-status-failed shadow-node-card"
          style={{ left: dragState.reason.x, top: dragState.reason.y - 8 }}
        >
          {dragState.reason.text}
        </div>
      ) : null}
    </>,
    document.body,
  )
}

/**
 * **落点选择器**（v4 新增，v3 没有对应物）。
 *
 * 多个口都收得下时引擎不替用户挑，把候选交到这里点亮。每一格带 `n/m` ——
 * 容量在**落下去之前**就看得见（§3.3「理由必须可见」的同一条：落点也必须可见）。
 * ⛔ 不给一个「默认选中」：预选等于替用户做主，只是把它藏进了一次回车里。
 */
function IngestSlotChooserV4({
  choice,
  slotLabel,
  title,
  cancelLabel,
  onPick,
  onCancel,
}: {
  readonly choice: V4IngestPendingChoice | null
  slotLabel(slot: NodeSlotId): string
  readonly title: string
  readonly cancelLabel: string
  onPick(slot: NodeSlotId): void
  onCancel(): void
}) {
  if (typeof document === 'undefined' || !choice) return null

  return createPortal(
    <div
      role="dialog"
      aria-label={title}
      data-testid="ingest-slot-chooser-v4"
      className="fixed z-canvas-drag flex -translate-x-1/2 -translate-y-full flex-col gap-2 rounded-node border bg-card/90 p-3 shadow-node-card-expanded backdrop-blur-md"
      style={{ left: choice.x, top: choice.y - 12 }}
    >
      <span className="text-2xs font-semibold text-muted-foreground">
        {title}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {choice.candidates.map((candidate) => {
          const full =
            candidate.capacity !== null &&
            candidate.capacity.current >= candidate.capacity.limit
          return (
            <button
              key={candidate.slot}
              type="button"
              onClick={() => onPick(candidate.slot)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium',
                'transition-colors duration-spring-press ease-spring-press hover:bg-accent',
                full ? 'text-node-status-failed' : 'text-card-foreground',
              )}
            >
              <span>{slotLabel(candidate.slot)}</span>
              {candidate.capacity ? (
                <span className="text-2xs text-muted-foreground">
                  {candidate.capacity.current}/{candidate.capacity.limit}
                </span>
              ) : null}
            </button>
          )
        })}
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-2 py-1.5 text-2xs text-muted-foreground hover:text-foreground"
        >
          {cancelLabel}
        </button>
      </div>
    </div>,
    document.body,
  )
}
