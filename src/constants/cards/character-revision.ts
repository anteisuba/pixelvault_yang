/**
 * **她改了什么**（10-26「更像真人」C）：助手改角色卡的记录。
 *
 * owner 10-26 定：她自己改人设卡、不用你确认；设置里留一份「她改了什么」，每条能撤回，
 * 免得人设慢慢跑偏你还发现不了。
 */

/** 谁改的：与库里 `CharacterRevisionSource` 一一对应。 */
export const CHARACTER_REVISION_SOURCE_IDS = {
  /** 对话里助手改的（改设定那条路）。 */
  chat: 'CHAT',
  /** 后台整理时她自己改的。 */
  reflection: 'REFLECTION',
} as const

export const CHARACTER_REVISION_LIMITS = {
  /** 每张卡只留最近这么多行，多了删最旧的。 */
  perCard: 200,
  /** 「为什么改」一句话的上限。 */
  reasonChars: 200,
} as const

/** 人设之外也会记的三格：名字、标签、默认造型的「一句外观」。 */
export const CHARACTER_REVISION_CARD_FIELDS = {
  name: 'name',
  tags: 'tags',
  look: 'look',
} as const

/** 角色页右栏「最近」一次读多少（日记、她改了什么、见闻、观点各自最新的这么多条）。 */
export const CHARACTER_GROWTH_PAGE = {
  journals: 30,
  revisions: 50,
  findings: 60,
  opinions: 30,
} as const

/**
 * 角色总览「最近」那几张卡（角色大项目第 ① 步）：每位只取她最近一件事，最多几位；
 * 每类往回看多少条再按人去重（人多时够挑出几位不同的人）。
 */
export const CHARACTER_RECENT_ACTIVITY = {
  cards: 3,
  scanPerKind: 30,
} as const
