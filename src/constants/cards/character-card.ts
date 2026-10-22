/**
 * Character Card configuration constants
 */
export const CHARACTER_CARD = {
  /** Maximum length for character card name */
  NAME_MAX_LENGTH: 60,
  /** 外观文字（造型的 `description`）上限：旧的角色提示词并进来后最长的一位约 2000 字。 */
  DESCRIPTION_MAX_LENGTH: 2000,
  /** Maximum number of tags per card */
  MAX_TAGS: 20,
  /** Maximum length per tag */
  TAG_MAX_LENGTH: 30,
  /** Maximum character cards per user */
  MAX_CARDS_PER_USER: 100,
  /** 造型（角色④）：名字上限、每个角色最多几套、每套标签上限。 */
  LOOK_LABEL_MAX_LENGTH: 40,
  MAX_LOOKS_PER_CARD: 20,
  LOOK_TAG_MAX_LENGTH: 80,
  MAX_LOOK_TAGS: 60,
  /** Maximum character cards selected simultaneously for generation */
  MAX_ACTIVE_CARDS: 5,
  /**
   * ── 卡片总线 v3（进度表 35，契约见 `docs/references/domains/cards.md`）──
   *
   * `@名字` 的稳定锚点：短、同一用户内唯一、与展示名解耦（展示名会改，锚点不能改）。
   * 角色卡与背景卡**共用一个 `@` 命名空间**。
   */
  HANDLE_MAX_LENGTH: 32,
  /** 给人看的简介。⛔ 任何面都不进 prompt（含助手）。 */
  SUMMARY_MAX_LENGTH: 500,
  /** 一套造型最多几张参考图。 */
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

/**
 * 角色设定（`persona`）各格上限 —— `CharacterPersonaSchema` 与酒馆卡导入的截断读同一份
 * （导入时先截到这里再过 schema，⛔ 超长整卡拒收）。
 */
export const CHARACTER_PERSONA_LIMITS = {
  identity: 2000,
  behavior: 2000,
  speech: 2000,
  catchphraseChars: 120,
  catchphrases: 20,
  scenario: 2000,
  opening: 2000,
  examples: 10,
  exampleUserChars: 1000,
  exampleReplyChars: 2000,
  // owner 2026-10-15：酒馆卡的 description 常有一两万字，放宽到 3 万（助手那边另有自己的截断）。
  backstory: 30000,
} as const

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
  /** 本产品认得的键。 */
  KEYS: {
    /** 角色硬否定（一句负面）。 */
    negative: 'pv.negative',
    /** 作品手改值（角色页按作品分组；没有就从默认造型标签的括号里取，owner 09-26）。 */
    work: 'pv.work',
    /** 经历超长时存的总结 `{ hash, text }`（助手角色段用，服务端写，owner 10-15）。 */
    backstorySummary: 'pv.backstorySummary',
    /** 和这个角色聊天时你在故事里是谁（附录L 第二片 C，owner 10-16「按角色记住」）。 */
    chatUserRole: 'pv.chatUserRole',
  },
  /** 作品名最长多少字符。 */
  WORK_MAX_LENGTH: 60,
} as const
