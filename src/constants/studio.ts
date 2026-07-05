import type { AspectRatio } from '@/constants/config'

export const STUDIO_PROMPT_TEXTAREA_ID = 'studio-prompt-textarea' as const
export const STUDIO_PREFILL_PROMPT_STORAGE_KEY =
  'pixelvault:studio-prefill-prompt' as const

/**
 * Open-Image-Studio round-trip (canvas node ↔ Studio). The node writes a
 * HANDOFF (origin node id + prompt + reference images) before navigating to
 * Studio; Studio prefills from it and, on "回填", writes a RESULT (origin node
 * id + generated image url) and navigates back to the canvas, which applies it
 * to the origin node. Replaces the old one-way navigate-away dead-end.
 */
export const STUDIO_NODE_HANDOFF_STORAGE_KEY =
  'pixelvault:studio-node-handoff' as const
export const STUDIO_NODE_RESULT_STORAGE_KEY =
  'pixelvault:studio-node-result' as const
/** Cap reference images carried into Studio from a node handoff. */
export const STUDIO_NODE_HANDOFF_MAX_REFERENCES = 4 as const

export const STUDIO_IMAGE_ASPECT_RATIOS = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
] as const satisfies readonly AspectRatio[]

export const STUDIO_VIDEO_ASPECT_RATIOS = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
] as const satisfies readonly AspectRatio[]

export const STUDIO_CARD_SORT_OPTIONS = ['recent', 'created', 'name'] as const

// ── 空态起手势（2026-07-05 方案 A：示例 prompt + 最近作品 + 教程入口）──
/** 首次进入 Studio 自动弹一次教程后写入的标记；此后教程只从「?」入口打开。 */
export const STUDIO_GUIDE_SEEN_STORAGE_KEY =
  'pixelvault:studio-guide-seen' as const
/** 空态「继续创作」行最多展示的最近生成数。 */
export const STUDIO_EMPTY_RECENT_COUNT = 6
/** 空态示例 prompt chips 的 i18n 键位（每个模态各一组）。 */
export const STUDIO_EMPTY_EXAMPLE_KEYS = ['e1', 'e2', 'e3'] as const

// ── B5: Batch Variants ──────────────────────────────────────────
export const VARIANT_COUNT = 4
export const VARIANT_GRID_COLS = 2
export const VARIANT_MAX_SEED = 4294967295

// ── B4: Multi-Model Compare ────────────────────────────────────
export const COMPARE_MAX_MODELS = 3
