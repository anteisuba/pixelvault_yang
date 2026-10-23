/**
 * 「你的技能」的上限（第 7b 步，方案 step7b-plan.md 第 E 节，owner 10-23）。
 * ⭐ 按「花在哪」卡：你自己写的只用「/」叫、⛔ 不进系统提示名单，所以只卡单份大小与一条消息带几份；
 *   存多少份只占库，200 是为了列表翻得动。每人各算各的。
 */
export const ASSISTANT_SKILL_LIMITS = {
  /** 每人最多存几份（自己写的 + 改过 / 关掉的内置）。 */
  maxSkills: 200,
  /** 显示名（也是 `/名字`、`技能·名字`）。 */
  maxNameChars: 30,
  /** 标准里 description 的上限。 */
  maxDescriptionChars: 1024,
  /** 正文：大约 3–8 千 token；再长该拆成参考文件。 */
  maxBodyChars: 12_000,
  /** 一条消息最多「/」几份。 */
  maxCalledPerMessage: 3,
  /** 一条消息「/」进来的全文合计。 */
  maxCalledChars: 30_000,
} as const
