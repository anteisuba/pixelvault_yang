import { VARIANT_MAX_SEED } from '@/constants/studio'

/**
 * 画布图片卡的种子（node-canvas-v2 §3 `⚙`）。锁住的种子存在 `params.advanced.seed`；
 * 一次多张时每张错开一位，⛔ 四张同一颗种子出四张一样的图。
 */

/** 🎲 换一个：落在服务端 `AdvancedParamsSchema.seed` 收的范围里。 */
export function randomImageSeed(): number {
  return Math.floor(Math.random() * (VARIANT_MAX_SEED + 1))
}

/** 第 `index` 张（0 起）用的种子：`seed + index`，越过上限绕回 0。 */
export function shotSeed(seed: number, index: number): number {
  return (seed + index) % (VARIANT_MAX_SEED + 1)
}
