import { AI_MODELS } from '@/constants/models/enum'

export const CARDIFY = {
  /** Default model for cardification — Gemini Flash Image (img2img-capable). */
  DEFAULT_MODEL_ID: AI_MODELS.GEMINI_FLASH_IMAGE,

  /** Portrait aspect for character cards. */
  ASPECT_RATIO: '3:4' as const,

  /**
   * Cardify prompt — neutral dark gray studio backdrop, isolated subject,
   * preserves character identity. See docs/product/roadmap.md → Cardify.
   */
  PROMPT: [
    'Render this character as a costume display card.',
    'Plain neutral dark gray studio background (#2a2a2a), full bleed, no environment, no props.',
    'Subject isolated and centered, full body or three-quarter view, neutral pose.',
    'Soft even studio lighting, subtle ground shadow, crisp clean outline.',
    'No text, no watermark, no logo. Photorealistic clean cutout aesthetic.',
    "Preserve the character's identity, face, hairstyle, outfit, accessories, and proportions exactly as in the reference image.",
  ].join(' '),
} as const
