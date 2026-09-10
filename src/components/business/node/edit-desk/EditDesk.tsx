'use client'

/**
 * 剪辑台 · 台面（S8 · spec §6，画板 `EditDesk.dc.html`）。
 *
 * **画布的全屏模式**，不是节点、不是新页：URL 只加 `?mode=edit`，项目 / store /
 * 撤销栈全都是画布那一份。所以本组件是一块盖在画布上的全屏面 —— 画布**留在
 * DOM 里**（只是被盖住），退出时视口与选择原样还在，⛔ 不卸载重挂。
 *
 * ── 键盘（spec §6）─────────────────────────────────────────────────────
 * 空格播放 · S 分割 · ⌫ 删段 · I / O 入出点 · ⌘Z 撤销 · Esc 回画布。
 * ⚠ 在输入框里打字时全部让开（成片名、一句话排片栏都是输入框）。
 *
 * ⛔ 这里不发一条渲染请求：导出与一句话排片各自给一句「在路上」（S9 / S10）。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  EDIT_DESK_LAYOUT,
  EDIT_PANEL_IDS,
  EDIT_TRACK_IDS,
  type EditExportRangeId,
  type EditPanelId,
  type EditResolution,
  type EditToolId,
} from '@/constants/edit-desk'
import { clipIndexAt } from '@/lib/edit-project'
import { useEditDesk } from '@/hooks/node/use-edit-desk'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type { NodeWorkflowStateV4 } from '@/types/node-workflow'

import { NodePromptBar } from '../nodes/v4/chrome/NodePromptBar'
import { EditDeskAssetRail } from './EditDeskAssetRail'
import { EditDeskExportDialog } from './EditDeskExportDialog'
import { EditDeskInspector } from './EditDeskInspector'
import { EditDeskPreview } from './EditDeskPreview'
import { EditDeskTimeline } from './EditDeskTimeline'
import { EditDeskTopBar } from './EditDeskTopBar'

export interface EditDeskProps {
  readonly state: NodeWorkflowStateV4
  dispatchBatch(ops: readonly NodeAssistantOpV4[]): { readonly applied: number }
  mintId(prefix: string): string
  readonly canUndo: boolean
  onUndo(): void
  /** 退出全屏模式（删 `?mode=edit`）。 */
  onExit(): void
  /** 「回节点重生成这段」：退出 + 选中那张卡。 */
  onBackToNode(nodeId: string): void
  /**
   * 进模式时要**先追加进 V 轨**的那几张卡。
   *
   * 「多选视频卡 → 进剪辑台」与视频卡 ⋯「加入剪辑台」两条路都落在这里：调用方
   * 把选中的 id 一起交过来，台面开起来就已经有段了。⛔ 不做成一个从外面调进来的
   * 命令式句柄 —— 那要求外壳持有台面的实例，而台面只在模式开着时存在。
   */
  readonly initialNodeIds?: readonly string[]
  /** 上面那批已经落进去了，调用方该把它清空（⛔ 不然每次重渲染都再加一遍）。 */
  onInitialConsumed?(): void
}

export function EditDesk({
  state,
  dispatchBatch,
  mintId,
  canUndo,
  onUndo,
  onExit,
  onBackToNode,
  initialNodeIds,
  onInitialConsumed,
}: EditDeskProps) {
  const t = useTranslations('StudioNode.editDesk')
  const desk = useEditDesk({
    state,
    dispatchBatch,
    mintId,
    defaultTimelineName: t('untitled'),
  })

  const [activePanel, setActivePanel] = useState<EditPanelId>(
    EDIT_PANEL_IDS.canvas,
  )
  const [exportOpen, setExportOpen] = useState(false)
  const [planPrompt, setPlanPrompt] = useState('')

  /**
   * 进模式时把「进剪辑台」带来的那几张卡追加进去 —— **只落一次**。
   *
   * ⚠ 守卫是 ref 不是依赖数组：`addClips` 每落一次段就换一个身份（它读的是
   * 当前时间线），只靠依赖数组的话这个 effect 会在自己造成的重渲染里再跑一遍，
   * 一路加到轨道上限。⛔ 也不能只靠调用方清空 seed —— 那是**它**的纪律，不是
   * 本组件的安全带。
   */
  const seedConsumedRef = useRef(false)
  const { addClips } = desk
  useEffect(() => {
    if (seedConsumedRef.current) return
    if (!initialNodeIds || initialNodeIds.length === 0) return
    seedConsumedRef.current = true
    addClips(initialNodeIds)
    onInitialConsumed?.()
  }, [initialNodeIds, addClips, onInitialConsumed])

  /* ── 快捷键 ───────────────────────────────────────────────────────── */
  const { markIn, markOut, removeSelected, splitAtPlayhead, setPlayhead } = desk
  const playheadSec = desk.playheadSec
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      // 打字时全部让开 —— 空格与 S 在输入框里是字，不是命令。
      if (
        target?.isContentEditable ||
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT'
      ) {
        if (event.key === 'Escape') target.blur()
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        onExit()
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        onUndo()
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return

      if (event.code === 'Space') {
        event.preventDefault()
        // 「播放」在本片 = 把播放头挪到下一段的段首（预览只播当前段，S9 接真播放）。
        const clips = desk.project.tracks[EDIT_TRACK_IDS.video]
        const index = clipIndexAt(clips, playheadSec)
        const next = desk.rows[EDIT_TRACK_IDS.video][index + 1]
        setPlayhead(next ? next.startSec : 0)
        return
      }
      const key = event.key.toLowerCase()
      if (key === 's') {
        event.preventDefault()
        splitAtPlayhead()
        return
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        removeSelected()
        return
      }
      if (key === 'i') {
        event.preventDefault()
        markIn()
        return
      }
      if (key === 'o') {
        event.preventDefault()
        markOut()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    desk.project,
    desk.rows,
    playheadSec,
    markIn,
    markOut,
    removeSelected,
    splitAtPlayhead,
    setPlayhead,
    onExit,
    onUndo,
  ])

  const onExport = useCallback(
    (options: {
      readonly range: EditExportRangeId
      readonly toCanvas: boolean
    }) => {
      setExportOpen(false)
      // ⛔ 不发请求：渲染层是 S9。说清楚而不是给一颗按了没反应的键。
      toast.info(
        t('exportDialog.pending', {
          range: t(`exportDialog.ranges.${options.range}`),
        }),
      )
    },
    [t],
  )

  const previewRow =
    desk.rows[EDIT_TRACK_IDS.video][
      clipIndexAt(desk.project.tracks[EDIT_TRACK_IDS.video], desk.playheadSec)
    ] ?? null

  return (
    <div
      data-testid="edit-desk"
      role="region"
      aria-label={t('title')}
      className="absolute inset-0 z-canvas-chrome flex flex-col bg-node-panel-soft"
    >
      <EditDeskTopBar
        project={desk.project}
        durationSec={desk.durationSec}
        canUndo={canUndo}
        onUndo={onUndo}
        onBack={onExit}
        onRename={desk.rename}
        onExport={() => setExportOpen(true)}
      />

      <div className="flex min-h-0 flex-1">
        <EditDeskAssetRail
          activePanel={activePanel}
          onActivePanelChange={setActivePanel}
          assets={desk.assets}
          onAppend={(nodeId) => desk.addClips([nodeId])}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 gap-4 p-4">
            <EditDeskPreview
              project={desk.project}
              row={previewRow}
              playheadSec={desk.playheadSec}
              durationSec={desk.durationSec}
            />
            <EditDeskInspector desk={desk} onBackToNode={onBackToNode} />
          </div>

          <EditDeskTimeline
            desk={desk}
            onToolTodo={(tool: EditToolId) =>
              toast.info(t('tools.pending', { tool: t(`tools.${tool}`) }))
            }
          />

          {/* 一句话排片（spec §6）。本片**只画栏**：提案与幽灵段是 S10。 */}
          <div
            className="px-3 pb-3"
            style={{ marginTop: -EDIT_DESK_LAYOUT.promptBarHeightPx / 4 }}
          >
            <NodePromptBar
              value={planPrompt}
              onValueChange={setPlanPrompt}
              onSubmit={() => toast.info(t('planPending'))}
              placeholder={t('planPlaceholder')}
              ariaLabel={t('planAria')}
              chips={[
                <span
                  key="model"
                  data-testid="edit-desk-plan-model"
                  className="inline-flex h-6 items-center rounded-md border border-border px-1.5 text-3xs text-muted-foreground"
                >
                  {t('planModel')}
                </span>,
              ]}
            />
          </div>
        </div>
      </div>

      <EditDeskExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        hasInOut={desk.inPointSec !== null || desk.outPointSec !== null}
        hasSelection={Boolean(desk.selection)}
        resolution={desk.project.settings.resolution}
        onResolutionChange={(resolution: EditResolution) =>
          desk.setSettings({ resolution })
        }
        onExport={onExport}
      />
    </div>
  )
}
