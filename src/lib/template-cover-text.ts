/**
 * 开头的标点 / 括号 / 空白 / 列表符号（「[」「：」「- 」「• 」「1. 」…）。
 * 11-19 第二轮真机：首字取到了「[」「：」，摘要以「： - 像用…」开头。
 * ⚠ 只认标点（\p{P}）与数学/修饰符号（\p{Sm}\p{Sk}，含 + = > | ~ ^），⛔ 不吃
 * \p{So}——名字以 emoji 开头时那个 emoji 就是首字。
 */
const LEADING_MARKS =
  /^(?:[\s\p{P}\p{Sm}\p{Sk}•]+|\d{1,2}[.)、](?=[\s\p{L}]))+/u

/** 去掉开头的标点 / 括号 / 列表符号，并把空白压成一个空格。 */
export function stripLeadingMarks(text: string): string {
  return text.replace(/\s+/g, ' ').trim().replace(LEADING_MARKS, '').trim()
}

/**
 * 模板卡没有封面图时的文字卡内容（11-19 真机走查：一排空灰块认不出哪张是哪张）。
 * - `initial`：名字头一个字（跳过开头标点；拉丁字母转大写；按码点取，⛔ 劈开
 *   emoji / 生僻字）。名字全是标点就退到提示词的头一个字。
 * - `summary`：卡片下方那行提示词摘要（跳过开头标点；长度交给 CSS 截）。
 *
 * ⚠ 卡面上只放大字 + 模板名，⛔ 再写一遍摘要 —— 卡片下方已经有同一段了。
 */
export function templateCoverText(
  name: string,
  prompt: string,
): { initial: string; summary: string } {
  const summary = stripLeadingMarks(prompt)
  const source = stripLeadingMarks(name) || summary
  const initial = Array.from(source)[0]?.toUpperCase() ?? ''
  return { initial, summary }
}
