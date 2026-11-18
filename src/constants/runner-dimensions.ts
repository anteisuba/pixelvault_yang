/**
 * Runner（ComfyUI）按比例出图的默认尺寸 —— 前端装配台预览与 Worker 出图请求共用这一张表。
 *
 * ⚠ 无 import 是有意的：`workers/execution` 用相对路径直接读本文件（同
 * `generation-errors.ts`），Worker 侧没有 `@/` 别名。
 *
 * 全部约 1MP：SDXL 系（Illustrious / Pony / NoobAI / Anima Pencil）与 DiT 系（Anima ·
 * Z-Image · Krea 2）的训练分辨率都在 ~1MP 一档。⛔ 别给 SDXL 系回到 1792×1024（≈1.8MP）
 * 那类通用尺寸——超出训练桶会出双头、肢体重复、构图散。
 */
export const RUNNER_NATIVE_DIMENSIONS = {
  '1:1': { width: 1024, height: 1024 },
  '16:9': { width: 1344, height: 768 },
  '9:16': { width: 768, height: 1344 },
  '4:3': { width: 1152, height: 864 },
  '3:4': { width: 864, height: 1152 },
} as const satisfies Record<string, { width: number; height: number }>

export type RunnerNativeAspectRatio = keyof typeof RUNNER_NATIVE_DIMENSIONS

/** 这个比例的 Runner 出图尺寸；表里没有的比例按 1:1 出。 */
export function getRunnerNativeDimensions(aspectRatio: string): {
  width: number
  height: number
} {
  return Object.hasOwn(RUNNER_NATIVE_DIMENSIONS, aspectRatio)
    ? RUNNER_NATIVE_DIMENSIONS[aspectRatio as RunnerNativeAspectRatio]
    : RUNNER_NATIVE_DIMENSIONS['1:1']
}

/**
 * 来源图尺寸超过它，多半是放大过的成品或超出训练桶（WAI 作者推荐的 1024×1344 ≈1.38MP
 * 仍在线内）——不能照它出图。
 */
export const RUNNER_NATIVE_MAX_PIXELS = 1_600_000
/** 超线的尺寸按原比例缩回这个面积（与上表同一档 ≈1MP）。 */
export const RUNNER_NATIVE_TARGET_PIXELS = 1024 * 1024
/** 缩回后对齐到 64（SDXL 训练桶的步长，也是 8 的倍数）。 */
const RUNNER_NATIVE_ALIGN = 64

/**
 * 把一个来源尺寸夹进 Runner 的原生档：线内原样返回；超线按原比例缩回 ≈1MP 并对齐 64。
 */
export function clampRunnerDimensionsToNative(
  width: number,
  height: number,
): { width: number; height: number } {
  if (width * height <= RUNNER_NATIVE_MAX_PIXELS) return { width, height }
  const scale = Math.sqrt(RUNNER_NATIVE_TARGET_PIXELS / (width * height))
  return {
    width:
      Math.round((width * scale) / RUNNER_NATIVE_ALIGN) * RUNNER_NATIVE_ALIGN,
    height:
      Math.round((height * scale) / RUNNER_NATIVE_ALIGN) * RUNNER_NATIVE_ALIGN,
  }
}
