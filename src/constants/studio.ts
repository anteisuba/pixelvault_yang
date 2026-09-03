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

/**
 * 图片工作台「上次使用的模型」——记的是 `StudioModelOption.optionId`
 * （`workspace:<modelId>` 或 `key:<keyId>`），不是裸 modelId：同一型号在不同
 * 渠道上是两条不同的路由，只记型号会把用户选的渠道丢掉。
 *
 * owner 2026-09-03 拍板：`/studio/image` 不许以空模型起手 —— 先读这条记录，
 * 读不到再按「已配置 key 的最便宜图片模型」兜底，两条都不成立才留空态。
 * ⚠ 只服务图片档；视频/音频的默认值不受影响。
 */
export const STUDIO_LAST_IMAGE_MODEL_STORAGE_KEY =
  'pixelvault:studio-last-image-model' as const

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

// ── 助手右侧 dock（施工基准 docs/references/pages/assistant-shell.md）──
/**
 * The Studio composer keeps a user-resizable assistant. Canvas intentionally
 * uses a fixed rail, so this preference remains Studio-only.
 */
export const STUDIO_ASSISTANT_DOCK_RESIZE = {
  defaultWidthPx: 360,
  minWidthPx: 320,
  maxWidthPx: 720,
  widthStepPx: 20,
  handleThicknessPx: 6,
  storageKey: 'pixelvault.studio.assistantDock.layout.v2',
} as const

/** Pragmatic DnD payload type for prompt-area reference strip thumbnails.
 *  Distinct from 'studio-generation' so the canvas drop target (which would
 *  re-add the same reference) ignores strip drags; only the assistant dock
 *  accepts both. */
export const STUDIO_REFERENCE_DRAG_TYPE = 'studio-reference-image' as const
/** Max recent image assets shown in the assistant composer's image popover. */
export const STUDIO_ASSISTANT_RECENT_ASSETS = 8

// ── B5: Batch Variants ──────────────────────────────────────────
/**
 * 一次生成几张。三档 1 / 2 / 4 与画布
 * (`NODE_STUDIO_GENERATE_COMPOSER.batchCounts`) 及音效
 * (`SFX_VARIANT_COUNTS`) 逐字相同 —— 同一个「一次出几个」的问题，三个界面
 * 不给三种答案。
 *
 * ⚠ 上限 4 的依据**不是** provider 的单请求出图数：本项目没有「一次请求出
 * N 张」这条路，每一张都是一次独立请求配一个独立 seed（见
 * `use-unified-generate.ts` 的 `generateVariants`；画布 07-28 的注释也记了
 * 同一件事）。真正的天花板是 `PLATFORM_GENERATION_GUARD
 * .MAX_ACTIVE_JOBS_PER_USER`（4，且只管平台出资的请求，BYOK 不受限）。
 * 平台出资时 ×4 正好顶满，用户在别处已有在跑的任务会让其中几张吃 429 ——
 * 变体网格逐格显示失败，不静默吞。
 * → 想加第四档先量那个数，两者必须一起动；单独放宽这里只会多出必失败的格子。
 */
export const IMAGE_BATCH_COUNTS = [1, 2, 4] as const
export type ImageBatchCount = (typeof IMAGE_BATCH_COUNTS)[number]
export const DEFAULT_IMAGE_BATCH_COUNT: ImageBatchCount = 1

/**
 * 收窄一个来路不明的数字到受支持的档位。
 *
 * ⚠ **守卫从 `IMAGE_BATCH_COUNTS` 直接读**，别在调用点抄一份 `[1,2,4]` ——
 * 上面那段注释说得很清楚，这三个数还连着 `MAX_ACTIVE_JOBS_PER_USER`，抄出去的
 * 副本不会跟着一起动。
 *
 * 调用方：助手 `[[setup]]` 块的 `batchCount`（模型可以吐任何数字）。
 */
export function isImageBatchCount(value: number): value is ImageBatchCount {
  return (IMAGE_BATCH_COUNTS as readonly number[]).includes(value)
}
export const VARIANT_GRID_COLS = 2
export const VARIANT_MAX_SEED = 4294967295

// ── B4: Multi-Model Compare ────────────────────────────────────
export const COMPARE_MAX_MODELS = 3
