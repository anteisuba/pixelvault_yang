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
   * 卡库建卡递上来的整张卡（序列化后）上限。⚠ 那一条走 JSON 请求体，Vercel 函数请求体
   * 4.5 MB 封顶。文件导入不走这条，见 `UPLOAD_MAX_BYTES`。
   */
  MAX_FILE_BYTES: 3 * 1024 * 1024,
  /**
   * 文件导入的上限（owner 2026-10-28：chub 的高清立绘卡常过 3 MB）。文件由浏览器直传 R2
   * （预签名 PUT），⛔ 经过 Vercel 函数，所以不受 4.5 MB 请求体限制；服务端从 R2 读回来拆卡。
   */
  UPLOAD_MAX_BYTES: 20 * 1024 * 1024,
  /** 直传的卡先落在这里，按用户分；导入一读完（成没成）就删。 */
  UPLOAD_KEY_PREFIX: 'tavern-imports',
  /** 直传只收这两种。 */
  UPLOAD_MIME_TYPES: ['image/png', 'application/json'],
  /** 文件名最长多少字（只用来报错时说是哪一个）。 */
  FILE_NAME_MAX_LENGTH: 200,
  /**
   * 卡上我们没有对应格子的那几样原样存进这一个扩展键（世界书、卡自带的系统提示词、
   * 「历史之后的指令」、备选开场白……）。
   * ⚠ 卡自带的系统提示词 / 历史之后的指令**会注入**，只在「和她聊」里（owner 10-29 ⛔ 进工作台）：
   *   系统提示词作为「卡作者的备注」一段放进我们自己的系统提示（`features/assistant/prompt.ts`
   *   chatCardSection），历史之后的指令接在最新一句后面；两者都 ⛔ 覆盖我们的系统提示、工具规则、
   *   确认与创作者的规矩。世界书按关键词命中才进。
   */
  EXTENSION_KEY: 'st.card',
  /** 备选开场白最多留几条。 */
  MAX_ALTERNATE_GREETINGS: 20,
  /**
   * 导入时整张原卡 JSON 原样留一份（`st.card.raw`，11-18）：我们没拆的键日后还能找回、能原样导出。
   * 序列化后超过这个数就去掉最大的那块（`character_book`，它已经另存在 `characterBook`）再存，
   * 并标 `rawTruncated`；去掉还超就不留原卡、只标 `rawTruncated`。
   * ⚠ 原卡 ⛔ 下发给浏览器（卡列表一次几十张），服务端合并扩展键时替客户端留着它。
   */
  RAW_MAX_BYTES: 256 * 1024,
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
  uploadMissing: {
    code: 'TAVERN_CARD_UPLOAD_MISSING',
    httpStatus: 422,
    i18nKey: 'errors.tavernCard.uploadMissing',
    message: 'The uploaded character card file could not be read.',
  },
  limitReached: {
    code: 'TAVERN_CARD_LIMIT_REACHED',
    httpStatus: 409,
    i18nKey: 'errors.tavernCard.limitReached',
    message: 'Character card limit reached.',
  },
} as const
