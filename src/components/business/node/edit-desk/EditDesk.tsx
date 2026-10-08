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

import {
  EDIT_AUDIO_FILTER_IDS,
  EDIT_PANEL_IDS,
  EDIT_RECEIPT_MOTION,
  EDIT_RETAKE_BAR,
  EDIT_RETAKE_MOTION,
  EDIT_SHORTCUT_SPLIT_CODE,
  EDIT_TRACK_IDS,
  type EditAudioFilterId,
  type EditExportRangeId,
  type EditPanelId,
  type EditResolution,
  type EditTrackId,
} from '@/constants/edit-desk'
import { AUDIO_CLIP_SOURCE } from '@/constants/audio-options'
import { CHIP_POPOVER, DURATION, SPRING } from '@/constants/motion'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import {
  countClipRiders,
  diffEditTimeline,
  findLandedRender,
  findNodeByGenerationId,
} from '@/lib/edit-desk-receipt'
import {
  clipIndexAt,
  currentUrlOf,
  editRowName,
  RenderPlanError,
} from '@/lib/edit-project'
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
import { EditDeskReceipts, type EditDeskReceiptState } from './EditDeskReceipt'
import { EditDeskRenderStatus, EditDeskResumeStatus } from './EditDeskRenderBar'
import { EditDeskRetakeBar } from './EditDeskRetakeBar'
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
    | { readonly kind: 'error' }
    | {
        readonly kind: 'removed'
        readonly before: NodeWorkflowStateV4
        /** 删完那一刻的项目；删完还没换进来之前是 `null`。 */
        readonly after: NodeWorkflowStateV4 | null
      }
  )

/**
 * 「Claude 改了 N 段」只在项目**还停在那批改动之后**时才算数：你自己又改了一笔、或按了
 * ⌘Z，这条回执的「撤销」就对不上了 —— 收起，⛔ 不留一颗会把你的改动一起退掉的按钮。
 */
function isLiveReceipt(
  receipt: DeskReceipt,
  current: NodeWorkflowStateV4,
): boolean {
  if (receipt.kind === 'changes') return receipt.after === current
  if (receipt.kind === 'removed') {
    return receipt.after === null || receipt.after === current
  }
  return true
}

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
    onRetakeLanded: (clipId) =>
      window.requestAnimationFrame(() =>
        flashEditClips([clipId], EDIT_RETAKE_MOTION.landFlashMs),
      ),
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
  /** 预览在不在播 —— 空格与走带行那颗钮共用这一份（spec §6「空格播放」）。 */
  const [playing, setPlaying] = useState(false)
  /** 走带行那颗声音键（预览跟着它静音）。 */
  const [muted, setMuted] = useState(false)
  /** 音频页的三档筛。 */
  const [audioFilter, setAudioFilter] = useState<EditAudioFilterId>(
    EDIT_AUDIO_FILTER_IDS.all,
  )
  /**
   * 正在预览上原地改字的那段字幕（④ A）。⚠ 只在它还叠在画面上时算数：播放头
   * 走开了 / 别处删了它，就当没在改 —— ⛔ 不留一个看不见的编辑态。
   */
  const [editingTextId, setEditingTextId] = useState<string | null>(null)

  /** 舞台底部那一摞回执与提示（样片 Y），新的在前。 */
  const [receipts, setReceipts] = useState<readonly DeskReceipt[]>([])
  /** 落好卡的那一单：顶栏不再挂它（结果由回执说），⛔ 两处说同一件事。 */
  const [landedJobId, setLandedJobId] = useState<string | null>(null)
  /** 你自己导出落下的成片（按 `generationId`）—— 它们换进来时 ⛔ 不说成 Claude 的。 */
  const ownGenerationsRef = useRef(new Set<string>())
  const receiptSeqRef = useRef(0)
  /** 重拍栏量到的高（回执那一摞垫在它上面）。 */
  const [retakeBarHeight, setRetakeBarHeight] = useState(0)
  const shownReceipts = receipts.filter((receipt) =>
    isLiveReceipt(receipt, state),
  )
  /**
   * 压一条新的上去：对不上的旧回执顺手清掉（⛔ 让看不见的那几条占着三条的名额），
   * 超出三条的最旧那条退场。
   */
  const pushReceipt = useCallback(
    (
      make: (seq: number) => DeskReceipt,
      current: NodeWorkflowStateV4 | null,
    ) => {
      receiptSeqRef.current += 1
      const next = make(receiptSeqRef.current)
      setReceipts((list) =>
        [
          next,
          ...(current
            ? list.filter((receipt) => isLiveReceipt(receipt, current))
            : list),
        ].slice(0, EDIT_RECEIPT_MOTION.max),
      )
    },
    [],
  )
  /**
   * 删完那一刻的项目记到「删了…」那条上（撤销只在项目还停在那一刻时算数）：⚠ 删是同步
   * 发出去的，新项目要到下一次渲染才换进来 —— 第一次看到项目变了就记下（React「存前一次
   * 的值」写法）。
   */
  const [seenState, setSeenState] = useState(state)
  if (seenState !== state) {
    setSeenState(state)
    if (receipts.some((item) => item.kind === 'removed' && !item.after)) {
      setReceipts((list) =>
        list.map((item) =>
          item.kind === 'removed' && !item.after
            ? { ...item, after: state }
            : item,
        ),
      )
    }
  }

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

  /**
   * 删掉选中的那一段 + 压一条「删了「名」，带走 N 条台词 · 撤销」（删除键按两次 J 与 ⌫
   * 同一条路）。
   */
  const { removeSelected } = desk
  const removeWithReceipt = useCallback((): boolean => {
    const textClip = desk.selectedTextClip
    const row = desk.selectedRow
    const name = textClip
      ? (textClip.text.split('\n')[0] ?? '')
      : row
        ? editRowName(row)
        : ''
    const riders =
      !textClip && row && desk.selection?.track === EDIT_TRACK_IDS.video
        ? countClipRiders(desk.project, row.clip.id)
        : { lines: 0, captions: 0 }
    const before = state
    if (!removeSelected()) return false
    pushReceipt(
      (seq) => ({
        kind: 'removed',
        name: name || t('inspector.sourceGone'),
        ...riders,
        before,
        after: null,
        seq,
      }),
      before,
    )
    return true
  }, [desk, state, removeSelected, pushReceipt, t])

  /* ── 快捷键 ───────────────────────────────────────────────────────── */
  const {
    markIn,
    markOut,
    splitAtPlayhead,
    setPlayhead,
    retakeClipId,
    closeRetake,
  } = desk
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
        // Esc 梯：先收重拍栏，再收飞出来的素材面板，再回画布。
        if (retakeClipId) {
          closeRetake()
          return
        }
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
        removeWithReceipt()
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
    removeWithReceipt,
    splitAtPlayhead,
    setPlayhead,
    shortcutPreset,
    materialsOpen,
    retakeClipId,
    closeRetake,
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
  const latest = useRef({ state, desk, setMedia, receipts })
  useEffect(() => {
    latest.current = { state, desk, setMedia, receipts }
  })

  /** 剪辑台自己的错：同一摞里的一条「!」。 */
  const pushError = useCallback(
    (message: string) =>
      pushReceipt(
        (seq) => ({ kind: 'error', message, seq }),
        latest.current.state,
      ),
    [pushReceipt],
  )

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
      pushReceipt(
        (seq) => ({
          kind: 'landed',
          by: 'you',
          name: job.name,
          nodeId: null,
          ...(job.generationId ? { generationId: job.generationId } : {}),
          seq,
        }),
        latest.current.state,
      )
    },
    [refreshProject, pushReceipt],
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
    (
      asset: EditDeskLibraryAsset,
      track: EditTrackId,
      index: number,
      startSec: number,
    ) => {
      const nodeId = addNode(asset.kind, asset.subtype, { name: asset.name })
      if (!nodeId) {
        pushError(t('library.landFailed'))
        return
      }
      /** 回填只发一次 —— 发过还没到位就只等，⛔ 不每帧再写一遍（那会把空转计数一直归零）。 */
      let filled = false
      const step = (idle: number): void => {
        if (idle > LIBRARY_LAND_MAX_FRAMES) {
          pushError(t('library.landFailed'))
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
          startSec,
        })
      }
      step(0)
    },
    [addNode, pushError, t],
  )

  /**
   * 时间线自己答不了的那几颗工具。
   *
   * 「语音」/「配乐」= **切到左栏音频页 + 筛 + 点亮对应轨**（spec §6 工具条）；
   * 「文字」= 在播放头处落一段字幕（S8d）。
   */
  const render = useEditDeskRender({
    projectId,
    onCompleted: onRenderCompleted,
    onError: (message) => pushError(message || t('render.failed')),
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
        pushReceipt(
          (seq) => ({
            kind: 'landed',
            by: 'claude',
            name: '',
            nodeId: landed.nodeId,
            seq,
          }),
          change.after,
        )
        return
      }
      if (touch.count === 0) return
      // 同一来源连着改：数字累加在最前面那一条上，撤销退回这一条里的全部。
      const top = latest.current.receipts[0]
      if (top?.kind === 'changes' && top.after === change.before) {
        setReceipts((list) =>
          list.map((receipt) =>
            receipt.seq === top.seq && receipt.kind === 'changes'
              ? {
                  ...receipt,
                  count: receipt.count + touch.count,
                  after: change.after,
                }
              : receipt,
          ),
        )
        return
      }
      // 换了一批：别的「改了 N 段」对不上了（它们的「之后」不是这一批的「之前」）。
      pushReceipt(
        (seq) => ({
          kind: 'changes',
          count: touch.count,
          before: change.before,
          after: change.after,
          seq,
        }),
        change.before,
      )
    })
  }, [subscribeRemoteChange, pushReceipt])

  const dropReceipt = useCallback(
    (seq: number) =>
      setReceipts((list) => list.filter((receipt) => receipt.seq !== seq)),
    [],
  )

  /** 提示里的下划线字：「撤销」退回那一批 /「看看」「回画布看」回画布选中那张成片卡。 */
  const onReceiptAction = (seq: number) => {
    const receipt = shownReceipts.find((item) => item.seq === seq)
    if (receipt?.kind === 'changes' || receipt?.kind === 'removed') {
      if (restoreState) restoreState(receipt.before)
      else onUndo()
      // 同一条原地换字（⛔ 不换 seq：不重播进场）。
      setReceipts((list) =>
        list.map((item) => (item.seq === seq ? { kind: 'undone', seq } : item)),
      )
      return
    }
    if (receipt?.kind !== 'landed') return
    const nodeId =
      receipt.nodeId ??
      (receipt.generationId
        ? findNodeByGenerationId(latest.current.state, receipt.generationId)
        : null)
    dropReceipt(seq)
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
          pushError(t(`render.planError.${error.code}`))
          return
        }
        pushError(t('render.failed'))
      }
    },
    [
      pushError,
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
  const retakeRow = retakeClipId
    ? (videoRows.find((row) => row.clip.id === retakeClipId) ?? null)
    : null
  /** 版本弹层里停在另一版上：大预览左右对比（样片 W）。 */
  const compareRow = desk.compare
    ? (desk.rows[desk.compare.track].find(
        (row) => row.clip.id === desk.compare?.clipId,
      ) ?? null)
    : null
  const compareView =
    compareRow && desk.compare
      ? { row: compareRow, index: desk.compare.index }
      : null
  /** 播放头这一段正在重拍：预览左上角写「第 n 版生成中」。 */
  const previewRetakeTake =
    previewRow && desk.retakes.get(previewRow.clip.id)?.status === 'generating'
      ? (previewRow.source.version?.count ?? 0) + 1
      : null
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
      className="fixed inset-0 z-canvas-workspace flex"
    >
      {/*
        白台面（owner 2026-10-08 下午改方向，跟素材页换皮一致）：白底、中性灰、黑字，只有
        作品有颜色；放画面的那一块是黑的（预览里的黑井），其余都白。
      */}
      <div className="flex min-w-0 flex-1 flex-col bg-background text-foreground">
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

        <div className="flex min-h-0 flex-1">
          {/* 左边一列 = 素材入口；手机只看不剪，不出。 */}
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
              }}
            />
          )}

          {/* 助手开着时舞台与时间线同一根弹簧让位（与图片台布局 A 同一套）。 */}
          <motion.div
            style={{ paddingRight: operatorYield }}
            className="flex min-w-0 flex-1 flex-col"
          >
            {/* 白舞台，放画面的那一块是黑井（预览里画）；预览按高度居中（助手开合时
                  预览不变大小）。 */}
            <section
              data-testid="edit-desk-stage"
              aria-label={t('stage')}
              className="relative flex min-h-0 flex-1 flex-col bg-background p-3.5"
            >
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
                        onAppend={(nodeId) => desk.addClips([nodeId])}
                        onAddCaption={() => desk.addTextAtPlayhead()}
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
                generatingTake={previewRetakeTake}
                neighbors={previewNeighbors}
                playheadSec={desk.playheadSec}
                durationSec={desk.durationSec}
                playing={playing}
                muted={muted}
                onPlayingChange={setPlaying}
                onPlayheadChange={setPlayhead}
                textClips={desk.activeTextClips}
                {...(readOnly
                  ? {}
                  : {
                      compare: compareView,
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
              {/* 就地重拍栏：从选中的段上长出来，贴在走带行上沿（4b · 换皮第二轮 ⑦ C）。 */}
              <AnimatePresence>
                {!readOnly && retakeRow ? (
                  <EditDeskRetakeBar
                    key={retakeRow.clip.id}
                    desk={desk}
                    row={retakeRow}
                    track={EDIT_TRACK_IDS.video}
                    onHeightChange={setRetakeBarHeight}
                  />
                ) : null}
              </AnimatePresence>
              {/* 回执与提示：舞台底部的黑提示叠成一摞（换皮第二轮 ⑧ B）；重拍栏开着时垫在栏上面。 */}
              <EditDeskReceipts
                items={shownReceipts.map((receipt) => ({
                  seq: receipt.seq,
                  receipt,
                }))}
                bottomPx={
                  !readOnly && retakeRow && retakeBarHeight > 0
                    ? EDIT_RETAKE_BAR.bottomPx +
                      retakeBarHeight +
                      EDIT_RECEIPT_MOTION.gapPx
                    : EDIT_RECEIPT_MOTION.bottomPx
                }
                onAction={onReceiptAction}
                onExpire={dropReceipt}
              />
            </section>

            <EditDeskTimeline
              desk={desk}
              readOnly={readOnly}
              playing={playing}
              onPlayingChange={setPlaying}
              muted={muted}
              onMutedChange={setMuted}
              onDropLibraryAsset={onDropLibraryAsset}
              onScrubStart={() => setPlaying(false)}
              props={
                <EditDeskInspector
                  desk={desk}
                  onBackToNode={onBackToNode}
                  onEditText={startEditText}
                  onRemove={removeWithReceipt}
                  {...(readOnly ? {} : { mintId })}
                />
              }
            />
          </motion.div>
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

      {assistant}
    </div>
  )

  // ⚠ SSR 时没有 `document` —— 全屏模式只在浏览器里存在，服务端渲染出一块盖住
  // 一切的面反而会闪一下。
  if (typeof document === 'undefined') return desk__root
  return createPortal(desk__root, document.body)
}
