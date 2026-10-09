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

/** 外壳浮起物的几何（画板：面板 264，浮在画布上）。 */
export const CANVAS_SHELL_LAYOUT = {
  panelWidthPx: 264,
  /** 浮起物与锚点之间的空隙（项目胶囊弹层的 sideOffset）。 */
  panelGapPx: 8,
  /** 玻璃浮起物到视口边的留白（画板四角统一 16）。 */
  edgeInsetPx: 16,
  /** 玻璃容器圆角（画板 .glass 容器 14 / 胶囊 999）。 */
  glassRadiusPx: 14,
  /** 图标按钮：34 见方、10 圆角（画板 rail / 底栏 / 快捷加节点共用同一颗）。 */
  iconButtonPx: 34,
  iconButtonRadiusPx: 10,
  /**
   * 左侧面板液态开合第一拍那条「标题条」的高（owner 2026-09-26 定 B · 方向稿
   * `GFfqsraLtaRRBBKigkmCuT`：比图标上下各多出一丝，居中在被点那一格上）。
   */
  panelTitleStripPx: 40,
  /** 项目胶囊高（画板 .pill）。 */
  pillHeightPx: 36,
  /**
   * 助手面板顶边与顶栏底之间的空隙（D7b ④ · 画板 `DesignD7bToggle`：顶栏底 + 6）。
   *
   * ⚠ 它存在的理由是 owner 09-20 那条「⛔ 不再压顶栏」：此前面板贴 `top: 24`，
   * 正好盖住「剪辑台」那排胶囊的下半截。
   */
  assistantPanelGapPx: 6,
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

/** 面板开着时安全区左界离面板右缘多少。 */
const SAFE_GAP_PANEL_PX = 14

/**
 * 选中浮层 / 定位 / 弹层避让共用的**安全区左界**（node-canvas-v2 §1 第 4 条「推回安全区」）。
 *
 * ⭐ owner 2026-10-08 换皮：画布自己的图标栏并进了全站侧栏（≥768 桌面壳都在），画布里
 *   **没有栏**，左界只剩边距（面板开着再加面板）。⛔ 别再在调用点手写 `16` / `294`。
 */
export function canvasShellSafeLeftPx(options: {
  readonly panelOpen: boolean
}): number {
  const L = CANVAS_SHELL_LAYOUT
  return options.panelOpen
    ? L.edgeInsetPx + L.panelWidthPx + SAFE_GAP_PANEL_PX
    : L.edgeInsetPx
}

/**
 * 左侧面板（全部六格，开着哪一格是一份 `use-canvas-shell-panel` store）。
 *
 * ⭐ owner 2026-10-08 拍板（原型四格）：全站侧栏「画布」下面
 *   只放 添加节点 / 节点 / 当前项目 / 历史对话 四格；角色与素材库搬到底栏，点开的仍是
 *   侧栏旁边同一块面板。哪一格的入口落在哪里**只由** `navigation.ts` 的
 *   `SHELL_NAV_CANVAS_ENTRIES` 那一张 id 列表决定（不在列表里的 = 底栏），⛔ 别在这里
 *   另存一份顺序。
 */
export const CANVAS_SHELL_PANEL_IDS = {
  addNode: 'addNode',
  nodes: 'nodes',
  project: 'project',
  history: 'history',
  cards: 'cards',
  library: 'library',
} as const
export type CanvasShellPanelId =
  (typeof CANVAS_SHELL_PANEL_IDS)[keyof typeof CANVAS_SHELL_PANEL_IDS]

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

/** 素材库列表一次取多少条。 */
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

/** 没人告诉安全区左界时的默认值：面板收着。 */
export const CANVAS_SHELL_SAFE_LEFT_DEFAULT_PX = canvasShellSafeLeftPx({
  panelOpen: false,
})

/**
 * 面板入口（全站侧栏「画布」下面那四颗、底栏的角色 / 素材库两颗）身上的属性（值 = 面板
 * id）。面板的液态开合从被点的那一颗所在的那一行长出来，靠它在 DOM 里找到起点 ——
 * ⛔ 不在两边各猜一个坐标。
 */
export const CANVAS_SHELL_SIDEBAR_ENTRY_ATTR = 'data-canvas-shell-entry'
