/**
 * 角色出门逛（第 4 批「人味」，owner 2026-10-28）：每张开了开关的角色卡每天按自己的人设逛一次，
 * 看到的东西用她的口吻写成见闻（`CharacterFinding`）。⛔ 不进素材库；花的是 owner 自己的 key。
 */
export const CHARACTER_BROWSE_SOURCE_IDS = {
  bilibili: 'bilibili',
  danbooru: 'danbooru',
  civitai: 'civitai',
  /** X 上的帖子：只在助手用 Grok 时搜得到（Grok 自带 X 搜索）。 */
  x: 'x',
  web: 'web',
} as const

export const CHARACTER_BROWSE_SOURCES = [
  CHARACTER_BROWSE_SOURCE_IDS.bilibili,
  CHARACTER_BROWSE_SOURCE_IDS.danbooru,
  CHARACTER_BROWSE_SOURCE_IDS.civitai,
  CHARACTER_BROWSE_SOURCE_IDS.x,
  CHARACTER_BROWSE_SOURCE_IDS.web,
] as const

export type CharacterBrowseSource = (typeof CHARACTER_BROWSE_SOURCES)[number]

export const CHARACTER_BROWSE = {
  /** 最近这么多天和她聊过（或她是现在的助手人设）才去逛。 */
  recentDays: 7,
  /** 同一张卡两次逛至少隔这么久（Hobby 的定时任务落点会漂一小时）。 */
  minIntervalMs: 20 * 60 * 60 * 1000,
  /** 一次逛最多想几个搜索词。 */
  maxQueries: 5,
  /**
   * 三级漏斗（owner 2026-10-28：看多少决定花多少，记多少决定好不好）：
   * ① 广撒网：每个搜索词留 `perQueryItems` 样、一共最多 `candidatePool` 样，只调搜索接口；
   * ② 文字初筛：一次纯文字调用从里面挑 `screenPick` 样细看，同一来源最多 `perSourcePick` 样；
   * ③ 带图细看：只这几样带图（和弹幕 / 评论）看，最多记 `keepMax` 条见闻。
   */
  perQueryItems: 8,
  candidatePool: 30,
  screenPick: 8,
  perSourcePick: 3,
  keepMax: 5,
  /** 细看时每样带几条最热的弹幕 / 评论（只喂模型，⛔ 存原文）。 */
  danmakuTop: 20,
  commentsTop: 8,
  /** 每张卡最多留几条见闻，超了删最旧的。 */
  keepFindings: 200,
  /** 每天那一趟，一个人最多带几张卡出门（卡多了轮着来，最久没出门的先）。 */
  cardsPerUserPerDay: 3,
  /** 见闻那句笔记的长度上限。 */
  noteChars: 200,
  /** 人设交给模型时截到多少字。 */
  personaChars: 1200,
  /** 告诉模型最近已经看过什么（免得天天搜同一样），带几条标题。 */
  recentTitles: 20,
  /** 单次模型调用的时限。 */
  callTimeoutMs: 60_000,
  /** B 站只留具体的视频页（`/video/BV…` 或 `/video/av…`）；网搜退路偶尔回搜索结果页。 */
  bilibiliVideoUrl: /bilibili\.com\/video\/(?:BV|av)\w+/i,
  /** 定时任务一趟最多跑多久：Vercel 函数 300 s 的上限前留出收尾。 */
  cronBudgetMs: 240_000,
} as const

/**
 * 她出不了门的原因（存在 `CharacterCard.browsePausedReason`，角色页照着说）。⛔ 出了问题悄悄换别家。
 */
export const CHARACTER_BROWSE_PAUSE_REASONS = {
  /** 开着开关却没选型号（打开时本该默认填上当时助手那个）。 */
  noModel: 'no_model',
  /** 选的型号已经不在助手路由表里（下架 / 改名）。 */
  modelUnavailable: 'model_unavailable',
  /** 那一家的 key 没了。 */
  missingKey: 'missing_key',
} as const

export type CharacterBrowsePauseReason =
  (typeof CHARACTER_BROWSE_PAUSE_REASONS)[keyof typeof CHARACTER_BROWSE_PAUSE_REASONS]

/** 她的观点存在她自己那份记忆里（`AssistantMemory.characterCardId`），正文以它开头。 */
export const CHARACTER_OPINION_PREFIX = '观点：'

/** 角色页改「出门逛」开关 / 型号失败的几种原因（前端按 `i18nKey` 说人话）。 */
export const CHARACTER_BROWSE_SETTING_ERRORS = {
  /** 打开时既没给型号、助手「自动」也挑不出一个（一把 key 都没有）。 */
  noModel: {
    code: 'CHARACTER_BROWSE_NO_MODEL',
    httpStatus: 409,
    i18nKey: 'errors.characterBrowse.noModel',
    message: 'Pick a model for her to go out with.',
  },
  /** 给的型号不在助手路由表里。 */
  unknownModel: {
    code: 'CHARACTER_BROWSE_UNKNOWN_MODEL',
    httpStatus: 422,
    i18nKey: 'errors.characterBrowse.unknownModel',
    message: 'That model is not available.',
  },
} as const

/** 聊天时想起她的见闻（4c）。 */
export const CHARACTER_FINDINGS_RECALL = {
  /** 按意思最多想起几条。 */
  topK: 3,
  /** 拿你这句话的前多少字去找。 */
  queryChars: 300,
  /** 一条都对不上时，最近这么久看到的最新一条可以顺口提。 */
  freshMs: 2 * 24 * 60 * 60 * 1000,
} as const
