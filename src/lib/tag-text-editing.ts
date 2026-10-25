import {
  parseTagChips,
  serializeTagChips,
  snapTagWeight,
  splitTagRanges,
} from '@/lib/tag-composer'

/**
 * 标签台**纯文本框**的编辑动作（owner 2026-10-24 ㉘「不做框了，直接纯文本」）。
 *
 * 框里就是存储串本身（`1girl, rain:1.2, neon city`）；这里只回答「光标落在哪一个
 * 标签上」以及几个按标签整块改字的快捷动作。纯函数，组件只管把结果写回 textarea。
 */

export interface TagTextRange {
  start: number
  end: number
}

export interface TagTextEdit {
  text: string
  /** 改完光标 / 选区落在哪。 */
  selection: TagTextRange
}

/** 一段（逗号之间）去掉两头空白后的范围；整段是空白时 `start === end`。 */
function trimRange(text: string, { start, end }: TagTextRange): TagTextRange {
  let s = start
  let e = end
  while (s < e && /\s/.test(text[s]!)) s++
  while (e > s && /\s/.test(text[e - 1]!)) e--
  return { start: s, end: e }
}

/** 光标所在那一段的下标（光标正好在逗号前算左边那段）。 */
function segmentIndexAt(
  ranges: readonly TagTextRange[],
  caret: number,
): number {
  const index = ranges.findIndex(
    (range) => caret >= range.start && caret <= range.end,
  )
  return index === -1 ? ranges.length - 1 : index
}

/** 光标所在的那一个标签（去掉两头空白）；落在空段上回 `null`。 */
export function tagRangeAt(text: string, caret: number): TagTextRange | null {
  const ranges = splitTagRanges(text)
  const range = trimRange(text, ranges[segmentIndexAt(ranges, caret)]!)
  return range.start === range.end ? null : range
}

/** 光标前那半截：补全拿它去查。 */
export function tagQueryAt(text: string, caret: number): string {
  const ranges = splitTagRanges(text)
  const range = trimRange(text, ranges[segmentIndexAt(ranges, caret)]!)
  if (caret < range.start) return ''
  return text.slice(range.start, Math.min(caret, range.end)).trim()
}

/** 把第 `index` 段连同它前面（第一段则是后面）的逗号一起拿掉。 */
function removeSegment(
  text: string,
  ranges: readonly TagTextRange[],
  index: number,
): TagTextEdit {
  const range = ranges[index]!
  if (index > 0) {
    const from = ranges[index - 1]!.end
    return {
      text: text.slice(0, from) + text.slice(range.end),
      selection: { start: from, end: from },
    }
  }
  let to = ranges[1]?.start ?? range.end
  while (to < text.length && /\s/.test(text[to]!)) to++
  return { text: text.slice(to), selection: { start: 0, end: 0 } }
}

/**
 * ⌥⌫：删掉光标前的整个标签。光标在一个标签里（或紧跟着它）删这一个；光标前只有
 * 空白（刚打完 `, `）删前面那一个。前面什么都没有回 `null`，让浏览器自己处理。
 */
export function deleteTagBefore(
  text: string,
  caret: number,
): TagTextEdit | null {
  const ranges = splitTagRanges(text)
  let index = segmentIndexAt(ranges, caret)
  const own = trimRange(text, ranges[index]!)
  if (own.start === own.end || caret <= own.start) {
    index -= 1
    while (index >= 0) {
      const prev = trimRange(text, ranges[index]!)
      if (prev.start !== prev.end) break
      index -= 1
    }
    if (index < 0) return null
  }
  return removeSegment(text, ranges, index)
}

/**
 * ⌘↑ / ⌘↓：光标所在标签的权重 ±0.05，写回成 `tag:1.25`（回到 1 就去掉后缀）。
 * 光标不在标签上回 `null`。
 */
export function stepTagWeightAt(
  text: string,
  caret: number,
  delta: number,
): TagTextEdit | null {
  const range = tagRangeAt(text, caret)
  if (!range) return null
  const chip = parseTagChips(text.slice(range.start, range.end))[0]
  if (!chip) return null
  const weight = snapTagWeight(chip.weight + delta)
  if (weight === chip.weight) return null
  const piece = serializeTagChips([{ text: chip.text, weight }])
  const end = range.start + piece.length
  return {
    text: text.slice(0, range.start) + piece + text.slice(range.end),
    selection: { start: end, end },
  }
}

/**
 * 补全选中一条：光标所在那一段整段换成它，后面补上 `, ` 好接着打下一个。
 * 这个词在别处已经有了（不分大小写）就只拿掉打了一半的那段 —— 同一个词送两遍在
 * 扩散模型里等于被悄悄加权。
 */
export function replaceTagAt(
  text: string,
  caret: number,
  replacement: string,
): TagTextEdit {
  const ranges = splitTagRanges(text)
  const index = segmentIndexAt(ranges, caret)
  const key = replacement.trim().toLowerCase()
  const elsewhere = ranges.some((range, i) => {
    if (i === index) return false
    const chip = parseTagChips(text.slice(range.start, range.end))[0]
    return chip?.text.toLowerCase() === key
  })
  const own = trimRange(text, ranges[index]!)
  if (elsewhere) {
    if (own.start === own.end)
      return { text, selection: { start: caret, end: caret } }
    const removed = removeSegment(text, ranges, index)
    return ranges.length > 1
      ? removed
      : { text: '', selection: { start: 0, end: 0 } }
  }
  const before = text.slice(0, own.start)
  const rest = text.slice(own.end).trimStart()
  const tail = rest.startsWith(',') ? rest : `, ${rest}`
  const next = before + replacement + tail
  // 光标停在逗号后的那个空格后面。
  let at = before.length + replacement.length + 1
  while (at < next.length && next[at] === ' ') at++
  return { text: next, selection: { start: at, end: at } }
}

/** 换行进来（粘贴一列）一律当逗号；标签串里不留换行。 */
export function normalizeTagTextInput(value: string): string {
  return value.replace(/\s*[\r\n]+\s*/g, ', ')
}
