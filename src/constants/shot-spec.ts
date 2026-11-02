/**
 * 镜头表的列（`p-canvas-shotlist`，设计稿 `docs/design/canvas-shotlist.md`）。
 *
 * 一行 = 一张 `video.shot` 镜头卡；这里是卡上 `shot` 那几格的词表与上限，以及项目级
 * `shotlist`（全片风格 / 总时长 / 关掉的列）。「说明」列就是卡的提示词正文，⛔ 不另存
 * 一份 —— 两份文字迟早对不上，而表的承诺是「改表就是改片」。
 */

/** 景别（固定词表，表里点开是一行一项的弹层）。顺序 = 由远到近。 */
export const SHOT_SIZE_IDS = {
  extremeWide: 'extreme_wide',
  wide: 'wide',
  full: 'full',
  medium: 'medium',
  mediumClose: 'medium_close',
  close: 'close',
  closeUp: 'close_up',
  extremeCloseUp: 'extreme_close_up',
} as const

export const SHOT_SIZES = [
  SHOT_SIZE_IDS.extremeWide,
  SHOT_SIZE_IDS.wide,
  SHOT_SIZE_IDS.full,
  SHOT_SIZE_IDS.medium,
  SHOT_SIZE_IDS.mediumClose,
  SHOT_SIZE_IDS.close,
  SHOT_SIZE_IDS.closeUp,
  SHOT_SIZE_IDS.extremeCloseUp,
] as const

export type ShotSize = (typeof SHOT_SIZES)[number]

/**
 * 景别发给模型时的说法。⚠ 用英文行业词：视频模型对 `close-up` 的理解比对「特写」稳，
 * 而这几个词在中英文提示词里混用不会出错。显示文案走 i18n，⛔ 不读这张表。
 */
export const SHOT_SIZE_PROMPT_TERMS: Record<ShotSize, string> = {
  extreme_wide: 'extreme wide shot',
  wide: 'wide shot',
  full: 'full shot',
  medium: 'medium shot',
  medium_close: 'medium close-up',
  close: 'close shot',
  close_up: 'close-up',
  extreme_close_up: 'extreme close-up',
}

/** 表里能关掉的列。镜号 / 画面 / 景别 / 运镜 / 说明 / 风格常驻。 */
export const SHOTLIST_OPTIONAL_COLUMN_IDS = {
  duration: 'duration',
  cast: 'cast',
} as const

export const SHOTLIST_OPTIONAL_COLUMNS = [
  SHOTLIST_OPTIONAL_COLUMN_IDS.duration,
  SHOTLIST_OPTIONAL_COLUMN_IDS.cast,
] as const

export type ShotlistOptionalColumn = (typeof SHOTLIST_OPTIONAL_COLUMNS)[number]

export const SHOT_SPEC_LIMITS = {
  /** 运镜一格：「缓慢推近 + 轻微手持」这种长度。 */
  moveMaxLength: 120,
  /** 风格一格（单镜或全片）：光线 / 色调 / 质感，两三句话。 */
  lookMaxLength: 400,
  /** 全片总时长上限（秒）。剪辑台成片的段数与时长另有护栏。 */
  totalDurationMaxSeconds: 600,
} as const

/**
 * 镜头表视图的 URL 值：与剪辑台共用 `?mode=`（`EDIT_DESK_MODE_PARAM`），两者互斥。
 * ⚠ 理由同剪辑台：做成画布的全屏模式而不是新页，退出时视口与选择原样还在。
 */
export const SHOT_TABLE_MODE_VALUE = 'table'
