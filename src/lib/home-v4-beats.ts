import {
  HOME_V4_BEATS,
  HOME_V4_FN_AUDIO_LINES,
  HOME_V4_FN_IMAGE_MODELS,
  HOME_V4_FN_LORA_MOUNTS,
  HOME_V4_FN_LORA_OUTS,
  HOME_V4_FN_VAULT_CELLS,
  HOME_V4_FN_VIDEO_REFS,
} from '@/constants/homepage-v4'

/**
 * 首页长卷（v5）六段演示的**求值器**。
 *
 * 每段拿到一个 `progress`（0–1，滚动喂进来），返回那一刻该画成什么样。
 * 纯函数、无副作用、不碰 DOM —— 所以「段在 0.3 时长什么样」是可以被测试钉住
 * 的事实，而不是要靠肉眼在真机上数拍子。
 *
 * ⚠ 这里**不许出现毫秒**。时间线已经删掉了：段走多快由读者的滚轮决定。关键帧
 * 表本身住在 `HOME_V4_BEATS`，这个文件只负责按表求值。
 *
 * 返回的都是「已经落位的个数」或「开关」——组件据此加 class，CSS 只动
 * `opacity` / `transform` / `clip-path`，元素全部预渲染。⛔ 任何一段都不靠
 * 「加一行 DOM」来表现进度：那是布局变化，滚一下就要重排一次。
 */

/** 区间：`[起点, 终点]`，两端都是段内进度。 */
type Span = readonly [number, number]

/** 把任意数收进 0–1。`NaN` 归 0——进度算不出来时宁可停在空态。 */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

/** 段内进度落在区间里的比例（区间外分别是 0 与 1）。 */
export function spanAt(progress: number, [from, to]: Span): number {
  if (to <= from) return progress >= to ? 1 : 0
  return clamp01((progress - from) / (to - from))
}

/**
 * 一批 `total` 个元素在区间里依次落位，返回已经落位的个数。
 *
 * 第 i 个（0 起）在区间的 `i / total` 处落位，所以区间起点当场落下第一个，
 * 区间终点全部落齐。
 */
export function countAt(progress: number, span: Span, total: number): number {
  const t = spanAt(progress, span)
  if (t <= 0) return 0
  return Math.min(total, Math.floor(t * total) + 1)
}

/** 过了阈值就是 true。阈值本身算过。 */
export function flagAt(progress: number, at: number): boolean {
  return progress >= at
}

/* ── 01 图片 ─────────────────────────────────────────────────────── */

export interface HomeV4ImageBeats {
  /** 已经写出来的 prompt 比例（0–1），乘以字数就是要画的那一截。 */
  typed: number
  /** 四宫格里已经揭开的格数。 */
  tiles: number
  /** 结果态：「去用这个」亮起。 */
  cta: boolean
}

export function homeV4ImageBeats(progress: number): HomeV4ImageBeats {
  const p = clamp01(progress)
  return {
    typed: spanAt(p, HOME_V4_BEATS.image.type),
    tiles: countAt(
      p,
      HOME_V4_BEATS.image.tiles,
      HOME_V4_FN_IMAGE_MODELS.length,
    ),
    cta: flagAt(p, HOME_V4_BEATS.image.cta),
  }
}

/* ── 02 LoRA ─────────────────────────────────────────────────────── */

const LORA_TRIGGERS = HOME_V4_FN_LORA_MOUNTS.filter(
  (mount) => mount.trigger,
).length

export interface HomeV4LoraBeats {
  /** 已挂上机架的 LoRA 数。 */
  mounted: number
  /** 已经弹进 prompt 行的触发词数。 */
  triggers: number
  /** 已经揭开的对照图数。 */
  outs: number
  cta: boolean
}

export function homeV4LoraBeats(progress: number): HomeV4LoraBeats {
  const p = clamp01(progress)
  return {
    mounted: countAt(
      p,
      HOME_V4_BEATS.lora.mounts,
      HOME_V4_FN_LORA_MOUNTS.length,
    ),
    triggers: countAt(p, HOME_V4_BEATS.lora.triggers, LORA_TRIGGERS),
    outs: countAt(p, HOME_V4_BEATS.lora.outs, HOME_V4_FN_LORA_OUTS.length),
    cta: flagAt(p, HOME_V4_BEATS.lora.cta),
  }
}

/* ── 03 声音 ─────────────────────────────────────────────────────── */

export interface HomeV4AudioBeats {
  /** 已经落位的气泡数。 */
  arrived: number
  /** 已经把波形画出来的条数。 */
  played: number
  /** 底部输入行就绪。 */
  compose: boolean
  cta: boolean
}

export function homeV4AudioBeats(progress: number): HomeV4AudioBeats {
  const p = clamp01(progress)
  const total = HOME_V4_FN_AUDIO_LINES.length
  return {
    arrived: countAt(p, HOME_V4_BEATS.audio.lines, total),
    played: countAt(p, HOME_V4_BEATS.audio.waves, total),
    compose: flagAt(p, HOME_V4_BEATS.audio.compose),
    cta: flagAt(p, HOME_V4_BEATS.audio.cta),
  }
}

/* ── 04 视频 ─────────────────────────────────────────────────────── */

export interface HomeV4VideoBeats {
  /** 已经落进输入框的参考胶囊数。 */
  pills: number
  /** 已经写出来的 brief 比例（0–1）。 */
  typed: number
  /** 发送键亮起。 */
  send: boolean
  /** 成片揭开。 */
  out: boolean
  cta: boolean
}

export function homeV4VideoBeats(progress: number): HomeV4VideoBeats {
  const p = clamp01(progress)
  return {
    pills: countAt(p, HOME_V4_BEATS.video.pills, HOME_V4_FN_VIDEO_REFS.length),
    typed: spanAt(p, HOME_V4_BEATS.video.type),
    send: flagAt(p, HOME_V4_BEATS.video.send),
    out: flagAt(p, HOME_V4_BEATS.video.out),
    cta: flagAt(p, HOME_V4_BEATS.video.cta),
  }
}

/* ── 05 画布 ─────────────────────────────────────────────────────── */

/** 三个步骤 → 0…2 的浮点位置，半步就是交接中。 */
export const HOME_V4_CANVAS_LAST_STEP = 2

export interface HomeV4CanvasBeats {
  /** 0–2 的浮点步位；整数处是坐稳的那一步。 */
  step: number
  /** 成片可以放了。 */
  cut: boolean
  cta: boolean
}

export function homeV4CanvasBeats(progress: number): HomeV4CanvasBeats {
  const p = clamp01(progress)
  const step = spanAt(p, HOME_V4_BEATS.canvas.steps) * HOME_V4_CANVAS_LAST_STEP
  return {
    step,
    cut: step >= HOME_V4_BEATS.canvas.cutAtStep,
    cta: flagAt(p, HOME_V4_BEATS.canvas.cta),
  }
}

/**
 * 反解：要让画布停在第 `index` 步，段内进度得是多少。
 *
 * 步骤按钮和键盘跳步用它——按钮跳的是**进度**，页面照旧只有一个进度源，
 * 不会出现「按钮一套状态、滚动另一套状态」。
 */
export function homeV4CanvasProgressForStep(index: number): number {
  const [from, to] = HOME_V4_BEATS.canvas.steps
  const ratio = clamp01(index / HOME_V4_CANVAS_LAST_STEP)
  return from + ratio * (to - from)
}

/* ── 06 资源库 ───────────────────────────────────────────────────── */

const VAULT_ARRIVALS = HOME_V4_FN_VAULT_CELLS.filter(
  (cell) => cell.arrival,
).length
const VAULT_REST = HOME_V4_FN_VAULT_CELLS.length - VAULT_ARRIVALS

export interface HomeV4VaultBeats {
  /** 上面几段刚做出来的东西，落进库里的个数。 */
  arrivals: number
  /** 其余库存涌进来的个数。 */
  rest: number
  /** 角色锚被选中、亮起。 */
  lift: boolean
  /**
   * 复用位被填满的比例（0–1）。⚠ 这是连续量而不是开关：飞递 ghost 已经删掉，
   * 「被拿去复用」现在是 clip-path 揭开，可以随滚动来回。
   */
  slot: number
  cta: boolean
}

export function homeV4VaultBeats(progress: number): HomeV4VaultBeats {
  const p = clamp01(progress)
  return {
    arrivals: countAt(p, HOME_V4_BEATS.vault.arrivals, VAULT_ARRIVALS),
    rest: countAt(p, HOME_V4_BEATS.vault.rest, VAULT_REST),
    lift: flagAt(p, HOME_V4_BEATS.vault.lift),
    slot: spanAt(p, HOME_V4_BEATS.vault.slot),
    cta: flagAt(p, HOME_V4_BEATS.vault.cta),
  }
}

/* ── 开场 ────────────────────────────────────────────────────────── */

export interface HomeV4OpeningBeats {
  /** 作品墙向两侧散开的量（0–1，乘 `spreadVw` 就是最外列的位移）。 */
  spread: number
  /** 标题与副文的不透明度。 */
  copyOpacity: number
}

export function homeV4OpeningBeats(progress: number): HomeV4OpeningBeats {
  const p = clamp01(progress)
  return {
    spread: p,
    copyOpacity: 1 - spanAt(p, HOME_V4_BEATS.opening.fade),
  }
}

/** 一段演示需要的全部拍子，按段 id 取。 */
export const HOME_V4_BEAT_EVALUATORS = {
  image: homeV4ImageBeats,
  lora: homeV4LoraBeats,
  audio: homeV4AudioBeats,
  video: homeV4VideoBeats,
  canvas: homeV4CanvasBeats,
  vault: homeV4VaultBeats,
  opening: homeV4OpeningBeats,
} as const
