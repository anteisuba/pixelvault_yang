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
 * ⚠ 导出（S9）走 `useEditDeskRender`：建计划 → 入队 → 顶栏进度 → 完成落卡 / 下载。
 * ⛔ 一句话排片仍然只画栏（S10）。
 *
 * ── 为什么整块 portal 到 body ────────────────────────────────────────────
 * 全屏模式必须盖住**画布外壳的全部** —— 包括右侧助手那条窄条。而外壳的舞台
 * (`CanvasWorkspaceLayout` 的 `.stage`) 带 `isolate`，把里面的 z 全封在自己那一层，
 * 助手是舞台的**兄弟**，所以在舞台内部无论把 z 调多高都盖不住它（S8 遗留）。
 *
 * ⚠ portal 之后 z 只能取 `z-canvas-workspace`(45)，**不能**取更高的档：shadcn 的
 * Dialog / Popover 也 portal 到 body 且是 `z-50`，desk 一旦压过 50，自己的导出
 * 对话框就被自己盖住了（真机上就这么栽过一次）。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  EDIT_PANEL_IDS,
  EDIT_TRACK_IDS,
  type EditExportRangeId,
  type EditPanelId,
  type EditResolution,
  type EditToolId,
} from '@/constants/edit-desk'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import { NODE_SLOT_IDS } from '@/constants/node-slots'
import { clipIndexAt, RenderPlanError } from '@/lib/edit-project'
import { useEditDesk } from '@/hooks/node/use-edit-desk'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type { NodeWorkflowStateV4 } from '@/types/node-workflow'
import type { NodeV4MediaPatch } from '../nodes/v4/NodeV4Context'

import { NodePromptBar } from '../nodes/v4/chrome/NodePromptBar'
import { EditDeskAssetRail } from './EditDeskAssetRail'
import { EditDeskExportDialog } from './EditDeskExportDialog'
import { EditDeskInspector } from './EditDeskInspector'
import { EditDeskPreview } from './EditDeskPreview'
import { EditDeskRenderBar, EditDeskResumeBar } from './EditDeskRenderBar'
import { EditDeskTimeline } from './EditDeskTimeline'
import { EditDeskTopBar } from './EditDeskTopBar'
import { useEditDeskRender } from './use-edit-desk-render'

export interface EditDeskProps {
  readonly state: NodeWorkflowStateV4
  /** 成片落在哪个项目下（R2 key 的第一段 + 「上次导出」的存储键）。 */
  readonly projectId: string
  dispatchBatch(ops: readonly NodeAssistantOpV4[]): { readonly applied: number }
  mintId(prefix: string): string
  /**
   * 「导出到画布」要用的三个图动作（S9）。
   *
   * ⚠ 落一张**带 url 的**成片卡，op 表里没有一条能干这件事 —— `add_node` 不收
   * 地址（那是「让模型编地址」那条纪律的另一面），所以回填走 `setMedia`，与生成
   * 回填同一条路（不进撤销栈）。⛔ 别为渲染新造一条能写 url 的 op。
   */
  addNode(
    kind: 'video',
    subtype: 'shot',
    options?: { readonly name?: string },
  ): string | null
  setMedia(nodeId: string, patch: NodeV4MediaPatch): void
  connect(source: string, target: string, slot: 'reference'): boolean
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
  projectId,
  dispatchBatch,
  mintId,
  addNode,
  setMedia,
  connect,
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

  /**
   * 完成 → 画布上落一张成片卡，并把每个来源段连回去。
   *
   * ⚠ 连的是 `video.shot` 的 `reference` 槽 —— **端口表上唯一收视频的口**
   * （`NODE_V4_PORTS`）。⛔ 不复活 `video.merge`（S8 已经把它迁成时间线，新建一张
   * 反而会被下一次加载的迁移吃掉）。
   */
  const onRenderLanded = useCallback(
    (
      job: {
        readonly name: string
        readonly url?: string
        readonly thumbnailUrl?: string
        readonly generationId?: string
      },
      sourceNodeIds: readonly string[],
    ) => {
      if (!job.url) return
      const nodeId = addNode(
        NODE_MEDIA_KIND_IDS.video,
        NODE_V4_VIDEO_SUBTYPE_IDS.shot,
        { name: job.name },
      )
      if (!nodeId) return
      setMedia(nodeId, {
        url: job.url,
        imageSource: 'generated',
        ...(job.thumbnailUrl ? { videoThumbnailUrl: job.thumbnailUrl } : {}),
        ...(job.generationId ? { generationId: job.generationId } : {}),
      })
      for (const sourceNodeId of sourceNodeIds) {
        connect(sourceNodeId, nodeId, NODE_SLOT_IDS.reference)
      }
      toast.success(t('render.landed', { name: job.name }))
      onExit()
    },
    [addNode, setMedia, connect, onExit, t],
  )

  const render = useEditDeskRender({
    projectId,
    onLanded: onRenderLanded,
    onError: (message) =>
      toast.error(message || t('render.failed'), { duration: 8000 }),
  })

  const { submit: submitRender } = render
  const { exportTimeline } = desk
  const onExport = useCallback(
    (options: {
      readonly range: EditExportRangeId
      readonly toCanvas: boolean
    }) => {
      setExportOpen(false)
      try {
        const plan = exportTimeline({
          range: options.range,
          projectId,
          resolution: desk.project.settings.resolution,
        })
        void submitRender(plan, { toCanvas: options.toCanvas })
      } catch (error) {
        // ⚠ 失败**可见**：建不出计划的三种原因（缺 url / 空区间 / 零时长）各有
        // 一句人话，⛔ 不吞掉再让用户对着一条没动静的进度条等。
        if (error instanceof RenderPlanError) {
          toast.error(t(`render.planError.${error.code}`))
          return
        }
        toast.error(t('render.failed'))
      }
    },
    [
      exportTimeline,
      projectId,
      desk.project.settings.resolution,
      submitRender,
      t,
    ],
  )

  const onDownload = useCallback((url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [])

  const previewRow =
    desk.rows[EDIT_TRACK_IDS.video][
      clipIndexAt(desk.project.tracks[EDIT_TRACK_IDS.video], desk.playheadSec)
    ] ?? null

  const desk__root = (
    <div
      data-testid="edit-desk"
      role="region"
      aria-label={t('title')}
      className="fixed inset-0 z-canvas-workspace flex flex-col bg-node-panel-soft"
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

      {render.job ? (
        <EditDeskRenderBar
          job={render.job}
          onCancel={() => void render.cancel()}
          onClear={render.clear}
          onDownload={onDownload}
        />
      ) : render.resumable ? (
        <EditDeskResumeBar
          job={render.resumable}
          onResume={render.resume}
          onDismiss={render.dismissResumable}
        />
      ) : null}

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

          {/*
            一句话排片（spec §6）**收在时间线块内的最底下**（S9 修 S8 遗留）：
            S8 那一版把它摆成时间线块外的一条、再用负 margin 往上蹭，1440 以下
            会压住 M 轨。本片**只画栏**：提案与幽灵段是 S10。
          */}
          <EditDeskTimeline
            desk={desk}
            onToolTodo={(tool: EditToolId) =>
              toast.info(t('tools.pending', { tool: t(`tools.${tool}`) }))
            }
            footer={
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
            }
          />
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
        submitting={render.submitting}
      />
    </div>
  )

  // ⚠ SSR 时没有 `document` —— 全屏模式只在浏览器里存在，服务端渲染出一块盖住
  // 一切的面反而会闪一下。
  if (typeof document === 'undefined') return desk__root
  return createPortal(desk__root, document.body)
}
