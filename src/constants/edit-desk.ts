/**
 * 剪辑台（S8 · spec §6，画板 `EditDesk.dc.html`）的**尺寸与词表常量**。
 *
 * 画板上的精确值集中在这里，⛔ 组件里不散落任意值（Hard Rule 5 / §9 对稿）。
 * 图标栏宽度**复用外壳那一份**（`CANVAS_SHELL_LAYOUT.railWidthPx`）：剪辑台是画布
 * 的全屏模式而不是另一个页面，两条左栏宽不一样会让「退出即回到同一个地方」这件事
 * 在视觉上先破一次。
 */

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

/** 时间线工具条六颗（画板顺序：分割 / 转场 / 文字 / 语音 / 配乐 / 删除）。 */
export const EDIT_TOOL_IDS = {
  split: 'split',
  transition: 'transition',
  text: 'text',
  voice: 'voice',
  music: 'music',
  remove: 'remove',
} as const

export type EditToolId = (typeof EDIT_TOOL_IDS)[keyof typeof EDIT_TOOL_IDS]

export const EDIT_TOOLS: readonly EditToolId[] = [
  EDIT_TOOL_IDS.split,
  EDIT_TOOL_IDS.transition,
  EDIT_TOOL_IDS.text,
  EDIT_TOOL_IDS.voice,
  EDIT_TOOL_IDS.music,
  EDIT_TOOL_IDS.remove,
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

/** 画板上的几何。⚠ 每个数都能在 `EditDesk.dc.html` 里指出出处。 */
export const EDIT_DESK_LAYOUT = {
  /** 顶栏高（画板 height:48）。 */
  topBarHeightPx: 48,
  /** 左侧面板宽（画板 width:236）。 */
  panelWidthPx: 236,
  /** 右侧属性栏宽（画板 width:240）。 */
  inspectorWidthPx: 240,
  /**
   * 时间线区总高（画板 `EditDesk.dc.html` height:300 + S8d 的 T 轨那一行 80）。
   *
   * ⚠ 300 是**三轨**时代的数：`EditDeskText.dc.html` 在 V 之上又加了一条 44 高的
   * T 轨，仍按 300 算的话 A / M 会被挤出这块（本块 `overflow-y` 是 hidden）——
   * 真机上就是「配乐轨不见了」。⛔ 不改成可竖向滚动：一条要滚才看得全的时间线
   * 读不出「这条片子长什么样」。
   */
  timelineHeightPx: 380,
  /** 段高（画板 `.clip { height:52 }`，与 spec §6「段高 52」同一个数）。 */
  clipHeightPx: 52,
  /** 音轨波形条高（画板 `.wave { height:26 }`）。 */
  waveHeightPx: 26,
  /** 轨道名列宽（画板 `.lbl { width:32 }`）。 */
  trackLabelWidthPx: 32,
  /** 素材缩略高（画板 `.ptile { height:64 }`）。 */
  assetTileHeightPx: 64,
  /** 播放头宽（画板 width:2）。 */
  playheadWidthPx: 2,
  /** 一句话排片栏高 / 圆角（画板 44 / 16）。 */
  promptBarHeightPx: 44,
  promptBarRadiusPx: 16,
  /** 段之间的空隙（画板 gap:4）。 */
  clipGapPx: 4,
  /** 裁剪手柄宽（画板 `.handle { width:7 }`）。 */
  handleWidthPx: 7,
  /** 转场菱形边长（画板 12）。 */
  transitionMarkPx: 12,
  /**
   * 波形一根柱占多宽（柱 3 + 缝 2，见 `AudioWaveform` 的 `w-0.75 gap-0.5`）。
   * 段有多宽就画几根，⛔ 不固定根数 —— 固定根数的短段会挤成一团。
   */
  waveBarPitchPx: 5,
  /** 右栏来源缩略（画板 `.ptile { width:56; height:36 }`）。 */
  sourceThumbWidthPx: 56,
  sourceThumbHeightPx: 36,
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

/** 标尺刻度间隔（画板 0 / 5s / 10s …）。 */
export const EDIT_TIMELINE_TICK_SECONDS = 5

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
export const EDIT_DESK_MODE_PARAM = 'mode'
export const EDIT_DESK_MODE_VALUE = 'edit'

/* ─── 一句话排片（S10 · spec §6，画板 `EditDeskAI.dc.html`）───────────────── */

/**
 * 只读工具的名字。⚠ 名字里**没有 `generate`**：money-gate 认的就是这个词根，
 * 而这条路一分钱都不花（只摆时间线）。
 */
export const TIMELINE_PLAN_TOOL_ID = 'plan_timeline'

/** 提案的开销档 —— 只有一档，因为排片**永远**不花积分。 */
export const TIMELINE_PLAN_COST_FREE = 'free'

/**
 * 顺序从哪儿来。模型只在这三者里选一个，**排序本身由服务端算**
 * （⛔ 不让它自己吐一份排好的 id 表：漏一镜 / 多一镜没人查得出来）。
 */
export const TIMELINE_PLAN_ORDER_IDS = {
  /** 按剧本文本节点的先后。 */
  script: 'script',
  /** 按镜号。 */
  shot: 'shot',
  /** 按用户点名的那个顺序（模型转述）。 */
  asIs: 'asIs',
} as const

export type TimelinePlanOrderId =
  (typeof TIMELINE_PLAN_ORDER_IDS)[keyof typeof TIMELINE_PLAN_ORDER_IDS]

export const TIMELINE_PLAN_ORDERS_TUPLE = [
  TIMELINE_PLAN_ORDER_IDS.script,
  TIMELINE_PLAN_ORDER_IDS.shot,
  TIMELINE_PLAN_ORDER_IDS.asIs,
] as const

/**
 * 每段取哪一截。
 *
 * ⚠ 一期**全是算术**：中点 ± n/2、掐头、留尾、整段。⛔ 不调视频理解模型
 * （调研 `video-edit-models.md` §2：二期才上 scdet / blurdetect 粗排 + Flash 精排）。
 * 「画面最稳的 5 秒」这句话在一期的真实含义就是「中间的 5 秒」—— 文案照实说。
 */
export const TIMELINE_PLAN_TAKE_IDS = {
  middle: 'middle',
  head: 'head',
  tail: 'tail',
  full: 'full',
} as const

export type TimelinePlanTakeId =
  (typeof TIMELINE_PLAN_TAKE_IDS)[keyof typeof TIMELINE_PLAN_TAKE_IDS]

export const TIMELINE_PLAN_TAKES_TUPLE = [
  TIMELINE_PLAN_TAKE_IDS.middle,
  TIMELINE_PLAN_TAKE_IDS.head,
  TIMELINE_PLAN_TAKE_IDS.tail,
  TIMELINE_PLAN_TAKE_IDS.full,
] as const

/** 没说取几秒时取多少。 */
export const TIMELINE_PLAN_TAKE_DEFAULT_SEC = 5

/** 取多少秒的合法区间（守的是模型的输出，不是 UI）。 */
export const TIMELINE_PLAN_TAKE_MIN_SEC = EDIT_CLIP_MIN_DURATION_SEC
export const TIMELINE_PLAN_TAKE_MAX_SEC = 600

/** 配乐尾部淡出默认几秒。 */
export const TIMELINE_PLAN_MUSIC_FADE_OUT_SEC = 2
export const TIMELINE_PLAN_MUSIC_FADE_OUT_MAX_SEC = 30

/**
 * 淡出尾段的响度。
 *
 * ⚠ 这是**近似**：`EditClip` 眼下只有一个恒定 `gain`，渲染层也还没有 `fade`
 * 字段，于是「尾部淡出」在一期落成「最后 N 秒降到 35%」——一段真的会变轻的尾巴，
 * ⛔ 而不是一句只写在摘要里、时间线上根本不存在的承诺。等渲染层长出 `fade`
 * 再把这两段合回一段。
 */
export const TIMELINE_PLAN_MUSIC_TAIL_GAIN = 0.35

/** 一份提案最多摆几段 / 收几条理由（DoS 闸，与轨道上限同源）。 */
export const TIMELINE_PLAN_LIMITS = {
  maxClips: EDIT_TRACK_MAX_CLIPS,
  maxSummaryLength: 400,
  maxReasonLength: 200,
  /** 进提示词的素材 / 剧本行上限。 */
  maxAssets: 60,
  maxScriptLines: 60,
  maxScriptLineLength: 400,
} as const

/** 提案卡（画板右上 `.glass`：width 300 / radius 14 / padding 12）。 */
export const TIMELINE_PLAN_CARD = {
  widthPx: 300,
  radiusPx: 14,
  paddingPx: 12,
  /** 距时间线块右上角（画板 right:16 / top:12）。 */
  rightPx: 16,
  topPx: 12,
} as const

/** 幽灵段的虚线宽（画板 `.clip.ghost { border:1.5px dashed }`）。 */
export const TIMELINE_PLAN_GHOST_BORDER_PX = 1.5

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

/** 工具条「文字」落一段多长（spec §6：播放头处 3s）。 */
export const EDIT_TEXT_CLIP_DEFAULT_DURATION_SEC = 3

/** 一段字幕最短 / 内容多长。 */
export const EDIT_TEXT_CLIP_MIN_DURATION_SEC = EDIT_CLIP_MIN_DURATION_SEC
export const EDIT_TEXT_MAX_LENGTH = 500

/** T 段高 / T 轨行高（画板 `.tclip { height:32 }` / `.lane { height:44 }`）。 */
export const EDIT_TEXT_CLIP_HEIGHT_PX = 32
export const EDIT_TEXT_LANE_HEIGHT_PX = 44

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
