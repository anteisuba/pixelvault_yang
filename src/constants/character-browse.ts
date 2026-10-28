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
  /** 每个搜索词最多留几样候选。 */
  perQueryItems: 4,
  /** 一次看图调用里放几样（图 / 视频封面 / 页面标题）。 */
  viewBatch: 6,
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
