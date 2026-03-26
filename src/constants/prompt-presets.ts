import type { AspectRatio } from '@/constants/config'
import { AI_MODELS } from '@/constants/models'

export interface PromptPreset {
  id: string
  /** i18n key under PromptPresets namespace */
  messageKey: string
  /** Suggested model to pair with this preset */
  suggestedModelId: AI_MODELS
  /** Suggested aspect ratio */
  aspectRatio: AspectRatio
  /** Prompt text (English, used as fallback) */
  prompt: string
}

export const PROMPT_PRESETS: PromptPreset[] = [
  {
    id: 'portrait',
    messageKey: 'portrait',
    suggestedModelId: AI_MODELS.FLUX_2_PRO,
    aspectRatio: '3:4',
    prompt:
      'Professional portrait photo of a young woman with natural lighting, soft bokeh background, shallow depth of field, warm golden hour tones',
  },
  {
    id: 'landscape',
    messageKey: 'landscape',
    suggestedModelId: AI_MODELS.GEMINI_FLASH_IMAGE,
    aspectRatio: '16:9',
    prompt:
      'Breathtaking mountain landscape at sunrise, mist rolling through the valley, dramatic clouds painted in orange and purple, cinematic wide angle',
  },
  {
    id: 'anime',
    messageKey: 'anime',
    suggestedModelId: AI_MODELS.NOVELAI_V45_FULL,
    aspectRatio: '3:4',
    prompt:
      '1girl, silver hair, blue eyes, school uniform, cherry blossom petals falling, soft lighting, detailed face, masterpiece, best quality',
  },
  {
    id: 'logo',
    messageKey: 'logo',
    suggestedModelId: AI_MODELS.IDEOGRAM_3,
    aspectRatio: '1:1',
    prompt:
      'Minimalist logo design for a coffee brand called "DAWN", clean lines, modern sans-serif typography, warm earth tones, white background',
  },
  {
    id: 'cinematic',
    messageKey: 'cinematic',
    suggestedModelId: AI_MODELS.SEEDREAM_45,
    aspectRatio: '16:9',
    prompt:
      'Cinematic still from a sci-fi film, lone astronaut standing on an alien planet, two moons in the sky, volumetric lighting, anamorphic lens flare',
  },
]
