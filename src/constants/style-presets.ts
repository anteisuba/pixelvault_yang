/**
 * Style presets for quick style switching.
 *
 * Each preset provides a prompt prefix and optional negative prompt
 * that are prepended/appended to the user's prompt to steer generation
 * toward a specific visual style.
 *
 * Presets compose with the card recipe system — they are additive,
 * not mutually exclusive with character/background/style cards.
 */

export interface StylePreset {
  /** Unique identifier */
  id: string
  /** i18n key under StylePresets namespace */
  messageKey: string
  /** Emoji icon for chip display */
  icon: string
  /** Prepended to user prompt */
  promptPrefix: string
  /** Appended as negative prompt guidance (model-dependent) */
  negativePrompt: string
}

export const STYLE_PRESETS = [
  {
    id: 'anime',
    messageKey: 'anime',
    icon: '\u{1F338}',
    promptPrefix:
      'anime style illustration, cel-shaded, vibrant colors, detailed linework,',
    negativePrompt:
      'photorealistic, 3d render, photograph, blurry, low quality',
  },
  {
    id: 'realistic',
    messageKey: 'realistic',
    icon: '\u{1F4F7}',
    promptPrefix:
      'photorealistic photograph, professional photography, natural lighting, sharp focus,',
    negativePrompt:
      'cartoon, anime, illustration, drawing, painting, low quality, blurry',
  },
  {
    id: 'illustration',
    messageKey: 'illustration',
    icon: '\u{1F3A8}',
    promptPrefix:
      'digital illustration, concept art, detailed artwork, artstation quality,',
    negativePrompt: 'photograph, photorealistic, blurry, low quality',
  },
  {
    id: 'watercolor',
    messageKey: 'watercolor',
    icon: '\u{1F4A7}',
    promptPrefix:
      'watercolor painting style, soft washes, fluid brushstrokes, paper texture,',
    negativePrompt:
      'digital art, photorealistic, sharp edges, 3d render, low quality',
  },
  {
    id: 'pixel',
    messageKey: 'pixel',
    icon: '\u{1F47E}',
    promptPrefix:
      'pixel art style, retro game aesthetic, crisp pixels, limited color palette, 16-bit,',
    negativePrompt:
      'photorealistic, smooth gradients, photograph, blurry, high resolution',
  },
  {
    id: 'cyberpunk',
    messageKey: 'cyberpunk',
    icon: '\u{1F916}',
    promptPrefix:
      'cyberpunk style, neon lights, futuristic cityscape, high-tech low-life, cinematic lighting,',
    negativePrompt:
      'natural, pastoral, bright daylight, cartoon, low quality, blurry',
  },
] as const satisfies readonly StylePreset[]

export type StylePresetId = (typeof STYLE_PRESETS)[number]['id']

export const getStylePresetById = (id: string): StylePreset | undefined =>
  STYLE_PRESETS.find((preset) => preset.id === id)

/** No style selected — user prompt is used as-is */
export const NO_STYLE_PRESET_ID = '' as const
