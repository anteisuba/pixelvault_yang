import type { AspectRatio } from '@/constants/config'

export const STUDIO_PROMPT_TEXTAREA_ID = 'studio-prompt-textarea' as const

export const STUDIO_PREFILL_PROMPT_STORAGE_KEY =
  'pixelvault:studio-prefill-prompt' as const

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

/**
 * 标签台记自己的那一条（D10 ②「用户记住的模型按台分开记」）。两台的名单互不
 * 相交，共用一个键会让「上次用的」指向一个这一台根本列不出来的型号。
 */
export const STUDIO_LAST_TAGS_MODEL_STORAGE_KEY =
  'pixelvault:studio-last-tags-model' as const

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

/** 原生拖拽 MIME：画廊 / 舞台上的图（`useStudioDraggable`）。舞台与输入框认它，
 *  落下 = 加参考图；内容是 `{ url, id }` 的 JSON。 */
export const STUDIO_GENERATION_DRAG_MIME = 'application/x-studio-ref' as const
/** 原生拖拽 MIME：输入框参考图条里的缩略图，内容是图的 url。
 *  ⚠ 故意跟 `STUDIO_GENERATION_DRAG_MIME` 分开：舞台和输入框不认它，免得把同一张
 *  参考图再加一遍。 */
export const STUDIO_REFERENCE_DRAG_MIME =
  'application/x-antei-reference-image' as const
/** 桌面底部输入框：圆键被挡住时左边那行灰字停留多久（ms）。 */
export const STUDIO_BLOCKED_HINT_MS = 2600

/** 舞台上那块模板面板的 id（工具行「模板」chip 的 `aria-controls` 指它）。 */
export const STUDIO_TEMPLATES_PANEL_ID = 'studio-templates-panel'

/** 套用模板后「已套用 · 撤销」停留多久（指针停在上面时不计时）。 */
export const STUDIO_TEMPLATE_UNDO_MS = 5000
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
