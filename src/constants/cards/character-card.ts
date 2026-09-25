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
  /** Maximum character cards selected simultaneously for generation */
  MAX_ACTIVE_CARDS: 5,
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
  /**
   * ── 卡片总线 v3（进度表 35，契约见 `docs/references/domains/cards.md`）──
   *
   * `@名字` 的稳定锚点：短、同一用户内唯一、与展示名解耦（展示名会改，锚点不能改）。
   * 角色卡与背景卡**共用一个 `@` 命名空间**。
   */
  HANDLE_MAX_LENGTH: 32,
  /** 给人看的简介。⛔ 任何面都不进 prompt（含助手）。 */
  SUMMARY_MAX_LENGTH: 500,
  /** 参考槽上限 = 旧的上传图（10）+ 精修图（5）两份列表合起来。 */
  MAX_REFERENCE_SLOTS: 15,
  /** `custom` 用途的槽必须自带一个名字。 */
  CUSTOM_SLOT_LABEL_MAX_LENGTH: 40,
  /** 这张图是怎么进卡的：用户上传 · 从某次生成收进来 · 精修挑出来的。 */
  REFERENCE_SLOT_ORIGINS: ['upload', 'generation', 'refine'] as const,
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

/** 参考槽的来路 */
export type CharacterReferenceSlotOrigin =
  (typeof CHARACTER_CARD.REFERENCE_SLOT_ORIGINS)[number]

/**
 * 卡上的扩展键袋（`extensions`）。
 *
 * ⭐ 每个键都要带命名空间（`<ns>.<name>`），`pv.` 归本产品；认不出的键**原样保留**，
 * ⛔ 任何服务端路径都不得重写或丢掉它。
 */
export const CARD_EXTENSIONS = {
  /** 本产品自己的命名空间前缀。 */
  OWN_NAMESPACE: 'pv',
  /** 一张卡最多几个扩展键。 */
  MAX_KEYS: 32,
  /** 键名最长多少字符。 */
  KEY_MAX_LENGTH: 64,
} as const
