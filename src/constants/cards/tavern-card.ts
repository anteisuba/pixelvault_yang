/**
 * 酒馆（SillyTavern）角色卡导入（2026-10-14，附录J ⑥）。
 *
 * 规范：Character Card V2 / V3（PNG 里一个 tEXt 块装 base64 的 JSON；V3 写 `ccv3`，
 * V2 / V1 写 `chara`；也有直接给 .json 的）。
 * https://github.com/kwaroran/character-card-spec-v3/blob/main/SPEC_V3.md
 */
export const TAVERN_CARD = {
  /** PNG 里装卡的 tEXt 关键字，按优先级（V3 在前，同一张卡常两个都写）。 */
  PNG_KEYWORDS: ['ccv3', 'chara'],
  SPEC_V2: 'chara_card_v2',
  SPEC_V3: 'chara_card_v3',
  /**
   * 导入文件上限。⚠ 走 JSON + base64（与角色卡上传图同一条路），Vercel 函数请求体
   * 4.5 MB，base64 膨胀 4/3 —— 3 MB 的文件发出去约 4 MB。
   */
  MAX_FILE_BYTES: 3 * 1024 * 1024,
  /** 文件名最长多少字（只用来报错时说是哪一个）。 */
  FILE_NAME_MAX_LENGTH: 200,
  /**
   * 卡上我们没有对应格子的那几样原样存进这一个扩展键（世界书、卡自带的系统提示词、
   * 「历史之后的指令」、备选开场白……）。⛔ 不注入：卡覆盖系统提示是安全问题。
   */
  EXTENSION_KEY: 'st.card',
  /** 备选开场白最多留几条。 */
  MAX_ALTERNATE_GREETINGS: 20,
} as const

/** 导入失败的几种原因（前端按 `i18nKey` 说人话，`Errors.tavernCard.*`）。 */
export const TAVERN_CARD_IMPORT_ERRORS = {
  notACard: {
    code: 'TAVERN_CARD_NOT_A_CARD',
    httpStatus: 422,
    i18nKey: 'errors.tavernCard.notACard',
    message: 'This file is not a SillyTavern character card.',
  },
  tooLarge: {
    code: 'TAVERN_CARD_TOO_LARGE',
    httpStatus: 413,
    i18nKey: 'errors.tavernCard.tooLarge',
    message: 'The character card file is too large.',
  },
  limitReached: {
    code: 'TAVERN_CARD_LIMIT_REACHED',
    httpStatus: 409,
    i18nKey: 'errors.tavernCard.limitReached',
    message: 'Character card limit reached.',
  },
} as const
