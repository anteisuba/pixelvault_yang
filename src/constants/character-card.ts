/**
 * Character Card configuration constants
 */
export const CHARACTER_CARD = {
  /** Maximum length for character card name */
  NAME_MAX_LENGTH: 60,
  /** Maximum length for variant label */
  VARIANT_LABEL_MAX_LENGTH: 40,
  /** Maximum length for description */
  DESCRIPTION_MAX_LENGTH: 500,
  /** Maximum number of tags per card */
  MAX_TAGS: 20,
  /** Maximum length per tag */
  TAG_MAX_LENGTH: 30,
  /** Maximum character cards per user */
  MAX_CARDS_PER_USER: 100,
  /** Maximum variants per parent card */
  MAX_VARIANTS_PER_CARD: 20,
  /** Maximum source images uploaded per card */
  MAX_SOURCE_IMAGES: 10,
  /** Maximum reference images stored per card */
  MAX_REFERENCE_IMAGES: 5,
  /** Score threshold (0-1) to consider a character card stable */
  STABILITY_THRESHOLD: 0.75,
  /** Maximum iterations for prompt refinement loop */
  MAX_REFINEMENT_ITERATIONS: 10,
  /** Number of models to test per refinement iteration */
  REFINEMENT_MODELS_PER_ITERATION: 3,
  /** Status options for character cards */
  STATUSES: ['DRAFT', 'REFINING', 'STABLE', 'ARCHIVED'] as const,
  /** Source image view types (for 3D model multi-angle references) */
  VIEW_TYPES: [
    'front',
    'side',
    'back',
    'top',
    'three_quarter',
    'detail',
    'other',
  ] as const,
} as const

/** Character card status type */
export type CharacterCardStatus = (typeof CHARACTER_CARD.STATUSES)[number]

/** Source image view type */
export type SourceImageViewType = (typeof CHARACTER_CARD.VIEW_TYPES)[number]
