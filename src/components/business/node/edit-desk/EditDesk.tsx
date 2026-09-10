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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  EDIT_AUDIO_FILTER_IDS,
  EDIT_PANEL_IDS,
  EDIT_TOOL_IDS,
  EDIT_TRACK_IDS,
  type EditAudioFilterId,
  type EditExportRangeId,
  type EditPanelId,
  type EditResolution,
  type EditToolId,
  type EditTrackId,
} from '@/constants/edit-desk'
import { AUDIO_CLIP_SOURCE } from '@/constants/audio-options'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import { NODE_SLOT_IDS } from '@/constants/node-slots'
import { clipIndexAt, currentUrlOf, RenderPlanError } from '@/lib/edit-project'
import {
  requestTimelinePlan,
  subscribeTimelineProposal,
  takeTimelineProposal,
} from '@/lib/timeline-plan-request'
import { useEditDesk } from '@/hooks/node/use-edit-desk'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type { NodeV4Data, NodeWorkflowStateV4 } from '@/types/node-workflow'
import type { NodeV4MediaPatch } from '../nodes/v4/NodeV4Context'

import { NodePromptBar } from '../nodes/v4/chrome/NodePromptBar'
import {
  EditDeskAssetRail,
  type EditDeskLibraryAsset,
} from './EditDeskAssetRail'
import { EditDeskExportDialog } from './EditDeskExportDialog'
import { EditDeskInspector } from './EditDeskInspector'
import { EditDeskPreview } from './EditDeskPreview'
import {
  EditDeskProposalCard,
  EditDeskProposalInspector,
} from './EditDeskProposalCard'
import { EditDeskRenderBar, EditDeskResumeBar } from './EditDeskRenderBar'
import { EditDeskTimeline } from './EditDeskTimeline'
import { EditDeskTopBar } from './EditDeskTopBar'
import { useEditDeskRender } from './use-edit-desk-render'

/**
 * 素材库落卡最多等几帧。⚠ 是**安全带**不是节流：正常路径上两帧就到位了，等不到
 * 说明这一路出了别的问题 —— 与其无声地转下去，不如说一句。
 */
const LIBRARY_LAND_MAX_FRAMES = 30

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
    kind: NodeV4Data['kind'],
    subtype: NodeV4Data['subtype'],
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
  const tPlan = useTranslations('StudioNode.editDesk.plan')
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
  /** 便条投出去了、提案还没回来 —— 栏上那颗按钮该转，⛔ 不让人连点五次。 */
  const [planPending, setPlanPending] = useState(false)
  /** 预览在不在播 —— 空格与播放器那颗钮共用这一份（spec §6「空格播放」）。 */
  const [playing, setPlaying] = useState(false)
  /** 音频页的三档筛（工具条「语音」/「配乐」切它）。 */
  const [audioFilter, setAudioFilter] = useState<EditAudioFilterId>(
    EDIT_AUDIO_FILTER_IDS.all,
  )
  /**
   * 「语音」/「配乐」按下之后点亮的那条轨。
   *
   * ⚠ 它是**指路**不是选中：告诉用户「接下来往这条轨上拖」。落下一段就熄灭 ——
   * ⛔ 不留一条一直亮着的轨，那会被读成「这条轨被选中了」。
   */
  const [highlightTrack, setHighlightTrack] = useState<EditTrackId | null>(null)

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

  /**
   * 排片提案的回程（S10）：dock 收到 `timeline` 帧就往这里投一张便条。
   *
   * ⚠ 与画布那两条便条同一条纪律：**取走即消费**，挂载时先取一次 —— 提案可能在
   * 台面这一帧还没挂好的时候就到了。
   */
  const { setProposal } = desk
  useEffect(() => {
    const consume = () => {
      const proposal = takeTimelineProposal()
      if (!proposal) return
      setPlanPending(false)
      setProposal(proposal)
    }
    consume()
    return subscribeTimelineProposal(consume)
  }, [setProposal])

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
        // 播到片尾按空格 = 从头再放一遍（⛔ 不给一颗按了没反应的键）。
        if (
          !playing &&
          clipIndexAt(desk.project.tracks[EDIT_TRACK_IDS.video], playheadSec) <
            0
        ) {
          setPlayhead(0)
        }
        setPlaying((current) => !current)
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
    playheadSec,
    playing,
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
        // ⚠ 这一版**不是这张卡自己生成的**：它是剪辑台把 N 段接起来的成片，卡上
        // 没有提示词也没有模型。⋯ 菜单那一行只读的「来源」是唯一能回答「这是哪
        // 来的」的地方，所以落卡时就写死（`node-canvas-v2.md` §6「导出」）。
        source: {
          kind: AUDIO_CLIP_SOURCE.render,
          label: t('render.sourceLabel', { name: job.name }),
        },
      })
      for (const sourceNodeId of sourceNodeIds) {
        connect(sourceNodeId, nodeId, NODE_SLOT_IDS.reference)
      }
      toast.success(t('render.landed', { name: job.name }))
      onExit()
    },
    [addNode, setMedia, connect, onExit, t],
  )

  /**
   * 素材库那一格落进轨 —— **先建卡，再回填，最后才落段**（spec §6「片段永远记得
   * 来源节点」）。
   *
   * ⚠ 三步之间**必须隔帧**：`addNode` / `setMedia` 各自闭包着调用时的那份图，同
   * 一帧里连着调，后一条会把前一条写的东西抹掉（2026-09-10 真机实测过：素材库落卡
   * 后节点凭空消失，见 `VideoNodeV4.backfillMedia` 的同一条论据）。所以这里按帧
   * 推进：卡出现了才回填，url 到位了才落段。
   */
  /**
   * 「最新值 ref」——每渲染一次刷一遍（⛔ 不在渲染期直接写 `.current`）。
   *
   * ⚠ 回填与落段必须用**那一帧**的 `setMedia` / `desk`：它们闭包着调用时的那份图，
   * 隔帧之后再拿落段之前那一份写回去，等于把刚建出来的卡抹掉（与
   * `VideoNodeV4.backfillMedia` 同一条实测结论）。
   */
  const latest = useRef({ state, desk, setMedia })
  useEffect(() => {
    latest.current = { state, desk, setMedia }
  })

  const onDropLibraryAsset = useCallback(
    (asset: EditDeskLibraryAsset, track: EditTrackId, index: number) => {
      const nodeId = addNode(asset.kind, asset.subtype, { name: asset.name })
      if (!nodeId) {
        toast.error(t('library.landFailed'))
        return
      }
      setHighlightTrack(null)
      const step = (attempt: number): void => {
        if (attempt > LIBRARY_LAND_MAX_FRAMES) {
          toast.error(t('library.landFailed'))
          return
        }
        const node = latest.current.state.nodes.find(
          (candidate) => candidate.id === nodeId,
        )
        if (!node) {
          requestAnimationFrame(() => step(attempt + 1))
          return
        }
        if (!currentUrlOf(node)) {
          latest.current.setMedia(nodeId, {
            url: asset.url,
            imageSource: 'existing',
            ...(asset.thumbnailUrl
              ? { videoThumbnailUrl: asset.thumbnailUrl }
              : {}),
            // ⋯ 菜单里那一行只读的「来源」—— 与声音库「用这段」同一条规矩。
            source: {
              kind: AUDIO_CLIP_SOURCE.library,
              label: t('library.sourceLabel', { name: asset.name }),
            },
          })
          requestAnimationFrame(() => step(attempt + 1))
          return
        }
        latest.current.desk.dropNode(nodeId, track, index, {
          ...(asset.durationSec ? { durationSec: asset.durationSec } : {}),
        })
      }
      step(0)
    },
    [addNode, t],
  )

  /**
   * 时间线自己答不了的那几颗工具。
   *
   * 「语音」/「配乐」= **切到左栏音频页 + 筛 + 点亮对应轨**（spec §6 工具条）；
   * 「文字」还没有落点（`EditClip` 没有文本段），照实说一句。
   */
  const onTool = useCallback(
    (tool: EditToolId) => {
      if (tool === EDIT_TOOL_IDS.voice || tool === EDIT_TOOL_IDS.music) {
        const voice = tool === EDIT_TOOL_IDS.voice
        setActivePanel(EDIT_PANEL_IDS.audio)
        setAudioFilter(
          voice ? EDIT_AUDIO_FILTER_IDS.voice : EDIT_AUDIO_FILTER_IDS.music,
        )
        setHighlightTrack(
          voice ? EDIT_TRACK_IDS.audio : EDIT_TRACK_IDS.music,
        )
        return
      }
      toast.info(t('tools.pending', { tool: t(`tools.${tool}`) }))
    },
    [t],
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

  /**
   * 一句话排片（S10）：把便条投给助手 dock，产出一份提案回到这条时间线。
   *
   * ⚠ 只**投便条**，⛔ 不在台面上发请求：请求要会话与画布上下文，那两样只有
   * dock 有（`timeline-plan-request.ts` 头注）。
   * ⚠ 提案期间不再受理第二句：两份提案并排摆着没有人读得懂哪份是这一次的。
   */
  const onPlanSubmit = useCallback(() => {
    const prompt = planPrompt.trim()
    if (!prompt || planPending) return
    if (desk.proposal) {
      toast.info(tPlan('alreadyProposed'))
      return
    }
    setPlanPending(true)
    setPlanPrompt('')
    // ⚠ 未落库的那份空表也要带上：成片名住在它里面，不带过去提案会用服务端那个
    //   英文兜底名，用户会看到自己刚改的名字被一次排片改掉（真机上撞见过）。
    requestTimelinePlan({ prompt, project: desk.project })
  }, [planPrompt, planPending, desk.proposal, desk.project, tPlan])

  const onDownload = useCallback((url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [])

  /** 「文字」页读的那一批（画布上的文本卡，只读 —— 见 `EditDeskAssetRail` 头注）。 */
  const textNodes = useMemo(
    () =>
      state.nodes.filter((node) => node.data.kind === NODE_MEDIA_KIND_IDS.text),
    [state.nodes],
  )

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
        onExport={() => {
          // ⚠ 提案还摆在轨道上时导出是**歧义的**：导的是现在这条，还是那份还没
          //   采用的？说清楚而不是悄悄导旧的（spec §6「提案期间导出禁用并提示」）。
          if (desk.proposal) {
            toast.info(tPlan('exportBlocked'))
            return
          }
          setExportOpen(true)
        }}
        exportDisabled={Boolean(desk.proposal)}
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
          onActivePanelChange={(panel) => {
            setActivePanel(panel)
            // 自己去别的页了 = 刚才那条指路已经没意义。
            if (panel !== EDIT_PANEL_IDS.audio) setHighlightTrack(null)
          }}
          assets={desk.assets}
          textNodes={textNodes}
          onAppend={(nodeId) => {
            desk.addClips([nodeId])
            setHighlightTrack(null)
          }}
          audioFilter={audioFilter}
          onAudioFilterChange={setAudioFilter}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 gap-4 p-4">
            <EditDeskPreview
              project={desk.project}
              row={previewRow}
              playheadSec={desk.playheadSec}
              durationSec={desk.durationSec}
              playing={playing}
              onPlayingChange={setPlaying}
              onPlayheadChange={setPlayhead}
            />
            {desk.proposal && desk.proposalClipIndex !== null ? (
              <EditDeskProposalInspector desk={desk} />
            ) : (
              <EditDeskInspector desk={desk} onBackToNode={onBackToNode} />
            )}
          </div>

          {/*
            一句话排片（spec §6）**收在时间线块内的最底下**（S9 修 S8 遗留）：
            S8 那一版把它摆成时间线块外的一条、再用负 margin 往上蹭，1440 以下
            会压住 M 轨。本片**只画栏**：提案与幽灵段是 S10。
          */}
          <EditDeskTimeline
            desk={desk}
            onTool={onTool}
            onDropLibraryAsset={onDropLibraryAsset}
            highlightTrack={highlightTrack}
            overlay={
              desk.proposal ? (
                <EditDeskProposalCard
                  proposal={desk.proposal}
                  reviewing={desk.proposalClipIndex !== null}
                  onAdopt={() => {
                    desk.applyProposal()
                    toast.success(tPlan('adopted'))
                  }}
                  onReview={desk.enterProposalReview}
                  onDiscard={desk.discardProposal}
                />
              ) : undefined
            }
            footer={
              <NodePromptBar
                value={planPrompt}
                onValueChange={setPlanPrompt}
                onSubmit={onPlanSubmit}
                generating={planPending}
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
