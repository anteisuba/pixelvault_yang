import {
  ASSET_GRID_DESKTOP_MIN_WIDTH,
  ASSET_GRID_FALLBACK_ASPECT_RATIO,
  ASSET_GRID_MAX_ASPECT_RATIO,
  ASSET_GRID_MIN_ASPECT_RATIO,
  ASSET_GRID_TABLET_MIN_WIDTH,
  type AssetGridViewport,
} from '@/constants/assets-grid'

/**
 * 视口 → 行高刻度档（page §5.6 的 768 / 1280 两道）。
 * ⚠ 与 `useIsMobile`（1024，决定布局壳挂不挂桌面侧栏）不是同一道闸。
 */
export function resolveAssetGridViewport(
  viewportWidth: number,
): AssetGridViewport {
  if (viewportWidth < ASSET_GRID_TABLET_MIN_WIDTH) return 'mobile'
  if (viewportWidth < ASSET_GRID_DESKTOP_MIN_WIDTH) return 'tablet'
  return 'desktop'
}

/**
 * justified rows —— 行内等高、按真实比例分宽、整行铺满容器。
 *
 * 契约：`docs/references/pages/assets.md` §5。三条容易踩的：
 * 1. **超宽图不开独占行** —— 独占会在行右侧留下大片空白，而 justified 本身
 *    已经保证不裁切，两者不冲突。
 * 2. **末行默认也铺满**，只有铺满会把它撑得比目标行高还高 `lastRowMaxScale`
 *    倍时（末行只剩一两张）才回落到目标行高。
 * 3. **宽度用前缀取整** —— 逐个 `Math.floor` 会让每行少几个像素，验收判据
 *    「行宽 / 容器宽 ≥99%」正是死在这上面。前缀取整让整行像素和**精确等于**
 *    容器可用宽。
 */

export interface JustifiedLayoutOptions {
  /** 容器自身的 `clientWidth`（⛔ 不要手算 padding）。 */
  containerWidth: number
  /** 目标行高 = 密度档。 */
  targetRowHeight: number
  /** 瓦片间距。 */
  gap: number
  /** 末行铺满的高度上限倍数。 */
  lastRowMaxScale: number
}

export interface JustifiedBox {
  /** 该元素在 `items` 里的下标。 */
  index: number
  width: number
  height: number
}

export interface JustifiedRow {
  height: number
  boxes: JustifiedBox[]
}

/**
 * 把原始宽高换算成参与排版的比例：宽高缺失/非法 → 1:1 兜底；
 * 合法值 clamp 进安全阀区间（只防脏数据）。
 */
export function toLayoutAspectRatio(
  width: number | null | undefined,
  height: number | null | undefined,
): number {
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return ASSET_GRID_FALLBACK_ASPECT_RATIO
  }
  return clampAspectRatio(width / height)
}

export function clampAspectRatio(aspectRatio: number): number {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return ASSET_GRID_FALLBACK_ASPECT_RATIO
  }
  return Math.min(
    ASSET_GRID_MAX_ASPECT_RATIO,
    Math.max(ASSET_GRID_MIN_ASPECT_RATIO, aspectRatio),
  )
}

/**
 * @param aspectRatios 每个元素参与排版的宽高比（已 clamp，顺序即渲染顺序）
 */
export function computeJustifiedRows(
  aspectRatios: readonly number[],
  {
    containerWidth,
    targetRowHeight,
    gap,
    lastRowMaxScale,
  }: JustifiedLayoutOptions,
): JustifiedRow[] {
  if (
    aspectRatios.length === 0 ||
    containerWidth <= 0 ||
    targetRowHeight <= 0
  ) {
    return []
  }

  const rows: JustifiedRow[] = []
  let buffer: { index: number; aspectRatio: number }[] = []
  let aspectSum = 0

  const flush = (isLast: boolean) => {
    if (buffer.length === 0) return

    const available = containerWidth - gap * (buffer.length - 1)
    let height = available / aspectSum
    // 末行：铺满优先，只有铺满会把它撑得过高时才回落到目标行高。
    const fillsRow = !(isLast && height > targetRowHeight * lastRowMaxScale)
    if (!fillsRow) height = targetRowHeight

    // 前缀取整：先算出每个元素的浮点右边界，再对边界取整做差。
    // 铺满行的宽度和因此精确等于 `available`，不会累积舍入误差。
    const rowHeight = Math.round(height)
    const boxes: JustifiedBox[] = []
    let cursor = 0
    let roundedCursor = 0

    buffer.forEach((item, position) => {
      cursor += item.aspectRatio * height
      const nextRounded =
        fillsRow && position === buffer.length - 1
          ? Math.round(available)
          : Math.round(cursor)
      boxes.push({
        index: item.index,
        width: Math.max(1, nextRounded - roundedCursor),
        height: rowHeight,
      })
      roundedCursor = nextRounded
    })

    rows.push({ height: rowHeight, boxes })
    buffer = []
    aspectSum = 0
  }

  aspectRatios.forEach((aspectRatio, index) => {
    buffer.push({ index, aspectRatio })
    aspectSum += aspectRatio
    // 贪心：这一行按目标行高铺出去已经够宽了就收行。收行时把当前元素**留在
    // 行内**（而不是甩到下一行），行高随之被压到目标行高以下 —— 这正是
    // justified 相册的标准做法，也是「超宽图与常规图同排」的实现。
    if (
      aspectSum * targetRowHeight >=
      containerWidth - gap * (buffer.length - 1)
    ) {
      flush(false)
    }
  })

  flush(true)

  return rows
}
