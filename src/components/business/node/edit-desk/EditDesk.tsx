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
 * ⚠ 在输入框里打字时全部让开（成片名、字幕内容、一句话排片栏都是输入框）。
 * ⚠ PR / FCP 预设**只加一颗分割键**（⌘K / ⌘B，查 `EDIT_SHORTCUT_SPLIT_CODE`）——
 * 上面那一排是本台自己的键，⛔ 不被预设换掉（spec §6 两条都写着）。
 *
 * ⚠ 导出（S9）走 `useEditDeskRender`：建计划 → 入队 → 顶栏进度 → 完成（成片卡由服务端落，这边拉回）/ 下载。
 *
 * ── 助手（④ 方向 A「舞台」，owner 2026-09-28）──────────────────────────
 * 就是画布那块助手面板（`assistant` 槽），头像留在顶栏最右那一格当开关，面板从右侧
 * 滑入、舞台同一根弹簧让位（`studioOperatorYield`，与图片台布局 A 同一套）。⛔ 没有
 * 底部排片栏：一个助手一个输入框。
 *
 * ── 回执与段闪（④ A 关键切片）──────────────────────────────────────────
 * 外部 Claude 经 MCP 改了时间线 → 舞台正上方一条回执「Claude 改了 N 段 · 撤销」+
 * 改到的段闪一下；成片落卡（Claude 的或你自己的）也只出这一条回执，⛔ 不自动退出
 * 剪辑台。永远只有一条：同一来源连着改累加在同一条上，8 秒没新改动自己收起。
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

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useLocale, useTranslations } from 'next-intl'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { toast } from 'sonner'

import {
  EDIT_AUDIO_FILTER_IDS,
  EDIT_PANEL_IDS,
  EDIT_RECEIPT_MOTION,
  EDIT_SHORTCUT_SPLIT_CODE,
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
import { CHIP_POPOVER, DURATION, SPRING } from '@/constants/motion'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import {
  diffEditTimeline,
  findLandedRender,
  findNodeByGenerationId,
} from '@/lib/edit-desk-receipt'
import { clipIndexAt, currentUrlOf, RenderPlanError } from '@/lib/edit-project'
import { useEditDesk } from '@/hooks/node/use-edit-desk'
import type { NodeWorkflowRemoteChange } from '@/hooks/node/use-node-workflow-store'
import { useEditShortcutPreset } from '@/hooks/node/use-edit-shortcut-preset'
import { useStudioOperatorYield } from '@/hooks/use-studio-operator-yield'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type { NodeV4Data, NodeWorkflowStateV4 } from '@/types/node-workflow'
import type { NodeV4MediaPatch } from '../nodes/v4/NodeV4Context'

import {
  EditDeskAssetPanel,
  EditDeskAssetRail,
  type EditDeskLibraryAsset,
} from './EditDeskAssetRail'
import { EditDeskExportDialog } from './EditDeskExportDialog'
import { EditDeskInspector } from './EditDeskInspector'
import { EditDeskPreview } from './EditDeskPreview'
import { EditDeskReceipt, type EditDeskReceiptState } from './EditDeskReceipt'
import { EditDeskRenderStatus, EditDeskResumeStatus } from './EditDeskRenderBar'
import { EditDeskTimeline } from './EditDeskTimeline'
import { EditDeskTopBar } from './EditDeskTopBar'
import { flashEditClips } from './edit-desk-flash'
import {
  isTerminalRenderStatus,
  useEditDeskRender,
} from './use-edit-desk-render'

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
   * 素材库那一格落进轨时建卡 + 回填（S8c）。
   *
   * ⚠ 落一张**带 url 的**卡，op 表里没有一条能干这件事 —— `add_node` 不收地址（那是
   * 「让模型编地址」那条纪律的另一面），所以回填走 `setMedia`，与生成回填同一条路
   * （不进撤销栈）。⛔ 别为它新造一条能写 url 的 op。
   */
  addNode(
    kind: NodeV4Data['kind'],
    subtype: NodeV4Data['subtype'],
    options?: { readonly name?: string },
  ): string | null
  setMedia(nodeId: string, patch: NodeV4MediaPatch): void
  /**
   * 立刻把服务端那一份拉回来。导出成片由**服务端**落进项目（docs/references/mcp.md
   * §7），完成时调它，卡马上出现在画布上。
   */
  refreshProject(): void
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
  /**
   * **只看不剪**（node-canvas-v2 §7.x，< 768）：时间线不可拖、左工具条与右栏不出，
   * 只留 预览 + 导出进度 + 下载成片。
   *
   * ⚠ 是**不渲染**那些入口，⛔ 不是把它们置灰 —— 手机上剪辑本来就做不了，一排
   * 灰键只会让人反复去点（ui-defaults §7「不支持的能力不渲染」）。
   */
  readonly readOnly?: boolean
  /**
   * 助手面板（④ 方向 A）。调用方把画布那一颗 `StudioOperatorDock` 挂到这里 ——
   * 剪辑台开着时它**只挂在这里**（画布那一格不挂），会话住在模块 store 里，搬家
   * 不丢。⚠ 挂在台面这棵子树里，它的 `fixed` 面板与头像才叠在台面之上。
   */
  readonly assistant?: ReactNode
  /**
   * 外部改动（外部 Claude 经 MCP）换进来时通知台面 —— 回执 + 段闪。返回退订。
   * 缺席 = 台面不出回执（外部改动照样跟上，只是不说）。
   */
  subscribeRemoteChange?(
    listener: (change: NodeWorkflowRemoteChange) => void,
  ): () => void
  /**
   * 回执上的「撤销」：把项目退回这一条回执之前那一份，记成**一条**撤销。
   * ⚠ 一条回执可能累加了好几批外部改动，⛔ 不是连按几次 ⌘Z。
   */
  restoreState?(target: NodeWorkflowStateV4): void
}

/**
 * 台面持有的回执（`EditDeskReceiptState` 之外还带着撤销与「看看」要的东西）。
 * `seq` 换一次 = 换了一条回执（重播进场）；累加数字不换。
 */
type DeskReceipt = EditDeskReceiptState & { readonly seq: number } & (
    | {
        readonly kind: 'changes'
        readonly before: NodeWorkflowStateV4
        readonly after: NodeWorkflowStateV4
      }
    | { readonly kind: 'undone' }
    | {
        readonly kind: 'landed'
        readonly nodeId: string | null
        readonly generationId?: string
      }
  )

export function EditDesk({
  state,
  projectId,
  dispatchBatch,
  mintId,
  addNode,
  setMedia,
  refreshProject,
  canUndo,
  onUndo,
  onExit,
  onBackToNode,
  initialNodeIds,
  onInitialConsumed,
  readOnly = false,
  assistant,
  subscribeRemoteChange,
  restoreState,
}: EditDeskProps) {
  const t = useTranslations('StudioNode.editDesk')
  const locale = useLocale()
  const desk = useEditDesk({
    state,
    dispatchBatch,
    mintId,
    defaultTimelineName: t('untitled'),
    defaultTextBody: t('text.placeholder'),
  })
  const { preset: shortcutPreset, setPreset: setShortcutPreset } =
    useEditShortcutPreset()

  const [activePanel, setActivePanel] = useState<EditPanelId>(
    EDIT_PANEL_IDS.canvas,
  )
  /**
   * 素材面板飞出来了没有（④ 方向 A）：⛔ 默认收着 —— 看 Claude 剪的时候舞台要最大。
   * 点图标飞出，拖完 / 点别处 / Esc 收回。
   */
  const [materialsOpen, setMaterialsOpen] = useState(false)
  const materialsRef = useRef<HTMLDivElement | null>(null)
  const reduceMotion = useReducedMotion()
  const [exportOpen, setExportOpen] = useState(false)
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
   * 正在预览上原地改字的那段字幕（④ A）。⚠ 只在它还叠在画面上时算数：播放头
   * 走开了 / 别处删了它，就当没在改 —— ⛔ 不留一个看不见的编辑态。
   */
  const [editingTextId, setEditingTextId] = useState<string | null>(null)

  const [receipt, setReceipt] = useState<DeskReceipt | null>(null)
  /** 落好卡的那一单：顶栏不再挂它（结果由回执说），⛔ 两处说同一件事。 */
  const [landedJobId, setLandedJobId] = useState<string | null>(null)
  /** 你自己导出落下的成片（按 `generationId`）—— 它们换进来时 ⛔ 不说成 Claude 的。 */
  const ownGenerationsRef = useRef(new Set<string>())
  const [receiptHovered, setReceiptHovered] = useState(false)
  const receiptSeqRef = useRef(0)
  /**
   * 「Claude 改了 N 段」只在项目**还停在那批改动之后**时才算数：你自己又改了一笔、
   * 或按了 ⌘Z，这条回执的「撤销」就对不上了 —— 收起，⛔ 不留一颗会把你的改动一起
   * 退掉的按钮。
   */
  const shownReceipt =
    receipt && (receipt.kind !== 'changes' || receipt.after === state)
      ? receipt
      : null

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

  const editingTextVisibleId =
    editingTextId &&
    desk.activeTextClips.some((clip) => clip.id === editingTextId)
      ? editingTextId
      : null

  /** 原地改字：选中它、停播；播放头不在这段里就先挪进来（行首那颗字也走这里）。 */
  const startEditText = (clipId: string) => {
    const clip = desk.project.tracks.text.find((item) => item.id === clipId)
    if (!clip) return
    desk.selectText(clipId)
    setPlaying(false)
    if (!desk.activeTextClips.some((item) => item.id === clipId)) {
      desk.setPlayhead(clip.startSec)
    }
    setEditingTextId(clipId)
  }

  const endEditText = (clipId: string, text: string | null) => {
    setEditingTextId(null)
    if (text !== null) desk.updateTextClip(clipId, { text })
  }

  /* ── 快捷键 ───────────────────────────────────────────────────────── */
  const { markIn, markOut, removeSelected, splitAtPlayhead, setPlayhead } = desk
  const playheadSec = desk.playheadSec
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // 已经有人接过这一键（弹层 / 对话框的 Esc 由 Radix 在捕获阶段关掉自己并
      // `preventDefault`）—— ⛔ 再冒到这里就是「关个小弹层把整个剪辑台也退了」。
      if (event.defaultPrevented) return
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
        // Esc 梯：先收飞出来的素材面板，再回画布。
        if (materialsOpen) {
          setMaterialsOpen(false)
          return
        }
        onExit()
        return
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        onUndo()
        return
      }
      // 预设的分割键（PR ⌘K / FCP ⌘B）——查表，⛔ 不在这里写死两条分支。
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        event.code === EDIT_SHORTCUT_SPLIT_CODE[shortcutPreset]
      ) {
        event.preventDefault()
        splitAtPlayhead()
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
    shortcutPreset,
    materialsOpen,
    onExit,
    onUndo,
  ])

  /** 点别处收回素材面板（图标列与面板自己除外）。 */
  useEffect(() => {
    if (!materialsOpen) return undefined
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (!target) return
      if (materialsRef.current?.contains(target)) return
      if (target.closest('[data-edit-desk-rail]')) return
      setMaterialsOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () =>
      document.removeEventListener('pointerdown', onPointerDown, true)
  }, [materialsOpen])

  /**
   * 「最新值 ref」——每渲染一次刷一遍（⛔ 不在渲染期直接写 `.current`）。
   *
   * ⚠ 回填 / 落段必须用**那一帧**的 `setMedia` / `desk`：它们闭包着调用时的那份图，
   * 隔帧之后再拿旧的那一份写回去，等于把刚建出来的卡抹掉（与
   * `VideoNodeV4.backfillMedia` 同一条实测结论）。
   */
  const latest = useRef({ state, desk, setMedia })
  useEffect(() => {
    latest.current = { state, desk, setMedia }
  })

  /**
   * 完成 → 成片卡**已经由服务端落进项目了**（docs/references/mcp.md §7），这里只把
   * 最新那一份立刻拉回来，让卡马上出现在画布上。
   *
   * ⛔ 不在浏览器里再建一次卡：两条路会落两张卡。
   */
  const onRenderCompleted = useCallback(
    (job: {
      readonly jobId: string
      readonly name: string
      readonly generationId?: string
    }) => {
      if (job.generationId) ownGenerationsRef.current.add(job.generationId)
      setLandedJobId(job.jobId)
      refreshProject()
      // 只出回执，⛔ 不自动退出剪辑台（owner 2026-09-28）。
      receiptSeqRef.current += 1
      setReceipt({
        kind: 'landed',
        by: 'you',
        name: job.name,
        nodeId: null,
        ...(job.generationId ? { generationId: job.generationId } : {}),
        seq: receiptSeqRef.current,
      })
    },
    [refreshProject],
  )

  /**
   * 素材库那一格落进轨 —— **先建卡，再回填，最后才落段**（spec §6「片段永远记得
   * 来源节点」）。
   *
   * ⚠ 三步之间**必须隔帧**：`addNode` / `setMedia` 各自闭包着调用时的那份图，同
   * 一帧里连着调，后一条会把前一条写的东西抹掉（2026-09-10 真机实测过：素材库落卡
   * 后节点凭空消失，见 `VideoNodeV4.backfillMedia` 的同一条论据）。所以这里按帧
   * 推进：卡出现了才回填，url 到位了才落段。
   * ⚠ 安全带数的是**空转的帧**（S8d）：机器忙的时候一次 React 提交可能跨掉好几帧，
   * 按总帧数算会在正常路径上误报「没落上」。
   */
  const onDropLibraryAsset = useCallback(
    (asset: EditDeskLibraryAsset, track: EditTrackId, index: number) => {
      const nodeId = addNode(asset.kind, asset.subtype, { name: asset.name })
      if (!nodeId) {
        toast.error(t('library.landFailed'))
        return
      }
      setHighlightTrack(null)
      /** 回填只发一次 —— 发过还没到位就只等，⛔ 不每帧再写一遍（那会把空转计数一直归零）。 */
      let filled = false
      const step = (idle: number): void => {
        if (idle > LIBRARY_LAND_MAX_FRAMES) {
          toast.error(t('library.landFailed'))
          return
        }
        const node = latest.current.state.nodes.find(
          (candidate) => candidate.id === nodeId,
        )
        if (!node) {
          requestAnimationFrame(() => step(idle + 1))
          return
        }
        if (!currentUrlOf(node)) {
          if (filled) {
            requestAnimationFrame(() => step(idle + 1))
            return
          }
          filled = true
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
          // 刚写了东西 = 有进展，空转计数归零。
          requestAnimationFrame(() => step(0))
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
   * 「文字」= 在播放头处落一段字幕（S8d）。
   */
  const onTool = useCallback(
    (tool: EditToolId) => {
      if (tool === EDIT_TOOL_IDS.voice || tool === EDIT_TOOL_IDS.music) {
        const voice = tool === EDIT_TOOL_IDS.voice
        setActivePanel(EDIT_PANEL_IDS.audio)
        setMaterialsOpen(true)
        setAudioFilter(
          voice ? EDIT_AUDIO_FILTER_IDS.voice : EDIT_AUDIO_FILTER_IDS.music,
        )
        setHighlightTrack(voice ? EDIT_TRACK_IDS.audio : EDIT_TRACK_IDS.music)
        return
      }
      if (tool === EDIT_TOOL_IDS.text) {
        // 「文字」= 在播放头处落一段 3s 字幕（spec §6「文字段」）。
        latest.current.desk.addTextAtPlayhead()
        return
      }
      toast.info(t('tools.pending', { tool: t(`tools.${tool}`) }))
    },
    [t],
  )

  const render = useEditDeskRender({
    projectId,
    onCompleted: onRenderCompleted,
    onError: (message) =>
      toast.error(message || t('render.failed'), { duration: 8000 }),
  })

  const { submit: submitRender } = render

  /**
   * 你自己有一单成片**在跑**时，服务端落进来的那张成片卡是你的（服务端先落卡、
   * 再标完成，所以卡可能比「完成」先到）：⛔ 不说成「Claude 导出了成片」。在跑时
   * 还不知道 `generationId`，所以在跑 = 一律算你的；跑完的按 `generationId` 认。
   */
  const ownRenderRef = useRef(render.job)
  useEffect(() => {
    ownRenderRef.current = render.job
  })

  /* ── 回执与段闪（外部改动）─────────────────────────────────────────── */
  useEffect(() => {
    if (!subscribeRemoteChange) return undefined
    return subscribeRemoteChange((change) => {
      const touch = diffEditTimeline(change.before.edit, change.after.edit)
      if (touch.changedIds.length > 0) {
        window.requestAnimationFrame(() => flashEditClips(touch.changedIds))
      }
      if (!change.byClaude) return

      const landed = findLandedRender(change.before, change.after)
      const own = ownRenderRef.current
      const ownInFlight = own !== null && !isTerminalRenderStatus(own.status)
      const ownLanded =
        landed?.generationId !== undefined &&
        ownGenerationsRef.current.has(landed.generationId)
      if (landed && !ownInFlight && !ownLanded) {
        receiptSeqRef.current += 1
        setReceipt({
          kind: 'landed',
          by: 'claude',
          name: '',
          nodeId: landed.nodeId,
          seq: receiptSeqRef.current,
        })
        return
      }
      if (touch.count === 0) return
      setReceipt((current) => {
        // 同一来源连着改：数字累加在同一条上，撤销退回这一条里的全部。
        if (current?.kind === 'changes' && current.after === change.before) {
          return {
            ...current,
            count: current.count + touch.count,
            after: change.after,
          }
        }
        receiptSeqRef.current += 1
        return {
          kind: 'changes',
          count: touch.count,
          before: change.before,
          after: change.after,
          seq: receiptSeqRef.current,
        }
      })
    })
  }, [subscribeRemoteChange])

  /** 8 秒没有新改动自己收起；「已撤销」停 1.4 秒；悬停时不计时。 */
  useEffect(() => {
    if (!receipt || receiptHovered) return undefined
    const timer = window.setTimeout(
      () => setReceipt(null),
      receipt.kind === 'undone'
        ? EDIT_RECEIPT_MOTION.undoneMs
        : EDIT_RECEIPT_MOTION.idleMs,
    )
    return () => window.clearTimeout(timer)
  }, [receipt, receiptHovered])

  const undoReceipt = () => {
    if (shownReceipt?.kind !== 'changes') return
    if (restoreState) restoreState(shownReceipt.before)
    else onUndo()
    // 同一条回执原地换字（⛔ 不换 seq：不重播进场）。
    setReceipt({ kind: 'undone', seq: shownReceipt.seq })
  }

  /** 「看看」/「回画布看」：回画布并选中那张成片卡（找不到就只回画布）。 */
  const lookAtLanded = () => {
    if (shownReceipt?.kind !== 'landed') return
    const nodeId =
      shownReceipt.nodeId ??
      (shownReceipt.generationId
        ? findNodeByGenerationId(
            latest.current.state,
            shownReceipt.generationId,
          )
        : null)
    setReceipt(null)
    if (nodeId) onBackToNode(nodeId)
    else onExit()
  }
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
        void submitRender(plan, { toCanvas: options.toCanvas, locale })
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
      locale,
      t,
    ],
  )

  const onDownload = useCallback((url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [])

  /** 「文字」页读的那一批（画布上的文本卡，只读 —— 见 `EditDeskAssetRail` 头注）。 */
  const textNodes = useMemo(
    () =>
      state.nodes.filter((node) => node.data.kind === NODE_MEDIA_KIND_IDS.text),
    [state.nodes],
  )

  /**
   * 助手面板占掉的右侧宽度（Dock 按弹簧驱动；没开 / 手机 = 0）。绑在台面主体的右内
   * 边距上，舞台与时间线跟面板一起让位。⚠ 恒绑同一个 motion 值（⛔ 别换成静态值：
   * motion 的 style 从 motion 值换成静态值时不解绑，见 `StudioWorkspaceUI` 同一条）。
   */
  const operatorYield = useStudioOperatorYield()

  const previewIndex = clipIndexAt(
    desk.project.tracks[EDIT_TRACK_IDS.video],
    desk.playheadSec,
  )
  const videoRows = desk.rows[EDIT_TRACK_IDS.video]
  const previewRow = videoRows[previewIndex] ?? null
  const previewNeighbors = useMemo(
    () =>
      previewIndex < 0
        ? []
        : [videoRows[previewIndex - 1], videoRows[previewIndex + 1]].filter(
            (candidate): candidate is (typeof videoRows)[number] =>
              candidate !== undefined,
          ),
    [videoRows, previewIndex],
  )

  const desk__root = (
    <div
      data-testid="edit-desk"
      role="region"
      aria-label={t('title')}
      className="fixed inset-0 z-canvas-workspace flex bg-surface-workbench"
    >
      {/* 左边一列 = 素材入口（工作台左导航的长相）；手机只看不剪，不出。 */}
      {readOnly ? null : (
        <EditDeskAssetRail
          activePanel={activePanel}
          open={materialsOpen}
          onPanelClick={(panel) => {
            // 同一页再点 = 收回；别的页 = 换页并飞出。
            if (materialsOpen && panel === activePanel) {
              setMaterialsOpen(false)
              return
            }
            setActivePanel(panel)
            setMaterialsOpen(true)
            // 自己去别的页了 = 刚才那条指路已经没意义。
            if (panel !== EDIT_PANEL_IDS.audio) setHighlightTrack(null)
          }}
        />
      )}

      {/* 助手开着时整块地台同一根弹簧让位（与图片台布局 A 同一套）。 */}
      <motion.div
        style={{ paddingRight: operatorYield }}
        className="flex min-w-0 flex-1"
      >
        {/* 工作台地台：头部 `h-9` · 舞台白卡 · 时间线白卡（画板「剪辑台 A · 全部状态」）。
            ⚠ 行距 `gap-3` 与头部高度是助手面板落点的依据（`EDIT_DESK_OPERATOR_ANCHOR`）。 */}
        <div className="workbench-ground flex min-h-0 min-w-0 flex-1 flex-col gap-3">
          <EditDeskTopBar
            project={desk.project}
            durationSec={desk.durationSec}
            canUndo={canUndo}
            onUndo={onUndo}
            onBack={onExit}
            onRename={desk.rename}
            onExport={() => setExportOpen(true)}
            reserveAssistantSlot={Boolean(assistant)}
            shortcutPreset={shortcutPreset}
            onShortcutPresetChange={setShortcutPreset}
            status={
              render.job && render.job.jobId !== landedJobId ? (
                <EditDeskRenderStatus
                  job={render.job}
                  onCancel={() => void render.cancel()}
                  onClear={render.clear}
                  onDownload={onDownload}
                />
              ) : render.resumable && !render.job ? (
                <EditDeskResumeStatus
                  job={render.resumable}
                  onResume={render.resume}
                  onDismiss={render.dismissResumable}
                />
              ) : null
            }
          />

          <section
            data-testid="edit-desk-stage"
            aria-label={t('stage')}
            className="workbench-card"
          >
            <EditDeskReceipt
              receipt={shownReceipt}
              receiptKey={String(shownReceipt?.seq ?? 0)}
              onUndo={undoReceipt}
              onDismiss={() => setReceipt(null)}
              onLook={lookAtLanded}
              onHoverChange={setReceiptHovered}
            />
            {/* 素材面板从左列那颗图标处长出来、盖在舞台上：⛔ 不推开舞台，高度只到舞台
                为止（⛔ 不盖时间线 —— 要能往时间线上拖）。拖完就收（`dragend` 冒泡上来）。
                开合沿用工具行弹层那一套：0.72 → 1、由糊变清（`CHIP_POPOVER`）。 */}
            <AnimatePresence>
              {!readOnly && materialsOpen ? (
                <motion.div
                  ref={materialsRef}
                  key="materials"
                  initial={{
                    opacity: 0,
                    scale: CHIP_POPOVER.fromScale,
                    filter: `blur(${CHIP_POPOVER.blurPx}px)`,
                  }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    filter: 'blur(0px)',
                    transition: reduceMotion ? { duration: 0 } : SPRING.slot,
                  }}
                  exit={{
                    opacity: 0,
                    scale: CHIP_POPOVER.fromScale,
                    filter: `blur(${CHIP_POPOVER.blurPx}px)`,
                    transition: {
                      duration: reduceMotion ? 0 : DURATION.base,
                      ease: 'easeIn',
                    },
                  }}
                  className="absolute bottom-3 left-3 top-3 z-30 flex origin-top-left"
                >
                  {/* ⚠ HTML5 的 `dragend` 挂在普通 div 上：motion 元素的 `onDragEnd`
                      是它自己的拖拽手势，接不到素材格的拖投。 */}
                  <div
                    className="flex max-h-full"
                    onDragEnd={() => setMaterialsOpen(false)}
                  >
                    <EditDeskAssetPanel
                      activePanel={activePanel}
                      assets={desk.assets}
                      textNodes={textNodes}
                      onAppend={(nodeId) => {
                        desk.addClips([nodeId])
                        setHighlightTrack(null)
                      }}
                      audioFilter={audioFilter}
                      onAudioFilterChange={setAudioFilter}
                    />
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
            <EditDeskPreview
              project={desk.project}
              row={previewRow}
              neighbors={previewNeighbors}
              playheadSec={desk.playheadSec}
              durationSec={desk.durationSec}
              playing={playing}
              onPlayingChange={setPlaying}
              onPlayheadChange={setPlayhead}
              textClips={desk.activeTextClips}
              {...(readOnly
                ? {}
                : {
                    onOpenMaterials: () => {
                      setActivePanel(EDIT_PANEL_IDS.canvas)
                      setMaterialsOpen(true)
                    },
                    textEditing: {
                      selectedId: desk.selectedTextClip?.id ?? null,
                      editingId: editingTextVisibleId,
                      onSelect: desk.selectText,
                      onStartEdit: startEditText,
                      onEndEdit: endEditText,
                    },
                  })}
            />
          </section>

          {/* 只看不剪：时间线仍然画（要看得见排片），但整块不接手势 ——
              `inert` 连键盘焦点一起挡掉，⛔ 不只是 `pointer-events-none`。 */}
          <div
            {...(readOnly ? { inert: true } : {})}
            data-edit-desk-readonly={readOnly ? 'true' : 'false'}
            className="contents"
          >
            <EditDeskTimeline
              desk={desk}
              readOnly={readOnly}
              onTool={onTool}
              onDropLibraryAsset={onDropLibraryAsset}
              highlightTrack={highlightTrack}
              onScrubStart={() => setPlaying(false)}
              props={
                <EditDeskInspector
                  desk={desk}
                  onBackToNode={onBackToNode}
                  onEditText={startEditText}
                />
              }
            />
          </div>
        </div>
      </motion.div>

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

      {assistant}
    </div>
  )

  // ⚠ SSR 时没有 `document` —— 全屏模式只在浏览器里存在，服务端渲染出一块盖住
  // 一切的面反而会闪一下。
  if (typeof document === 'undefined') return desk__root
  return createPortal(desk__root, document.body)
}
