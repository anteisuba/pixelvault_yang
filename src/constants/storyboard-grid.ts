/**
 * 九宫格分镜（node-canvas-v2 §3「九宫格分镜」，owner 2026-09-29）。
 *
 * 宫格模板（`/` 模板 `grid3` / `grid2`，见 `image-prompt-templates.ts`）出完一张，
 * 在浏览器里切成 n×n 格，逐张存进素材库，按宫格原样排在原图右边。
 */

/** 能切的两种宫格（自动切按模板的 `gridSize`，手动切两种都给）。 */
export const STORYBOARD_GRID_SIZES = [3, 2] as const
export type StoryboardGridSize = (typeof STORYBOARD_GRID_SIZES)[number]

/** 找格缝用的参数（分析图的尺度下）。 */
export const STORYBOARD_GRID_DETECT = {
  /** 先把图缩到这么宽再分析：够看清一两像素的白缝，又不卡主线程。 */
  analysisWidth: 480,
  /** 一列 / 一行像素的亮度标准差不超过它，才算「纯色」。 */
  maxStdDev: 10,
  /** 纯色里足够亮（白缝）或足够暗（黑缝）才算缝，⛔ 把一片灰天空当缝。 */
  lightMin: 225,
  darkMax: 30,
  /** 缝的中心离理论等分线的容差（占内容宽 / 高的比例）。 */
  tolerance: 0.07,
  /** 九格里最窄与最宽的比不能低于它，不然就是没认出来。 */
  minCellRatio: 0.75,
} as const

/** 切出来的每一格存成 JPEG（逐张进素材库，⛔ 存成九张大 PNG）。 */
export const STORYBOARD_CELL_MIME = 'image/jpeg'
export const STORYBOARD_CELL_QUALITY = 0.92

/** 九张卡之间的间距（画布坐标）。 */
export const STORYBOARD_CELL_GAP = 40
/** 左边那道浅括号离九张卡的距离与宽度。 */
export const STORYBOARD_BRACKET = { offset: 22, width: 12 } as const
