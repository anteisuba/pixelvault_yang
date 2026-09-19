/**
 * 画布外壳（S7）的**尺寸与词表常量**。
 *
 * 画板 `Chrome{Overview,Project,Panels,Panels2,Add,Assistant}.dc.html` 里的精确值
 * 集中在这里，⛔ 组件里不再散落任意值（Hard Rule 5 / §7 对稿）。
 */

import {
  CANVAS_ADD_INTENT_IDS,
  type CanvasAddIntentId,
} from '@/constants/canvas-add-catalog'
import {
  NODE_MEDIA_KIND_IDS,
  type NodeWorkflowMediaKind,
} from '@/constants/node-types'

/** 左侧图标栏与浮起面板的几何（画板：栏 44 / 面板 264，面板浮在画布上）。 */
export const CANVAS_SHELL_LAYOUT = {
  railWidthPx: 44,
  panelWidthPx: 264,
  /** 图标栏与面板之间的空隙（画板 left:16 → left:68）。 */
  panelGapPx: 8,
  /** 玻璃浮起物到视口边的留白（画板四角统一 16）。 */
  edgeInsetPx: 16,
  /** 玻璃容器圆角（画板 .glass 容器 14 / 胶囊 999）。 */
  glassRadiusPx: 14,
  /** 图标按钮：34 见方、10 圆角（画板 rail / 底栏 / 快捷加节点共用同一颗）。 */
  iconButtonPx: 34,
  iconButtonRadiusPx: 10,
  /** 项目胶囊高（画板 .pill）。 */
  pillHeightPx: 36,
  /** 项目切换弹层宽（画板 .pop width:320）。 */
  projectPopoverWidthPx: 320,
  /** ⌘K 面板宽（画板 .pop width:520）。 */
  palettePopoverWidthPx: 520,
  /** 右键菜单宽（画板 .pop width:200）。 */
  paneMenuWidthPx: 200,
  /** 列表行高：项目 44 / 节点 40（画板 .prow / .nrow）。 */
  projectRowHeightPx: 44,
  nodeRowHeightPx: 40,
  /** 行内缩略：项目 44×30 / 节点 36×26（画板 .pth / .nth）。 */
  projectThumbWidthPx: 44,
  projectThumbHeightPx: 30,
  nodeThumbWidthPx: 36,
  nodeThumbHeightPx: 26,
} as const

/** 左侧四个面板。顺序即图标栏从上到下的顺序。 */
export const CANVAS_SHELL_PANEL_IDS = {
  nodes: 'nodes',
  cards: 'cards',
  library: 'library',
  history: 'history',
} as const
export type CanvasShellPanelId =
  (typeof CANVAS_SHELL_PANEL_IDS)[keyof typeof CANVAS_SHELL_PANEL_IDS]

export const CANVAS_SHELL_PANELS: readonly CanvasShellPanelId[] = [
  CANVAS_SHELL_PANEL_IDS.nodes,
  CANVAS_SHELL_PANEL_IDS.cards,
  CANVAS_SHELL_PANEL_IDS.library,
  CANVAS_SHELL_PANEL_IDS.history,
]

/**
 * 无加号三条加节点路共用的四类**空卡意图**。
 *
 * ⚠ 身份读 `CANVAS_ADD_CATALOG`（`intent.v4` 那颗钉子），⛔ 不在三条路里各推一遍
 * `{kind, subtype}`。
 */
export const CANVAS_SHELL_QUICK_ADD: readonly {
  readonly kind: NodeWorkflowMediaKind
  readonly intentId: CanvasAddIntentId
  /** 键盘直落的字母（S7 §6：T / I / A / V）。 */
  readonly letter: string
}[] = [
  {
    kind: NODE_MEDIA_KIND_IDS.text,
    intentId: CANVAS_ADD_INTENT_IDS.textScript,
    letter: 't',
  },
  {
    kind: NODE_MEDIA_KIND_IDS.image,
    intentId: CANVAS_ADD_INTENT_IDS.imageResult,
    letter: 'i',
  },
  {
    kind: NODE_MEDIA_KIND_IDS.audio,
    intentId: CANVAS_ADD_INTENT_IDS.audioVoice,
    letter: 'a',
  },
  {
    kind: NODE_MEDIA_KIND_IDS.video,
    intentId: CANVAS_ADD_INTENT_IDS.videoShot,
    letter: 'v',
  },
]

/** 素材库面板的类型筛（画板 Panels2：全部 / 图 / 视频 / 音频）。 */
export const CANVAS_SHELL_LIBRARY_FILTER_IDS = {
  all: 'all',
  image: 'image',
  video: 'video',
  audio: 'audio',
} as const
export type CanvasShellLibraryFilter =
  (typeof CANVAS_SHELL_LIBRARY_FILTER_IDS)[keyof typeof CANVAS_SHELL_LIBRARY_FILTER_IDS]

/** 面板列表一次取多少条（素材库 / 历史共用）。 */
export const CANVAS_SHELL_LIST_PAGE_SIZE = 24

/** ⌘K 每组最多列几条 —— 面板不滚过一屏。 */
export const CANVAS_SHELL_PALETTE_MAX_ROWS = 6

/**
 * 面板 → 画布的拖投载荷（MIME 与形状）。
 *
 * ⚠ 与文件拖入**同一个** drop 出口（`useWorkbenchDndV4().onDrop`），差别只在
 * 「媒体已经在 R2 上、不用再传一遍」，⛔ 不另起一条落物路径。
 */
export const CANVAS_SHELL_MEDIA_DRAG_MIME =
  'application/x-pixelvault-canvas-media'

/**
 * 三条加节点路里那颗**上传**接受的文件（S7 §7 owner 追加）。
 *
 * ⚠ 与拖入 / 粘贴同一条落物路径（`useWorkbenchDndV4().dropFiles` 按 MIME 大类
 * 落成图片 / 声音 / 视频卡），⛔ 不另写一套上传。
 */
export const CANVAS_SHELL_UPLOAD_ACCEPT = 'image/*,video/*,audio/*'
