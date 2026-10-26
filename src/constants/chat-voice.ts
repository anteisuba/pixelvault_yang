/**
 * 她在对话里说话（②c，聊天并回对话）—— 气泡节奏、念出来的语气标签、学说法。
 *
 * 原来跟着配音间的聊天（`/studio/audio`）走；10-26 聊天房间删了，留下的这几样对话还在用。
 */

/**
 * 像发消息一样（10-26「更像真人」F）：后一个气泡前「正在输入…」停一会儿，前一个越长停得越久（封顶）。
 * 10-26 用户定（样件 F）：500ms + 每字 70ms；封顶只防一行写成一大段时干等。
 */
export const CHAT_BUBBLE_PAUSE = {
  baseMs: 500,
  perCharMs: 70,
  maxMs: 4000,
} as const

/**
 * Fish Drama 3 认的成对标签：只改包在里面的那几个字（念出来的语气）。
 */
export const DRAMA_PAIRED_TAGS = [
  'whisper',
  'emphasis',
  'soft',
  'fast',
  'slow',
  'stress',
  'forceful',
] as const

/**
 * 学说法（F）：你在对话里每说这么多句，她从你最近的话里挑几个口头禅记到角色卡上；
 * 一次看最近多少句你的话、最多记几个、每句最多读多少字。
 */
export const CHAT_LEARN_PHRASES = {
  everyUserLines: 8,
  readUserLines: 30,
  maxNewPerRun: 4,
  lineMaxChars: 2_000,
} as const
