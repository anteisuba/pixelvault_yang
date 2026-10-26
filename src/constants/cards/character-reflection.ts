/**
 * **她自己整理**（10-26「更像真人」C）：聊够一段，她在后台回头看一遍 —— 写一篇短日记、
 * 更新「和你的关系」、合并 / 删掉过时的记忆、需要时改自己的人设卡（不用你确认，设置里留记录能撤回）。
 *
 * owner 10-26 定：每聊 30 句整理一次（和学说法同一种触发，⛔ 定时任务）；名字和身份她不能改，
 * 其余都能改；日记她偶尔会在聊天里提起。
 */

export const CHARACTER_REFLECTION = {
  /** 你在这段对话里每说这么多句，整理一次。 */
  everyUserLines: 30,
  /** 整理时回看最近这么多条消息（你和她两边）。 */
  readMessages: 60,
  /** 每条消息最多看这么长。 */
  messageChars: 1_000,
  /** 卡上每格给模型看这么长（经历可能上万字，整理用不着全看）。 */
  cardFieldChars: 4_000,
  /** 交给模型的整份材料（卡 + 记忆 + 对话）最长这么多字，超了截掉。 */
  promptChars: 80_000,
  /** 一篇日记的上限。 */
  journalChars: 600,
  /** 每张卡留最近这么多篇日记。 */
  journalsPerCard: 100,
  /** 一次整理最多改几格人设。 */
  maxPersonaChanges: 3,
} as const

/**
 * 她整理时能自己改的格（owner 10-26：名字和身份不能改，其余都能改）。
 * ⚠ 「学到的说法」不在这里：它有自己那条学法（每 8 句一次）。「和你的关系」单独一格，每次都可以写。
 */
export const CHARACTER_REFLECTION_EDITABLE_FIELDS = [
  'behavior',
  'speech',
  'boundaries',
  'catchphrases',
  'moods',
  'backstory',
  'scenario',
  'opening',
] as const

export type CharacterReflectionEditableField =
  (typeof CHARACTER_REFLECTION_EDITABLE_FIELDS)[number]
