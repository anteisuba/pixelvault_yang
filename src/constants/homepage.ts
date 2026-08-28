import { getAvailableModels, getProviderGroup } from '@/constants/models'
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
 * message files, and it drifted: it read "36 MODELS" while a list further down
 * the same page counted `getAvailableModels()` and rendered 45 — two
 * contradicting numbers on one screen. Anything the homepage claims about the
 * catalogue is derived here instead, never typed into the copy.
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

export const HOMEPAGE_METADATA = {
  title: 'PixelVault | Personal AI Gallery',
  description:
    'Generate with multiple AI image models, then archive every result in one personal gallery.',
} as const

/**
 * Provider wordmarks for the marquee that closes the opening page. Plain text
 * on purpose — logo files would be the second visual system on a page whose
 * whole premise is that typography is the only one.
 */
export const HOMEPAGE_PROVIDERS = [
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
