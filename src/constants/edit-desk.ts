/**
 * 剪辑台（S8 · spec §6，画板 `EditDesk.dc.html`）的**尺寸与词表常量**。
 *
 * 画板上的精确值集中在这里，⛔ 组件里不散落任意值（Hard Rule 5 / §9 对稿）。
 * 图标栏宽度**复用外壳那一份**（`CANVAS_SHELL_LAYOUT.railWidthPx`）：剪辑台是画布
 * 的全屏模式而不是另一个页面，两条左栏宽不一样会让「退出即回到同一个地方」这件事
 * 在视觉上先破一次。
 */

import {
  STUDIO_OPERATOR_SHELL,
  type StudioOperatorShellAnchor,
} from '@/constants/studio-assistant-operator'

/** 三条轨道。顺序即画板从上到下的 V / A / M。 */
export const EDIT_TRACK_IDS = {
  video: 'video',
  audio: 'audio',
  music: 'music',
} as const

export type EditTrackId = (typeof EDIT_TRACK_IDS)[keyof typeof EDIT_TRACK_IDS]

export const EDIT_TRACKS: readonly EditTrackId[] = [
  EDIT_TRACK_IDS.video,
  EDIT_TRACK_IDS.audio,
  EDIT_TRACK_IDS.music,
]

/** 段尾转场。⚠ 转场是**段的属性**（接下一段），不是轨道上的独立对象。 */
export const EDIT_TRANSITION_IDS = {
  none: 'none',
  crossfade: 'crossfade',
  black: 'black',
} as const

export type EditTransitionId =
  (typeof EDIT_TRANSITION_IDS)[keyof typeof EDIT_TRANSITION_IDS]

export const EDIT_TRANSITIONS: readonly EditTransitionId[] = [
  EDIT_TRANSITION_IDS.none,
  EDIT_TRANSITION_IDS.crossfade,
  EDIT_TRANSITION_IDS.black,
]

/** 速度三档（画板右栏分段控件 0.5× / 1× / 2×）。 */
export const EDIT_CLIP_SPEEDS = [0.5, 1, 2] as const

export type EditClipSpeed = (typeof EDIT_CLIP_SPEEDS)[number]

export const EDIT_CLIP_SPEED_DEFAULT: EditClipSpeed = 1

/** 成片比例 / 清晰度。⛔ 不与生成参数表合并：那是「这一镜怎么生」，这是「成片怎么出」。 */
export const EDIT_ASPECTS = ['16:9', '9:16', '1:1'] as const
export type EditAspect = (typeof EDIT_ASPECTS)[number]
export const EDIT_ASPECT_DEFAULT: EditAspect = '16:9'

export const EDIT_RESOLUTIONS = ['720p', '1080p', '4k'] as const
export type EditResolution = (typeof EDIT_RESOLUTIONS)[number]
export const EDIT_RESOLUTION_DEFAULT: EditResolution = '1080p'

/** 导出三范围（spec §6「导出」）。 */
export const EDIT_EXPORT_RANGE_IDS = {
  all: 'all',
  inOut: 'inOut',
  clip: 'clip',
} as const

export type EditExportRangeId =
  (typeof EDIT_EXPORT_RANGE_IDS)[keyof typeof EDIT_EXPORT_RANGE_IDS]

export const EDIT_EXPORT_RANGES: readonly EditExportRangeId[] = [
  EDIT_EXPORT_RANGE_IDS.all,
  EDIT_EXPORT_RANGE_IDS.inOut,
  EDIT_EXPORT_RANGE_IDS.clip,
]

/** 左侧图标栏五项（画布素材 / 素材库 / 音频 / 文字 / 转场）。 */
export const EDIT_PANEL_IDS = {
  canvas: 'canvas',
  library: 'library',
  audio: 'audio',
  text: 'text',
  transition: 'transition',
} as const

export type EditPanelId = (typeof EDIT_PANEL_IDS)[keyof typeof EDIT_PANEL_IDS]

export const EDIT_PANELS: readonly EditPanelId[] = [
  EDIT_PANEL_IDS.canvas,
  EDIT_PANEL_IDS.library,
  EDIT_PANEL_IDS.audio,
  EDIT_PANEL_IDS.text,
  EDIT_PANEL_IDS.transition,
]

/**
 * 台面几何（「剪辑台 A · 全部状态」画板，owner 2026-09-28 定稿：工作台那一套卡片语言）。
 * ⚠ 每一条轨是一道轨槽，段在槽里上下各让 `laneInsetPx`：段高 + 两倍让位 = 轨高。
 */
export const EDIT_DESK_LAYOUT = {
  /** 素材面板宽（画板 `.ed-fly` 268 减去内边距后的内容宽，沿用 236 的两列格）。 */
  panelWidthPx: 236,
  /** 画面段高（spec §6「段高 52」）。画面轨 = 52 + 3 × 2。 */
  clipHeightPx: 52,
  /** 配音 / 配乐段高。声音轨 = 30 + 3 × 2。 */
  waveHeightPx: 30,
  /** 段在轨槽里上下各让多少。 */
  laneInsetPx: 3,
  /** 左边轨道名那一列宽（画板 `.ed-heads`）。 */
  trackHeadWidthPx: 64,
  /** 标尺高（画板 `.ed-rul`）。 */
  rulerHeightPx: 22,
  /** 素材缩略高（画板 `.ptile { height:64 }`）。 */
  assetTileHeightPx: 64,
  /** 播放头宽（画板 width:2）。 */
  playheadWidthPx: 2,
  /** 段之间的空隙（画板 gap:4）。 */
  clipGapPx: 4,
  /** 裁剪手柄宽（画板 `.hl` / `.hr`）。 */
  handleWidthPx: 9,
  /** 转场菱形边长（画板 12）。 */
  transitionMarkPx: 12,
  /**
   * 波形一根柱占多宽（柱 3 + 缝 2，见 `AudioWaveform` 的 `w-0.75 gap-0.5`）。
   * 段有多宽就画几根，⛔ 不固定根数 —— 固定根数的短段会挤成一团。
   */
  waveBarPitchPx: 5,
} as const

/** 左栏音频素材格里那条波形画几根柱（236 面板两列，一格约 106px 宽）。 */
export const EDIT_DESK_ASSET_WAVE_BARS = 28

/**
 * 时间线上一段画几条缩略帧（画板 `.clip` 里那排 `.fr`）。
 *
 * ⚠ 是**上限**不是定值：段有多宽就按 `clipHeightPx` 的 16:9 宽度铺满，短段少铺
 * 几条。⛔ 不按秒抽真帧 —— 一段一张封面已经能回答「这是哪一镜」，逐帧抽要 N 次
 * seek，拖手柄时页面直接停住。
 */
export const EDIT_DESK_CLIP_FRAME_MAX = 12

/**
 * 时间线缩放：一秒画多少像素。
 *
 * 画板上 5s 的段占 200px → 40。⛔ 不做无级缩放：本片只要「读得懂的一条时间线」，
 * 缩放条留到有人真的要剪 5 分钟以上时再加。
 */
export const EDIT_TIMELINE_PX_PER_SECOND = 40

/**
 * 时间线**默认铺满整条**（④ 方向 A，owner 2026-09-28）：每秒多少像素按时间线区的
 * 宽度现算，一眼看完整条片子。⚠ 上面那个 40 只剩量不到宽度时（首帧 / 测试环境）的
 * 兜底。手动缩放不做 —— 剪 5 分钟以上的片子再加。
 */
export const EDIT_TIMELINE_FIT = {
  /** 空台或很短的片子也按至少这么长铺，⛔ 不把 2 秒拉满一屏。 */
  minSpanSec: 10,
  /** 末尾留一点空（整条的 4%），最后一段不贴着右缘。 */
  tailRatio: 1.04,
  /** 每秒像素的上下限：再窄就横向滚，再宽也不放大。 */
  minPxPerSecond: 4,
  maxPxPerSecond: 160,
} as const

/** 标尺刻度候选（秒）：取第一档让相邻两格至少隔 `EDIT_TIMELINE_TICK_MIN_PX`。 */
export const EDIT_TIMELINE_TICK_STEPS = [1, 2, 5, 10, 15, 30, 60, 120] as const
export const EDIT_TIMELINE_TICK_MIN_PX = 64

/**
 * 时间线手感（owner 2026-09-28「操作体验不太好」）：拖手柄 / 拖字幕 / 拖播放头离播放头
 * 或任何一段的头尾不到 `snapPx` 就吸上去；按住段拖过 `dragThresholdPx` 才算拖（否则
 * 就是点选）；段两端各 `edgeHitPx` 宽的一条是裁剪区（没选中也能直接拖）。
 */
export const EDIT_TIMELINE_FEEL = {
  snapPx: 8,
  dragThresholdPx: 4,
  edgeHitPx: 10,
} as const

/**
 * 时间线缩放（owner 2026-09-28 画板「时间线放大 · 横向滚动」）：1 = 铺满整条；放大后
 * 横向滚动，以播放头为中心。`maxPxPerSecond` 管放大的上限（铺满那一档仍按
 * `EDIT_TIMELINE_FIT` 夹）。
 */
export const EDIT_TIMELINE_ZOOM = {
  min: 1,
  max: 6,
  step: 0.5,
  maxPxPerSecond: 720,
} as const

/**
 * 舞台上方那条回执（④ A 关键切片动效表：180ms 淡入上移 4px / 180ms 淡出）。
 * `idleMs` = 没有新改动多久自己收起（悬停不计时）；`undoneMs` = 「已撤销」停多久。
 */
export const EDIT_RECEIPT_MOTION = {
  inS: 0.18,
  outS: 0.18,
  riseY: 4,
  idleMs: 8000,
  undoneMs: 1400,
} as const

/** 一段最短能裁到多短 —— 再短就不是一段而是一个误操作。 */
export const EDIT_CLIP_MIN_DURATION_SEC = 0.2

/** 一条时间线最多几段（DoS 护栏，与 op 载荷上限同源）。 */
export const EDIT_TRACK_MAX_CLIPS = 200

/** 成片名长度上限（与项目名同一个量级）。 */
export const EDIT_PROJECT_NAME_MAX_LENGTH = 120

/** 缺省成片名 —— i18n 拿不到时的兜底，⛔ UI 上一律走 `t('untitled')`。 */
export const EDIT_PROJECT_FALLBACK_NAME = 'Untitled cut'

/** 倍速的落库区间 —— schema 只守它，档位词表见 `EDIT_CLIP_SPEEDS`。 */
export const EDIT_CLIP_SPEED_MIN = 0.25
export const EDIT_CLIP_SPEED_MAX = 4

/** 音量增益的落库区间（1 = 原样）；属性行那根滑杆按 `STEP` 走。 */
export const EDIT_CLIP_GAIN_MIN = 0
export const EDIT_CLIP_GAIN_MAX = 2
export const EDIT_CLIP_GAIN_STEP = 0.05

/**
 * `z.enum` 要的**元组**形态（`readonly T[]` 装不进去）。
 * ⚠ 与上面两张只读表同源，⛔ 不各写一份值。
 */
export const EDIT_TRACKS_TUPLE = [
  EDIT_TRACK_IDS.video,
  EDIT_TRACK_IDS.audio,
  EDIT_TRACK_IDS.music,
] as const

export const EDIT_TRANSITIONS_TUPLE = [
  EDIT_TRANSITION_IDS.none,
  EDIT_TRANSITION_IDS.crossfade,
  EDIT_TRANSITION_IDS.black,
] as const

/**
 * 「把画布上的一张卡拖进时间线」的载荷 MIME。
 *
 * ⚠ 与外壳的 `CANVAS_SHELL_MEDIA_DRAG_MIME` 是**两件事**，⛔ 别复用：那条带的是
 * `{kind, subtype, url, name}`（素材库里一条**没有节点**的产物，落到画布上要新建
 * 一张卡）；这条带的是**节点 id**（画布上已经有的那张卡），时间线上的段永远指向
 * 一个节点而不是一个 url —— 那正是「段永远记得来源节点」的下半句。
 */
export const EDIT_DESK_NODE_DRAG_MIME =
  'application/x-pixelvault-canvas-node-id'

/**
 * 「把**素材库**里的一条产物拖进时间线」的载荷 MIME（S8c）。
 *
 * ⚠ 与上面那条是**两件事**：那条带的是画布上已有的节点 id，这条带的是一条**还没有
 * 节点**的产物（`{kind, subtype, url, name, durationSec?, thumbnailUrl?}`）。落进轨
 * 之前必须**先建一张画布卡**，段再指向那张卡 —— 段永远记得来源节点（spec §6），
 * ⛔ 不让段直接指向一条素材库记录。
 */
export const EDIT_DESK_LIBRARY_DRAG_MIME =
  'application/x-pixelvault-edit-library-asset'

/**
 * 「把一个转场预设拖到两段之间的缝上」的载荷 MIME（S8c）。
 *
 * 带的是 `EditTransitionId`。落点是**前一段** —— 转场是段的属性（接下一段），
 * 与右栏「转场 →」写的是同一个字段。
 */
export const EDIT_DESK_TRANSITION_DRAG_MIME =
  'application/x-pixelvault-edit-transition'

/** 素材库页一页拉几条 / 一次「加载更多」再拉几条。 */
export const EDIT_DESK_LIBRARY_PAGE_SIZE = 24

/**
 * 音频页的三档筛（工具条「语音」/「配乐」按它切）。
 *
 * ⚠ 画布上的音频子型只有 `voice` / `ambience`（`NODE_V4_AUDIO_SUBTYPE_IDS`）——
 * 「配乐 / 音效」在数据上就是 `ambience` 那一档，⛔ 不为这张筛子新造一个子型。
 */
export const EDIT_AUDIO_FILTER_IDS = {
  all: 'all',
  voice: 'voice',
  music: 'music',
} as const

export type EditAudioFilterId =
  (typeof EDIT_AUDIO_FILTER_IDS)[keyof typeof EDIT_AUDIO_FILTER_IDS]

/**
 * 素材库页的三档筛。⚠ 与上面那张**不是同一张**：这一张筛的是产物类型
 * （时间线只收视频与音频），那一张筛的是画布上音频卡的用途。
 */
export const EDIT_DESK_LIBRARY_FILTER_IDS = {
  all: 'all',
  video: 'video',
  audio: 'audio',
} as const

export type EditDeskLibraryFilterId =
  (typeof EDIT_DESK_LIBRARY_FILTER_IDS)[keyof typeof EDIT_DESK_LIBRARY_FILTER_IDS]

/**
 * 全屏模式的 URL 参数（spec §6「URL 只加 `?mode=edit`」）。
 *
 * ⚠ 只加一个参数，⛔ 不做 `/studio/node/edit` 这样的新路由：新路由 = 新页 = 画布
 * 卸载重挂，退出时视口与选择全丢，而「退出即回到刚才那个地方」正是把剪辑台做成
 * 模式（而不是页）的全部理由。
 */
/**
 * 剪辑台顶栏（v2 暗场，owner 2026-10-08 选 B）：一条通栏 `h-12`、左右内边距 `px-3.5`。
 * ⚠ 两个数是助手锚点的依据（下一条），改顶栏的 class 必须改这里。
 */
export const EDIT_DESK_TOP_BAR = { heightPx: 48, insetPx: 14 } as const

/**
 * 剪辑台里助手面板的落点：头像坐在顶栏最右那一格（竖直居中），面板从顶栏下面
 * 18 开始、贴右 18 滑入，舞台同一根弹簧让位（与图片台布局 A 同一套开合）。
 * ⚠ 助手面板保持浅色（owner 2026-10-08）：它不在台面的 `dark` 作用域里。
 */
export const EDIT_DESK_OPERATOR_ANCHOR: StudioOperatorShellAnchor = {
  avatarTopPx:
    (EDIT_DESK_TOP_BAR.heightPx - STUDIO_OPERATOR_SHELL.avatarSizePx) / 2,
  avatarRightPx: EDIT_DESK_TOP_BAR.insetPx,
  panelTopPx: EDIT_DESK_TOP_BAR.heightPx + 18,
  panelRightPx: 18,
  panelBottomPx: 18,
  avatarStays: true,
}

export const EDIT_DESK_MODE_PARAM = 'mode'
export const EDIT_DESK_MODE_VALUE = 'edit'

/* ─── 文字段（S8d · spec §6「文字段」，画板 `EditDeskText.dc.html`）──────── */

/**
 * T 轨的 id。
 *
 * ⚠ **不进 `EDIT_TRACK_IDS`**：那三条轨上住的是 `EditClip`（指向一张卡的一截素材），
 * T 轨上住的是 `EditTextClip`（自带内容、自带绝对起点）。混进同一张表的代价是每个
 * 读 `project.tracks[track]` 的地方都要先分辨自己拿到的是哪一种段 —— 而那正是
 * 「一条轨道是一排 `EditClip`」这条纪律现在还成立的原因。
 */
export const EDIT_TEXT_TRACK_ID = 'text'

/**
 * 九宫位置。⚠ 顺序即画板 `.grid9` 从左上到右下的读法。
 * `t/m/b` = 上 / 中 / 下，`l/c/r` = 左 / 中 / 右。
 */
export const EDIT_TEXT_ANCHORS_TUPLE = [
  'tl',
  'tc',
  'tr',
  'ml',
  'mc',
  'mr',
  'bl',
  'bc',
  'br',
] as const

export type EditTextAnchor = (typeof EDIT_TEXT_ANCHORS_TUPLE)[number]

export const EDIT_TEXT_ANCHORS: readonly EditTextAnchor[] =
  EDIT_TEXT_ANCHORS_TUPLE

/** 默认下中 —— 字幕的位置（画板右栏九宫点亮的那一格）。 */
export const EDIT_TEXT_ANCHOR_DEFAULT: EditTextAnchor = 'bc'

/** 字号三档（画板右栏「小 / 中 / 大」）。 */
export const EDIT_TEXT_SIZES_TUPLE = ['s', 'm', 'l'] as const
export type EditTextSize = (typeof EDIT_TEXT_SIZES_TUPLE)[number]
export const EDIT_TEXT_SIZES: readonly EditTextSize[] = EDIT_TEXT_SIZES_TUPLE
export const EDIT_TEXT_SIZE_DEFAULT: EditTextSize = 'm'

/**
 * 字号 = 成片**画面高**的百分之几。
 *
 * ⚠ 存的是比例而不是像素：同一条时间线导 720p 与 4k 时字幕必须一样大（相对画面），
 * 存像素的表现是「1080p 上刚好，4k 上小得看不见」。
 */
export const EDIT_TEXT_SIZE_SCALE: Readonly<Record<EditTextSize, number>> = {
  s: 0.045,
  m: 0.06,
  l: 0.08,
}

/** 字幕离画面边多远（同样是画面高的比例）。 */
export const EDIT_TEXT_MARGIN_SCALE = 0.06

/** 黑 / 白两色（画板右栏「白 / 黑」）。⛔ 不开调色板：字幕只要读得清。 */
export const EDIT_TEXT_TONES_TUPLE = ['light', 'dark'] as const
export type EditTextTone = (typeof EDIT_TEXT_TONES_TUPLE)[number]
export const EDIT_TEXT_TONES: readonly EditTextTone[] = EDIT_TEXT_TONES_TUPLE
export const EDIT_TEXT_TONE_DEFAULT: EditTextTone = 'light'

/** 淡入淡出三档（画板右栏「无 / 0.3s / 0.6s」）。 */
export const EDIT_TEXT_FADES = [0, 0.3, 0.6] as const
export type EditTextFade = (typeof EDIT_TEXT_FADES)[number]
export const EDIT_TEXT_FADE_DEFAULT: EditTextFade = 0
/** schema 只守区间（与 `speed` 同一条论据：档位会长，落库形状不跟着改）。 */
export const EDIT_TEXT_FADE_MAX_SEC = 5

/** 「加一条字幕」落一段多长（spec §6：播放头处 3s）。 */
export const EDIT_TEXT_CLIP_DEFAULT_DURATION_SEC = 3

/**
 * 挂件（v2 第 1 片）：挂点那一帧落在宿主入出点之外多远才算「断挂」。位置一律算到
 * 毫秒，这一档只吸收那一毫秒的舍入。
 */
export const EDIT_ATTACH_EPSILON_SEC = 0.001

/** 一段字幕最短 / 内容多长。 */
export const EDIT_TEXT_CLIP_MIN_DURATION_SEC = EDIT_CLIP_MIN_DURATION_SEC
export const EDIT_TEXT_MAX_LENGTH = 500

/** T 段高 / T 轨行高（画板 `.tclip { height:32 }` / `.lane { height:44 }`）。 */
export const EDIT_TEXT_CLIP_HEIGHT_PX = 24
export const EDIT_TEXT_LANE_HEIGHT_PX = 30

/* ─── 快捷键预设（S8d · spec §6「快捷键」）─────────────────────────────── */

export const EDIT_SHORTCUT_PRESET_IDS = {
  premiere: 'premiere',
  finalCut: 'finalCut',
} as const

export type EditShortcutPresetId =
  (typeof EDIT_SHORTCUT_PRESET_IDS)[keyof typeof EDIT_SHORTCUT_PRESET_IDS]

export const EDIT_SHORTCUT_PRESETS: readonly EditShortcutPresetId[] = [
  EDIT_SHORTCUT_PRESET_IDS.premiere,
  EDIT_SHORTCUT_PRESET_IDS.finalCut,
]

export const EDIT_SHORTCUT_PRESET_DEFAULT: EditShortcutPresetId =
  EDIT_SHORTCUT_PRESET_IDS.premiere

/**
 * 预设记在哪。
 *
 * ⚠ **不进 `EditProject`**（spec §6）：键位是这台机器上这个人的手感，时间线是项目
 * 内容 —— 把它写进时间线等于让「我习惯 FCP」跟着项目同步给别人，还会进撤销栈。
 */
export const EDIT_SHORTCUT_PRESET_STORAGE_KEY =
  'pixelvault:edit-shortcut-preset'

/** 弹层那张只读键位表的行（顺序即画板 `.pop` 里从上到下）。 */
export const EDIT_SHORTCUT_ACTION_IDS = {
  play: 'play',
  split: 'split',
  inOut: 'inOut',
  remove: 'remove',
  undo: 'undo',
  back: 'back',
} as const

export type EditShortcutActionId =
  (typeof EDIT_SHORTCUT_ACTION_IDS)[keyof typeof EDIT_SHORTCUT_ACTION_IDS]

export const EDIT_SHORTCUT_ACTIONS: readonly EditShortcutActionId[] = [
  EDIT_SHORTCUT_ACTION_IDS.play,
  EDIT_SHORTCUT_ACTION_IDS.split,
  EDIT_SHORTCUT_ACTION_IDS.inOut,
  EDIT_SHORTCUT_ACTION_IDS.remove,
  EDIT_SHORTCUT_ACTION_IDS.undo,
  EDIT_SHORTCUT_ACTION_IDS.back,
]

/**
 * 每个预设的**分割键**（`KeyboardEvent.code` + ⌘/Ctrl）。
 *
 * ⚠ 用 `code` 不用 `key`：⌘ 组合在 macOS 的非英文输入法下 `key` 会变，而 `code` 是
 * 物理键（与 §7 那条 alt 的教训同源）。
 * ⚠ spec §6 的 `S` **一直有效**，与预设无关 —— 预设加的是 PR / FCP 用户的肌肉记忆，
 * ⛔ 不是把本来那颗键换掉。
 */
export const EDIT_SHORTCUT_SPLIT_CODE: Readonly<
  Record<EditShortcutPresetId, string>
> = {
  [EDIT_SHORTCUT_PRESET_IDS.premiere]: 'KeyK',
  [EDIT_SHORTCUT_PRESET_IDS.finalCut]: 'KeyB',
}

/**
 * 只读键位表的**显示值**（画板 `.pop` 里那一列 `.kbd`）。
 *
 * ⚠ 是**字面量**不是 i18n：`Space` / `⌘K` / `⌫` 在三种语言里长得一模一样，翻译它们
 * 只会让某一版翻出一个键盘上找不到的字。
 */
export const EDIT_SHORTCUT_PRESET_KEYS: Readonly<
  Record<EditShortcutPresetId, Readonly<Record<EditShortcutActionId, string>>>
> = {
  [EDIT_SHORTCUT_PRESET_IDS.premiere]: {
    play: 'Space',
    split: '⌘K',
    inOut: 'I / O',
    remove: '⌫',
    undo: '⌘Z',
    back: 'Esc',
  },
  [EDIT_SHORTCUT_PRESET_IDS.finalCut]: {
    play: 'Space',
    split: '⌘B',
    inOut: 'I / O',
    remove: '⌫',
    undo: '⌘Z',
    back: 'Esc',
  },
}

/** 九宫那一格（画板 `.grid9 div { width:22; height:16; border-radius:4 }`，格间 3）。 */
export const EDIT_TEXT_ANCHOR_CELL = {
  widthPx: 22,
  heightPx: 16,
  radiusPx: 4,
  gapPx: 3,
} as const

/** 快捷键弹层宽（画板 `.pop { width:300 }`）。 */
export const EDIT_SHORTCUT_POPOVER_WIDTH_PX = 300
