import { NOVELAI_BRACE_WEIGHT_STEP } from '@/constants/prompt-dialects'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

/**
 * **同一句提示词哪里都能用**（owner 2026-10-16）：别家的权重写法在发请求那一跳
 * 翻成目标模型认的那一种，`<lora:…>` 从正文里拿掉。
 *
 * 认四种显式写法 —— A1111 / Comfy `(tag:1.2)`、NovelAI `{tag}` `[tag]`、NovelAI
 * V4 `1.2::tag::`、`<lora:名字:0.8>`。标签台的 `tag:1.2` 统一串不在这里认：那串
 * 只有标签台写得出，由 `tag-composer` 先翻（自然语言里的 `a girl: 1.2 meters`
 * 不是权重）。
 *
 * 只认长得确定是权重的那几种，宁可漏翻也不误伤：
 * - 裸括号 `(cosplay)` 不碰 —— Danbooru 标签自己就带括号（`miku (cosplay)`）。
 * - `{"scene": …}` 不碰 —— Flux / GPT 收结构化 JSON；花括号里有引号、冒号的不算。
 * - `[文字](链接)`、`[1]` 不碰；`(16:9)`、`(ratio 3:2)` 这类冒号前是数字的不碰。
 * - NovelAI 的 `Text:` 之后是要画进图里的字，不翻。
 *
 * ⚠ 纯函数、前后端共用：服务端 `submitImageGeneration` 对每一枪调一次（各台、
 * 画布、助手都经过那里），客户端只用 `listPromptLoraNames` 提前说一句。
 */

export type PromptWeightTarget = 'novelai' | 'parens' | 'plain'

/** 超过它的「x:数」当成比例或步数，不当权重（与 runner-prompt-syntax 同一条线）。 */
const MAX_EXPLICIT_WEIGHT = 2

/** 这家认哪种权重写法。认不出来的一律去掉权重留下词 —— 把括号画进图里更糟。 */
export function promptWeightTargetFor(
  adapterType: AI_ADAPTER_TYPES | undefined,
): PromptWeightTarget {
  if (adapterType === AI_ADAPTER_TYPES.NOVELAI) return 'novelai'
  if (
    adapterType === AI_ADAPTER_TYPES.PIXAI ||
    adapterType === AI_ADAPTER_TYPES.RUNNER
  ) {
    return 'parens'
  }
  return 'plain'
}

function formatWeight(weight: number): string {
  return String(Number(weight.toFixed(2)))
}

/** 一个权重落到目标写法上；权重 ≤ 0（NAI 负强调）在不认它的家直接去掉这段。 */
function emit(text: string, weight: number, target: PromptWeightTarget) {
  const body = text.trim()
  if (!body) return ''
  if (target === 'plain') return weight > 0 ? body : ''
  if (target === 'parens') {
    if (weight <= 0) return ''
    return Math.abs(weight - 1) < 0.005
      ? body
      : `(${body}:${formatWeight(weight)})`
  }
  if (weight <= 0) return `${formatWeight(weight)}::${body}::`
  const depth = Math.round(
    Math.log(weight) / Math.log(NOVELAI_BRACE_WEIGHT_STEP),
  )
  if (depth === 0) return body
  return depth > 0
    ? `${'{'.repeat(depth)}${body}${'}'.repeat(depth)}`
    : `${'['.repeat(-depth)}${body}${']'.repeat(-depth)}`
}

const NUMERIC_EMPHASIS = /(-?\d+(?:\.\d+)?)::([\s\S]*?)(?:::|$)/g
const PAREN_WEIGHT = /(?<!\\)\(([^()]*[^()\d\s])\s*:\s*(\d+(?:\.\d+)?)\s*\)/g
const BRACE_GROUP = /(\{+)([^{}[\]"':|\n]+)(\}+)/g
const BRACKET_GROUP = /(\[+)([^{}[\]"':|\n]+)(\]+)(?!\()/g

/** 只翻最里层；外层套着的下一轮再翻，直到不再变化。 */
const MAX_PASSES = 8

function translateBody(text: string, target: PromptWeightTarget): string {
  let current = text
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    let next = current.replace(PAREN_WEIGHT, (match, body: string, raw) => {
      const weight = Number(raw)
      if (weight > MAX_EXPLICIT_WEIGHT) return match
      return target === 'parens' ? match : emit(body, weight, target)
    })
    if (target !== 'novelai') {
      next = next
        .replace(NUMERIC_EMPHASIS, (_match, raw: string, body: string) =>
          emit(body, Number(raw), target),
        )
        .replace(BRACE_GROUP, (match, open: string, body: string, close) =>
          open.length === close.length && /\S/.test(body)
            ? emit(body, NOVELAI_BRACE_WEIGHT_STEP ** open.length, target)
            : match,
        )
        .replace(BRACKET_GROUP, (match, open: string, body: string, close) =>
          open.length === close.length && /[^\d\s]/.test(body)
            ? emit(body, NOVELAI_BRACE_WEIGHT_STEP ** -open.length, target)
            : match,
        )
    }
    if (next === current) break
    current = next
  }
  return current
}

function tidyInnerSeparators(text: string): string {
  return text.replace(/[ \t]*,(?:[ \t]*,)+/g, ',').replace(/[ \t]{2,}/g, ' ')
}

/** 拿掉一段之后留下的 `, ,` 与首尾逗号收拾干净。 */
function tidySeparators(text: string): string {
  return tidyInnerSeparators(text).replace(/^[\s,]+|[\s,]+$/g, '')
}

/** 别家的权重写法 → 目标写法。`<lora:…>` 不归这里管（见 `stripPromptLoras`）。 */
export function translatePromptWeights(
  text: string,
  target: PromptWeightTarget,
): string {
  if (!text) return text
  // NAI 的 `Text:` 之后是要画进图里的字 —— ⛔ 翻它会改掉画面上的字。
  const textMark = target === 'novelai' ? text.search(/\bText:/) : -1
  const body = textMark >= 0 ? text.slice(0, textMark) : text
  const rest = textMark >= 0 ? text.slice(textMark) : ''
  const translated = translateBody(body, target)
  if (translated === body) return text
  return rest
    ? `${tidyInnerSeparators(translated)}${rest}`
    : tidySeparators(translated)
}

const LORA_TAG =
  /<(?:lora|lyco|locon):([^:<>]+?)(?::\s*(-?\d+(?:\.\d+)?))?(?::[^<>]*)?>/gi

export interface PromptLoraTag {
  name: string
  /** 没写权重时是 `null`，由挂载那一方用这把 LoRA 自己的默认值。 */
  scale: number | null
}

/** 正文里写着的 `<lora:名字:0.8>`，按出现顺序、同名只留第一个。 */
export function listPromptLoras(text: string | undefined): PromptLoraTag[] {
  if (!text) return []
  const seen = new Set<string>()
  const out: PromptLoraTag[] = []
  for (const match of text.matchAll(LORA_TAG)) {
    const name = match[1]!.trim()
    const key = name.toLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    const scale = match[2] === undefined ? null : Number(match[2])
    out.push({ name, scale: Number.isFinite(scale) ? scale : null })
  }
  return out
}

export function listPromptLoraNames(text: string | undefined): string[] {
  return listPromptLoras(text).map((lora) => lora.name)
}

/**
 * 从正文里拿掉 `<lora:…>`。没有哪家把它当挂载指令读 —— 留着只会被当成字画进图里；
 * 真挂 LoRA 走 `advancedParams.loras`（LoRA 台挂载栈）。
 * `only` 给了就只拿掉这几个名字（LoRA 台挂上了的那几把）。
 */
export function stripPromptLoras(
  text: string,
  only?: readonly string[],
): string {
  if (!text) return text
  const keys = only ? new Set(only.map((name) => name.toLowerCase())) : null
  let changed = false
  const stripped = text.replace(LORA_TAG, (match, name: string) => {
    if (keys && !keys.has(name.trim().toLowerCase())) return match
    changed = true
    return ''
  })
  return changed ? tidySeparators(stripped) : text
}

/** 发请求那一跳的唯一入口：拿掉 `<lora:…>`，再把权重翻成这家认的写法。 */
export function normalizePromptForAdapter(
  text: string,
  adapterType: AI_ADAPTER_TYPES | undefined,
): string {
  if (!text) return text
  return translatePromptWeights(
    stripPromptLoras(text),
    promptWeightTargetFor(adapterType),
  )
}

/** 名字比对：大小写、扩展名、空格下划线连字符都不算差别（`Gothic_Lolita.safetensors` = `gothic lolita`）。 */
function loraNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.(?:safetensors|ckpt|pt)$/, '')
    .replace(/[\s_\-.]+/g, '')
}

/**
 * 正文里的 `<lora:…>` 对上用户自己库里的哪几把（LoRA 台「写了就挂上」）。
 * 对不上的名字原样回给调用方说一句 —— ⛔ 不按相近名字猜。
 */
export function matchPromptLoras<T extends { name: string }>(
  text: string | undefined,
  library: readonly T[],
): {
  matched: { name: string; asset: T; scale: number | null }[]
  unmatched: string[]
} {
  const byKey = new Map<string, T>()
  for (const asset of library) {
    const key = loraNameKey(asset.name)
    if (key && !byKey.has(key)) byKey.set(key, asset)
  }
  const matched: { name: string; asset: T; scale: number | null }[] = []
  const unmatched: string[] = []
  for (const lora of listPromptLoras(text)) {
    const asset = byKey.get(loraNameKey(lora.name))
    if (asset) matched.push({ name: lora.name, asset, scale: lora.scale })
    else unmatched.push(lora.name)
  }
  return { matched, unmatched }
}
