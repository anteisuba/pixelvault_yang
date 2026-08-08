import {
  AI_MODELS,
  getAvailableModels,
  getProviderGroup,
} from '@/constants/models'
import { getModelUnitPrice } from '@/constants/models/unit-prices'
import { ROUTES } from '@/constants/routes'
import type { OutputType } from '@/types'

const AVAILABLE_HOMEPAGE_MODELS = getAvailableModels()

function countAvailableModels(outputType: OutputType): number {
  return AVAILABLE_HOMEPAGE_MODELS.filter(
    (model) => model.outputType === outputType,
  ).length
}

function countDistinct<T>(values: readonly T[]): number {
  return new Set(values).size
}

/**
 * Every number the page says out loud, counted from the live catalog.
 *
 * The hero used to state its three figures as a literal string in all three
 * message files. It read "36 MODELS" while the rails below it, which have always
 * counted `getAvailableModels()`, rendered 45 — two contradicting numbers on one
 * page. Anything the homepage claims about the catalog is derived here instead.
 *
 * Providers are counted as provider *groups*, not adapters: MiniMax's two
 * stations are one company behind one label, and counting them twice would
 * inflate the claim (see `getProviderGroup`).
 */
export const HOMEPAGE_MODEL_COUNTS = {
  total: AVAILABLE_HOMEPAGE_MODELS.length,
  image: countAvailableModels('IMAGE'),
  video: countAvailableModels('VIDEO'),
  audio: countAvailableModels('AUDIO'),
  model3d: countAvailableModels('MODEL_3D'),
  providers: countDistinct(
    AVAILABLE_HOMEPAGE_MODELS.map((model) =>
      getProviderGroup(model.adapterType),
    ),
  ),
  modalities: countDistinct(
    AVAILABLE_HOMEPAGE_MODELS.map((model) => model.outputType),
  ),
} as const

export type HomepageModelPricingUnit = 'image' | 'second' | 'kchars'

export interface HomepageModelReferencePrice {
  amount: number
  unit: HomepageModelPricingUnit
}

/**
 * 首页展示价 —— **只放 `MODEL_UNIT_PRICES` 没覆盖到的那些**。
 *
 * ⚠ 2026-08-08 owner 拍板：首页从 `constants/models/unit-prices.ts` 派生，口径
 * 「**按产品默认档**」（哪个开关默认开就报哪个价）。当前目录里 12 个有价视频模型
 * **全部** `generateAudio: true`，所以默认档恰好等于 unit-prices 已有的含音频口径，
 * 不需要再存第二个数字 —— 哪天出现默认关音频的模型，才需要在那边加一列。
 *
 * 起因是这张表在**低报**：Seedance 2.0 标 $0.1/s，火山官方算例换算是 $0.3 档，
 * 低了 3 倍。一个数字两个来源必然漂，所以重复的那 8 条已经删了，取值统一走
 * `resolveHomepageReferencePrice`。
 *
 * 这里剩下的是 unit-prices 还没核实的模型（图片/音频那批）。**补价格请补到
 * unit-prices**，别往这张表加新条目 —— 它只是还没搬完的存量。
 */
export const HOMEPAGE_MODEL_REFERENCE_PRICES: Partial<
  Record<AI_MODELS, HomepageModelReferencePrice>
> = {
  [AI_MODELS.OPENAI_GPT_IMAGE_2]: { amount: 0.04, unit: 'image' },
  [AI_MODELS.GEMINI_PRO_IMAGE]: { amount: 0.039, unit: 'image' },
  [AI_MODELS.GEMINI_FLASH_IMAGE]: { amount: 0.039, unit: 'image' },
  [AI_MODELS.FLUX_2_PRO]: { amount: 0.04, unit: 'image' },
  [AI_MODELS.FLUX_2_FLASH]: { amount: 0.005, unit: 'image' },
  [AI_MODELS.FLUX_KONTEXT_MAX]: { amount: 0.08, unit: 'image' },
  [AI_MODELS.IDEOGRAM_3]: { amount: 0.06, unit: 'image' },
  [AI_MODELS.RECRAFT_V4_PRO]: { amount: 0.21, unit: 'image' },
  [AI_MODELS.SEEDREAM_45]: { amount: 0.04, unit: 'image' },
  [AI_MODELS.SEEDREAM_50_PRO]: { amount: 0.0675, unit: 'image' },
  [AI_MODELS.SEEDREAM_50_LITE]: { amount: 0.035, unit: 'image' },
  [AI_MODELS.NOVELAI_V45_FULL]: { amount: 0.012, unit: 'image' },
  [AI_MODELS.NOVELAI_V45_CURATED]: { amount: 0.012, unit: 'image' },
  [AI_MODELS.ILLUSTRIOUS_XL]: { amount: 0.003, unit: 'image' },
  [AI_MODELS.FISH_AUDIO_S2_PRO]: { amount: 0.2, unit: 'kchars' },
  [AI_MODELS.ELEVENLABS_MUSIC_V2]: { amount: 0.15, unit: 'second' },
  [AI_MODELS.FLUX_2_PRO_EDIT]: { amount: 0.05, unit: 'image' },
  [AI_MODELS.LTX_23]: { amount: 0.06, unit: 'second' },
}

/**
 * 首页取价的唯一入口：先问 `unit-prices`（一个真相），它没有的才退回上面的存量表。
 * 两边都没有 → null，调用方显示「价格因型号而异」而不是编一个数。
 */
export function resolveHomepageReferencePrice(
  modelId: AI_MODELS,
): HomepageModelReferencePrice | null {
  const authoritative = getModelUnitPrice(modelId)
  if (authoritative) {
    return { amount: authoritative.amount, unit: authoritative.unit }
  }
  return HOMEPAGE_MODEL_REFERENCE_PRICES[modelId] ?? null
}

export function formatHomepageReferencePriceAmount(amount: number): string {
  if (amount >= 1) return `$${amount.toFixed(2)}`
  if (amount >= 0.01) return `$${amount.toFixed(2)}`
  return `$${amount.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}`
}

export const HOMEPAGE_METADATA = {
  title: 'PixelVault | Personal AI Gallery',
  description:
    'Generate with multiple AI image models, then archive every result in one personal gallery.',
} as const

/** `models` / `pricing` are gone with the v2 nav — v3 has no in-page anchors. */
export const HOMEPAGE_ROUTES = {
  home: ROUTES.HOME,
  gallery: ROUTES.GALLERY,
  signIn: ROUTES.SIGN_IN,
  signUp: ROUTES.SIGN_UP,
  studio: ROUTES.STUDIO,
} as const

/* ── v3 marketing home (see docs/references/pages/home.md §A) ────────────── */

/**
 * The strip directly under the v3 headline. Real archive results, not art
 * direction: the page carries no brand colour of its own, so every colour on
 * the first screen comes from these. Ten is the desktop count; narrower
 * viewports hide the tail (see `home-v3.css`).
 */
export const HOME_V3_STRIP = [
  {
    id: 'stripLunaMoth',
    src: '/homepage/production/hero/hero-01-luna-moth.webp',
  },
  {
    id: 'stripDesertObservatory',
    src: '/homepage/production/hero/hero-02-desert-observatory.webp',
  },
  {
    id: 'stripBlackClay',
    src: '/homepage/production/hero/hero-03-black-clay.webp',
  },
  {
    id: 'stripRisographLaundry',
    src: '/homepage/production/hero/hero-04-risograph-laundry.webp',
  },
  {
    id: 'stripFrostFlower',
    src: '/homepage/production/hero/hero-05-frost-flower.webp',
  },
  {
    id: 'stripWatchRobot',
    src: '/homepage/production/hero/hero-06-watch-robot.webp',
  },
  {
    id: 'stripSnowTrain',
    src: '/homepage/production/hero/hero-07-snow-train.webp',
  },
  {
    id: 'stripGlacialRiver',
    src: '/homepage/production/hero/hero-08-glacial-river.webp',
  },
  {
    id: 'stripRubyChair',
    src: '/homepage/production/hero/hero-09-ruby-chair.webp',
  },
  {
    id: 'stripCenoteDiver',
    src: '/homepage/production/hero/hero-10-cenote-diver.webp',
  },
] as const

/**
 * Provider wordmarks for the marquee that closes the first screen. Plain text
 * on purpose — logo files would be the second visual system on a page whose
 * whole premise is that typography is the only one.
 */
export const HOME_V3_PROVIDERS = [
  'OpenAI',
  'Google Gemini',
  'fal.ai',
  'NovelAI',
  'ByteDance Seedream',
  'ElevenLabs',
  'Fish Audio',
  'Replicate',
  'Hyper3D Rodin',
  'Runway',
  'Black Forest Labs',
  'Hugging Face',
] as const

/** Footer link columns. `items` keys resolve under `Homepage.foot.cols.*`. */
export const HOME_V3_FOOTER_COLS = [
  {
    id: 'product',
    hrefs: [
      ROUTES.STUDIO_NODE,
      ROUTES.STUDIO,
      ROUTES.STUDIO,
      ROUTES.ASSETS,
      ROUTES.GALLERY,
    ],
  },
  { id: 'resources', hrefs: ['#', '#', '#', '#'] },
  { id: 'company', hrefs: ['#', '#', '#'] },
] as const
