/**
 * 提示词「找句换句」：每一处 `find` 在原文里恰好出现一次、彼此不重叠，才换。
 *
 * ⭐ 服务端（助手算改完的整段）与浏览器（落到创作者此刻台上的那一段）用的是这同一份：
 *   浏览器拿它在**台上现在的文字**上再换一遍，创作者这一轮自己改过的地方不会被整段冲掉
 *   （第 4 步「只改那一处」，owner 2026-10-23）。两边判据必须一致，⛔ 别各写一份。
 */

export interface PromptFindReplace {
  readonly find: string
  readonly replace: string
}

export type PromptFindReplaceResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: string }

export function applyPromptFindReplace(
  current: string,
  edits: readonly PromptFindReplace[],
  fieldName = 'prompt',
): PromptFindReplaceResult {
  if (edits.length === 0)
    return {
      ok: false,
      error: 'mode "edit" needs at least one {find, replace}.',
    }
  const spans: { start: number; end: number; replace: string }[] = []
  for (const edit of edits) {
    const start = edit.find ? current.indexOf(edit.find) : -1
    if (start < 0)
      return {
        ok: false,
        error: `"${edit.find}" does not occur in the ${fieldName}. Read it and copy the words exactly.`,
      }
    if (current.indexOf(edit.find, start + 1) >= 0)
      return {
        ok: false,
        error: `"${edit.find}" occurs more than once in the ${fieldName}; take a few more words around it.`,
      }
    const end = start + edit.find.length
    if (spans.some((span) => start < span.end && span.start < end))
      return { ok: false, error: `"${edit.find}" overlaps another find.` }
    spans.push({ start, end, replace: edit.replace })
  }
  const value = spans
    .sort((left, right) => right.start - left.start)
    .reduce(
      (text, span) =>
        `${text.slice(0, span.start)}${span.replace}${text.slice(span.end)}`,
      current,
    )
  return { ok: true, value }
}
