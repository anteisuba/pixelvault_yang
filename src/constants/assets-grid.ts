/**
 * `/assets` justified 网格的排版常量 —— 契约见
 * `docs/references/pages/assets.md` §5「真实比例网格 · 算法契约」。
 *
 * 这里只放「排版尺度」：目标行高刻度、间距、比例安全阀、末行规则。
 * 排版算法本身在 `src/lib/justified-layout.ts`（纯函数，可单测）。
 */

/** 密度档 = 目标行高，不再等价于固定列数 4/6/8。 */
export const ASSET_GRID_DENSITIES = ['s', 'm', 'l'] as const
export type AssetGridDensity = (typeof ASSET_GRID_DENSITIES)[number]

export const ASSET_GRID_DEFAULT_DENSITY: AssetGridDensity = 'm'

/** 密度偏好持久化键（page §11「不能破坏」列了这个键名）。 */
export const ASSET_GRID_DENSITY_STORAGE_KEY = 'pv:assets:density'

/**
 * 行高刻度的视口断点。
 * ⚠ 与全局 `useIsMobile`（1024）**不是一回事**：那个决定布局壳挂不挂桌面侧栏，
 * 这里只决定一行画多高，契约 §5.6 / §9 明写为 768 / 1280 两道。
 */
export const ASSET_GRID_TABLET_MIN_WIDTH = 768
export const ASSET_GRID_DESKTOP_MIN_WIDTH = 1280

export type AssetGridViewport = 'mobile' | 'tablet' | 'desktop'

/** 目标行高（px）—— page §5.6 的三断点刻度表。 */
export const ASSET_GRID_TARGET_ROW_HEIGHT: Record<
  AssetGridViewport,
  Record<AssetGridDensity, number>
> = {
  desktop: { s: 150, m: 196, l: 260 },
  tablet: { s: 128, m: 168, l: 222 },
  mobile: { s: 92, m: 124, l: 168 },
}

/** picker 的小网格自成一档（page §8.2：桌面 132 / 移动 104），不吃密度控制。 */
export const ASSET_PICKER_TARGET_ROW_HEIGHT: Record<
  'desktop' | 'mobile',
  number
> = {
  desktop: 132,
  mobile: 104,
}

/** 瓦片间距（原型 `assets-claude-b-atrium` 的 `.row-j{gap:6px}`）。 */
export const ASSET_GRID_GAP = 6

/** 窗口化时视口上下各多画几行，滚动时不至于看见空白再填。 */
export const ASSET_GRID_ROW_OVERSCAN = 4

/**
 * 比例安全阀：只防脏数据，真实数据（实测 0.56–2.77）全部原样参与排版。
 * ⛔ 不是裁切策略 —— 落在区间内的比例一律不裁。
 */
export const ASSET_GRID_MIN_ASPECT_RATIO = 0.4
export const ASSET_GRID_MAX_ASPECT_RATIO = 3.2

/** 无宽高的存量记录按 1:1 兜底参与排行（实测 135 条里有 14 条）。 */
export const ASSET_GRID_FALLBACK_ASPECT_RATIO = 1

/**
 * 音频**恒 1:1 封面卡**（page §6，owner 需求 4）—— 与「无宽高兜底」是两件事：
 * 就算某条音频记录带上了宽高，它在列表里也必须是方封面。
 */
export const ASSET_GRID_AUDIO_ASPECT_RATIO = 1

/**
 * 末行也铺满；只有当铺满会让行高超过目标行高这个倍数时才回落到目标行高
 * （末行只剩一两张的情形）。
 */
export const ASSET_GRID_LAST_ROW_MAX_SCALE = 1.5

/**
 * SSR 假定容器宽 —— 服务端量不到 `clientWidth`，先按这个宽度排一遍，
 * 客户端 `useLayoutEffect` 在首帧绘制前用真实 `clientWidth` 重排。
 * 服务端与客户端首渲染用同一个值，所以不会 hydration mismatch。
 */
export const ASSET_GRID_SSR_CONTAINER_WIDTH = 1200

/** 骨架屏的比例样本 —— 让加载态就长得像真实比例网格，而不是方格阵。 */
export const ASSET_GRID_SKELETON_ASPECT_RATIOS: readonly number[] = [
  1.5, 0.67, 1, 1.78, 0.75, 1.33, 0.56, 1, 2.4, 0.8, 1.25, 1,
]

/** picker 首格内联上传格的比例（原型 `layoutPk` 的 `extra*0.8`）。 */
export const ASSET_PICKER_UPLOAD_CELL_ASPECT_RATIO = 0.8

// ─── 文件夹门牌（page §3 段一 / §4）──────────────────────────────

/** 门牌卡宽度（page §3 段一：宽 168、`rounded-xl` + 1px border）。 */
export const FOLDER_PLAQUE_WIDTH = 168

/** <768 手机上门牌改固定宽横滚（page §9：文件夹门牌 132 宽横滚）。 */
export const FOLDER_PLAQUE_MOBILE_WIDTH = 132

/** 门牌之间的间距。 */
export const FOLDER_PLAQUE_GAP = 8

/** 门牌卡上「最近 N 张真实素材」拼成 2×2。 */
export const PROJECT_COVER_TILE_COUNT = 4

/**
 * 拼贴区的**固定高度**（px）。⚠ 别改成「按比例」：门牌是 `flex-grow` 吃余量的，
 * 夹一少每张卡就会变得很宽，比例一挂高度立刻跟着膨胀成巨幅横幅（实拍见过
 * 740×370 的门牌）。固定高度则无论卡多宽，整行高度都恒定。
 */
export const PLAQUE_COVER_HEIGHT = 88

/** 门牌卡上直接列出的子夹 chip 数，超出折叠成 `+N`（page §4 路径一）。 */
export const FOLDER_PLAQUE_MAX_SUBFOLDER_CHIPS = 2

// ─── 上传队列 / 占位瓦片（page §7 / §7.3）──────────────────────────

/** 本地读不到宽高时占位瓦片的兜底比例（page §7.3.6 明写 4:5）。 */
export const ASSET_UPLOAD_FALLBACK_ASPECT_RATIO = 4 / 5

/** 「已移动 N 项 · 撤销」toast 的存活时长（page §7.2 明写 6 秒）。 */
export const BULK_MOVE_UNDO_DURATION_MS = 6000
