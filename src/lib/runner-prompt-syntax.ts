/**
 * 来源提示词 → Runner（ComfyUI）认得的写法。
 *
 * ComfyUI 的编码器只认圆括号：`(tag)` 乘 1.1、`(tag:0.8)` 定值、`\(` 转义。
 * Civitai 来源图多半出自 A1111 / Forge（少数 NovelAI），下面几种写法到了 ComfyUI
 * 会被原样当字面吃进去 —— 画面照出，写的权重全丢：
 * - `[tag]` 降权（A1111 ÷1.1）→ `(tag:0.91)`
 * - 括号外或方括号里的 `tag:0.65` → `(tag:0.65)`（作者写下的数优先）
 * - `{tag}` 加权（NovelAI ×1.05）→ `(tag:1.05)`；带 `|` 的是随机语法，原样留着
 * - `BREAK` → 逗号
 * - `(tag:0.8, )` 括号里权重后多出的逗号 → `(tag:0.8)`
 * ComfyUI 表达不了的（`[a|b]` 交替、`[a:b:10]` 按步切换）只去掉语法、留下词。
 */

/** 超过它的「tag:数」当成步数或比例（`[dog:10]`、`16:9`），不当权重。 */
const EXPLICIT_WEIGHT_MAX = 2
const A1111_DEEMPHASIS = 1 / 1.1
const NAI_EMPHASIS = 1.05
const COMFY_PAREN_EMPHASIS = 1.1

const OPENERS: Record<string, string> = { '(': ')', '[': ']', '{': '}' }

function formatWeight(value: number): string {
  return String(Number(value.toFixed(2)))
}

/** `open` 处的括号对应的闭括号下标；配不上返回 -1。 */
function findClose(text: string, open: number): number {
  const opener = text[open]
  const closer = OPENERS[opener]
  let depth = 0
  for (let i = open; i < text.length; i += 1) {
    const char = text[i]
    if (char === '\\') {
      i += 1
      continue
    }
    if (char === opener) depth += 1
    else if (char === closer) {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/** 在最外层按分隔符切开（括号里、转义后的不切），保留每段原样的空白。 */
function splitTopLevel(text: string, separators: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '\\') {
      i += 1
      continue
    }
    if (char in OPENERS) depth += 1
    else if (char === ')' || char === ']' || char === '}') {
      depth = Math.max(0, depth - 1)
    } else if (depth === 0 && separators.includes(char)) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts
}

function lastTopLevelColon(text: string): number {
  let depth = 0
  let found = -1
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '\\') {
      i += 1
      continue
    }
    if (char in OPENERS) depth += 1
    else if (char === ')' || char === ']' || char === '}') {
      depth = Math.max(0, depth - 1)
    } else if (depth === 0 && char === ':') found = i
  }
  return found
}

/** `tag:0.65` → `{ text: 'tag', raw: '0.65', value: 0.65 }`；冒号必须在最外层、前面得有字。 */
function splitTrailingNumber(
  core: string,
): { text: string; raw: string; value: number } | null {
  const colon = lastTopLevelColon(core)
  if (colon <= 0) return null
  const text = core.slice(0, colon).trimEnd()
  const raw = core.slice(colon + 1).trim()
  if (!/^\d*\.?\d+$/.test(raw) || !/\p{L}/u.test(text)) return null
  return { text, raw, value: Number(raw) }
}

function parseExplicitWeight(
  core: string,
): { text: string; raw: string } | null {
  const parsed = splitTrailingNumber(core)
  if (!parsed || parsed.value <= 0 || parsed.value > EXPLICIT_WEIGHT_MAX) {
    return null
  }
  return parsed
}

/** 整段乘一个系数：本来就是一整个圆括号组的，直接改它的数。 */
function scaleGroup(segment: string, factor: number): string {
  if (segment.startsWith('(') && findClose(segment, 0) === segment.length - 1) {
    const inner = segment.slice(1, -1)
    const weighted = splitTrailingNumber(inner)
    if (weighted) {
      return `(${weighted.text}:${formatWeight(weighted.value * factor)})`
    }
    return `(${inner}:${formatWeight(COMFY_PAREN_EMPHASIS * factor)})`
  }
  return `(${segment}:${formatWeight(factor)})`
}

function renderBracket(inner: string): string {
  return splitTopLevel(inner, ',|')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const rewritten = rewriteGroups(part)
      const weighted = parseExplicitWeight(rewritten)
      if (weighted) return `(${weighted.text}:${weighted.raw})`
      // `[dog:10]` / `[from:to:10]` 是按步切换，ComfyUI 表达不了：只留词。
      const scheduled = splitTrailingNumber(rewritten)
      return scaleGroup(
        scheduled ? scheduled.text : rewritten,
        A1111_DEEMPHASIS,
      )
    })
    .join(', ')
}

function renderBrace(inner: string): string {
  if (splitTopLevel(inner, '|').length > 1) return `{${inner}}`
  const rewritten = rewriteGroups(inner).trim()
  return rewritten ? scaleGroup(rewritten, NAI_EMPHASIS) : ''
}

/** 把方括号、花括号换成圆括号写法；圆括号原样，只改它里面嵌着的。 */
function rewriteGroups(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '\\' && i + 1 < text.length) {
      const next = text[i + 1]
      // ComfyUI 只认 `\(` `\)` 这两个转义；方括号、花括号本来就是字面。
      out += '[]{}'.includes(next) ? next : char + next
      i += 1
      continue
    }
    if (!(char in OPENERS)) {
      out += char
      continue
    }
    const close = findClose(text, i)
    if (close === -1) {
      out += char
      continue
    }
    const inner = text.slice(i + 1, close)
    // `(tag:0.8, )`：权重后面多出的逗号让 ComfyUI 读不出那个数，去掉。
    if (char === '(') out += `(${rewriteGroups(inner).replace(/[\s,]+$/, '')})`
    else if (char === '[') out += renderBracket(inner)
    else out += renderBrace(inner)
    i = close
  }
  return out
}

function rewriteBareWeight(raw: string): string {
  const core = raw.trim()
  const weighted = parseExplicitWeight(core)
  if (!weighted) return raw
  const lead = raw.slice(0, raw.indexOf(core))
  const trail = raw.slice(raw.indexOf(core) + core.length)
  return `${lead}(${weighted.text}:${weighted.raw})${trail}`
}

export function toRunnerPromptSyntax(prompt: string): string {
  const hasBreak = /\bBREAK\b/.test(prompt)
  const source = hasBreak
    ? prompt
        .replace(/\s*,?\s*\bBREAK\b\s*,?\s*/g, ', ')
        .replace(/^\s*,\s*|\s*,\s*$/g, '')
    : prompt
  return splitTopLevel(rewriteGroups(source), ',')
    .map(rewriteBareWeight)
    .join(',')
}
