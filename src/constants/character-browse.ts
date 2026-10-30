/**
 * 角色出门调查（第 4 批「人味」，owner 2026-10-28；角色大项目第 ⑤ 步起你点一次去一次）：按她的人设
 * 和在意的东西去逛，看到的东西用她的口吻写成见闻（`CharacterFinding`）。⛔ 不进素材库；花的是 owner
 * 自己的 key。
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
  /** 见闻那句笔记的长度上限。 */
  noteChars: 200,
  /** 人设交给模型时截到多少字。 */
  personaChars: 1200,
  /** 告诉模型最近已经看过什么（免得天天搜同一样），带几条标题。 */
  recentTitles: 20,
  /**
   * 她在意的东西（第 ④ 步，owner 10-30「不完全按清单找」「可以自己加」）：搜索词大半照清单，
   * 留一个给别的；每趟回来最多自己加几样、去几样。
   */
  interestAddsPerOuting: 2,
  interestDropsPerOuting: 1,
  /** 细看时每张图最多多大、取多久；取不到的那张只看标题。 */
  pictureMaxBytes: 3 * 1024 * 1024,
  pictureTimeoutMs: 15_000,
  /** 单次模型调用的时限。 */
  callTimeoutMs: 60_000,
  /** B 站只留具体的视频页（`/video/BV…` 或 `/video/av…`）；网搜退路偶尔回搜索结果页。 */
  bilibiliVideoUrl: /bilibili\.com\/video\/(?:BV|av)\w+/i,
} as const

/**
 * 一趟出门（角色大项目第 ⑤ 步，owner 10-29/10-30）：弹框选模型 · 来源 · 额度，你点一次去一次。
 *
 * ⭐ 额度按真实 token 折点：1 点 ≈ 1 万 token，跟用哪个模型无关。**一点都不超**（owner 10-30）：每次
 *   调模型前按上限估一把（字数当 token、每张图 `imageTokens`、回答留 `outputReserveTokens`），估得
 *   超了就收工；provider 报回来的才是实扣。
 * ⭐ 回来写一篇日记，那一篇的花费从一开始就留着（`diaryReserveTokens`）。
 * ⭐ 一段函数跑不完（Vercel 300 s）就接着下一段：占着 `leaseUntil`，过了没人续就由读状态的那一下接着跑。
 */
export const CHARACTER_OUTING = {
  tokensPerPoint: 10_000,
  budgetChoices: [10, 30, 60] as const,
  defaultBudget: 30,
  minBudget: 5,
  maxBudget: 200,
  /** 你添加的网址最多几个、每个多长。 */
  maxSites: 8,
  siteChars: 120,
  /** 一段最多跑多久（函数上限 300 s，留收尾）；占位比它稍长。 */
  chunkMs: 230_000,
  leaseMs: 280_000,
  /** 跑着却这么久没动静 = 卡死了，记失败。 */
  staleMs: 30 * 60 * 1000,
  /** 一趟最多几轮（想搜什么 → 找 → 挑 → 细看），连着几轮一条新的都没有就收工。 */
  maxRounds: 15,
  maxEmptyRounds: 2,
  diaryReserveTokens: 8_000,
  imageTokens: 1_600,
  outputReserveTokens: 1_500,
  /** 模型自带网搜不报 token：一次按这么多算。 */
  nativeSearchTokens: 8_000,
  /** 弹框里「约 N 篇文章」的折算。 */
  tokensPerArticle: 15_000,
  /** 跑着时角色页多久问一次进度。 */
  pollMs: 3_000,
  /** 角色页读回最近几趟（河里每趟一条、弹框记住上次的选法）；常加的网址列几个。 */
  recentRuns: 20,
  frequentSites: 6,
  /** 写日记时每条见闻带多少字。 */
  diaryFindingChars: 240,
} as const

/** 一段跑完接着跑下一段：自己调自己这条内部接口（`Authorization: Bearer CRON_SECRET`）。 */
export const CHARACTER_OUTING_CONTINUE_PATH = '/api/internal/characters/outing'

export const CHARACTER_OUTING_STATUS = {
  running: 'RUNNING',
  done: 'DONE',
  stopped: 'STOPPED',
  failed: 'FAILED',
} as const

export type CharacterOutingStatus =
  (typeof CHARACTER_OUTING_STATUS)[keyof typeof CHARACTER_OUTING_STATUS]

/** 怎么收的工（`CharacterOuting.endReason`）。 */
export const CHARACTER_OUTING_END_REASONS = {
  /** 额度花到再调一次就会超。 */
  budget: 'budget',
  /** 你点了「结束」。 */
  stopped: 'stopped',
  /** 连着几轮一条新的都没找到 / 轮数到顶。 */
  nothing: 'nothing',
  /** 中途出错（key 没了、模型下架……）。 */
  failed: 'failed',
} as const

export type CharacterOutingEndReason =
  (typeof CHARACTER_OUTING_END_REASONS)[keyof typeof CHARACTER_OUTING_END_REASONS]

/** 出不了门（点「开始」时就拦下，前端按 `i18nKey` 说人话）。 */
export const CHARACTER_OUTING_ERRORS = {
  unknownModel: {
    code: 'CHARACTER_OUTING_UNKNOWN_MODEL',
    httpStatus: 422,
    i18nKey: 'errors.characterOuting.unknownModel',
    message: 'That model is not available.',
  },
  missingKey: {
    code: 'CHARACTER_OUTING_MISSING_KEY',
    httpStatus: 409,
    i18nKey: 'errors.characterOuting.missingKey',
    message: 'That model has no API key.',
  },
  running: {
    code: 'CHARACTER_OUTING_RUNNING',
    httpStatus: 409,
    i18nKey: 'errors.characterOuting.running',
    message: 'She is already out.',
  },
} as const

/** 她的观点存在她自己那份记忆里（`AssistantMemory.characterCardId`），正文以它开头。 */
export const CHARACTER_OPINION_PREFIX = '观点：'

/** 聊天时想起她的见闻（4c）。 */
export const CHARACTER_FINDINGS_RECALL = {
  /** 按意思最多想起几条。 */
  topK: 3,
  /** 拿你这句话的前多少字去找。 */
  queryChars: 300,
  /** 一条都对不上时，最近这么久看到的最新一条可以顺口提。 */
  freshMs: 2 * 24 * 60 * 60 * 1000,
} as const

/** 她的表情包（4d，owner 2026-10-28）：细看时顺手挑，存 R2 独立路径，⛔ 进素材库。 */
export const CHARACTER_STICKERS = {
  /** 一次出门最多收几张。 */
  perOuting: 2,
  /** 专门搜表情包时要几张结果、细看时带几张候选。 */
  searchResults: 10,
  candidates: 4,
  /** 每张卡最多留几张；超了先删最旧、没发过的。 */
  perCard: 30,
  /** 单张图的上限（外站大图不收）。 */
  maxBytes: 5 * 1024 * 1024,
  downloadTimeoutMs: 30_000,
  /** 「什么时候用」那句的长度上限。 */
  whenChars: 60,
  /** 聊天里那个记号用 id 的前几位（`[表情·ab12cd]`）。 */
  handleChars: 6,
  /** 你上传时没写「什么时候发」就用这一句。 */
  defaultWhen: '你喂给她的，觉得合适时发',
} as const
