/**
 * 统一引用模型的纯函数（设计方案 §10b）——记号、解析、改名去重、发给模型的写法、
 * 打字点名、搜索排序、分组。
 *
 * ⚠ 纯模块、无 `server-only`：面板（发送前解析）、驱动 hook（拼请求）、测试都进得来。
 *
 * ── 一条消息从写到发 ─────────────────────────────────────────────
 *   ① 输入框正文里只有 `<@kind:id>`（胶囊），名字 / 缩略图住在登记表里；
 *   ② 发送时逐个记号按 id 去**当前还在的东西**里找（`resolveDraftMentions`）——
 *      画布的卡被删了、参考位被摘了，这一条就是「已删除」，整条消息拦下；
 *   ③ 通过之后记号换成 `「名字」`（重名的补 ` (2)`），引用列表随消息一起走。
 *      服务端按 id / nodeId 解析，⛔ 不再按名字找卡。
 */

import {
  ASSISTANT_MENTION_KIND_IDS,
  ASSISTANT_MENTION_KINDS,
  ASSISTANT_MENTION_LIMITS,
  ASSISTANT_MENTION_SCOPE_IDS,
  ASSISTANT_MENTION_TOKEN,
} from '@/constants/assistant-mention'
import type {
  AssistantMention,
  AssistantMentionCandidate,
  AssistantMentionKind,
  AssistantMentionRef,
  AssistantMentionScope,
} from '@/types/assistant-mention'
import type { StudioOperatorAttachment } from '@/types/studio-assistant-operator'

// ─── 记号 ────────────────────────────────────────────────────────────

/** 一条引用在登记表里的键（= 记号里那一段）。 */
export function mentionKey(mention: {
  readonly kind: string
  readonly id: string
}): string {
  return `${mention.kind}${ASSISTANT_MENTION_TOKEN.separator}${mention.id}`
}

/** 键 → `{ kind, id }`（`mentionKey` 的反函数；认不出的种类返回 `null`）。 */
export function splitMentionKey(
  key: string,
): { kind: AssistantMentionKind; id: string } | null {
  const at = key.indexOf(ASSISTANT_MENTION_TOKEN.separator)
  if (at <= 0) return null
  const kind = key.slice(0, at)
  const id = key.slice(at + 1)
  if (!id || !(ASSISTANT_MENTION_KINDS as readonly string[]).includes(kind))
    return null
  return { kind: kind as AssistantMentionKind, id }
}

/** 正文里的那一段 `<@kind:id>`。 */
export function formatMentionToken(mention: {
  readonly kind: string
  readonly id: string
}): string {
  return `${ASSISTANT_MENTION_TOKEN.open}${mentionKey(mention)}${ASSISTANT_MENTION_TOKEN.close}`
}

const KIND_ALTERNATION = ASSISTANT_MENTION_KINDS.join('|')
/** ⚠ 每次用都 new 一个：带 `g` 的正则有 `lastIndex` 状态，共享一个会漏匹配。 */
function tokenPattern(): RegExp {
  return new RegExp(`<@(${KIND_ALTERNATION}):([^\\s>]+)>`, 'g')
}

export interface ParsedMentionToken {
  readonly kind: AssistantMentionKind
  readonly id: string
  readonly key: string
  readonly token: string
  readonly index: number
}

/** 正文里的全部记号，按出现顺序（重复的照列）。 */
export function parseMentionTokens(text: string): ParsedMentionToken[] {
  return Array.from(text.matchAll(tokenPattern()), (match) => {
    const kind = match[1] as AssistantMentionKind
    const id = match[2]
    return {
      kind,
      id,
      key: mentionKey({ kind, id }),
      token: match[0],
      index: match.index ?? 0,
    }
  })
}

/** 正文里有没有这一条的记号。 */
export function hasMentionToken(
  text: string,
  mention: { readonly kind: string; readonly id: string },
): boolean {
  return text.includes(formatMentionToken(mention))
}

/**
 * 外面递进来的一条（「问助手」/ 拖进来 / 用它当参考）落进正文：已经在了就不动，
 * 否则接在末尾（与前文隔一个空格）。
 */
export function appendMentionToken(
  text: string,
  mention: { readonly kind: string; readonly id: string },
): string {
  if (hasMentionToken(text, mention)) return text
  const token = formatMentionToken(mention)
  if (!text) return `${token} `
  return /\s$/.test(text) ? `${text}${token} ` : `${text} ${token} `
}

/** 摘掉一条（胶囊小卡片上的「移除」）——连同它后面那一个空格。 */
export function removeMentionToken(
  text: string,
  mention: { readonly kind: string; readonly id: string },
): string {
  const token = formatMentionToken(mention)
  return text.split(`${token} `).join('').split(token).join('')
}

// ─── 名字 ────────────────────────────────────────────────────────────

/**
 * 一条消息里**重名的补序号**：三张「镜头1」→ `镜头1` / `镜头1 (2)` / `镜头1 (3)`。
 *
 * ⭐ 发给模型的是 `「名字」`，同一条消息里两条引用写成同一个字就又回到了按名字猜
 * 的老路。补完之后名字在这条消息里唯一，气泡也按它把字换回胶囊。
 */
export function withUniqueMentionLabels<T extends AssistantMention>(
  mentions: readonly T[],
): T[] {
  const seen = new Map<string, number>()
  return mentions.map((mention) => {
    const base = mention.label
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return count === 1 ? mention : { ...mention, label: `${base} (${count})` }
  })
}

/** 记号换成 `「名字」`（给模型、给存档的那份正文）。认不出的记号原样留着。 */
export function renderMentionText(
  text: string,
  mentions: readonly AssistantMention[],
): string {
  const labels = new Map(mentions.map((item) => [mentionKey(item), item.label]))
  return text.replace(tokenPattern(), (token, kind: string, id: string) => {
    const label = labels.get(`${kind}${ASSISTANT_MENTION_TOKEN.separator}${id}`)
    return label === undefined ? token : `「${label}」`
  })
}

/** 发给服务端的那一份（去掉缩略图与地址）。 */
export function toMentionRef(mention: AssistantMention): AssistantMentionRef {
  return {
    kind: mention.kind,
    id: mention.id,
    label: mention.label.slice(0, ASSISTANT_MENTION_LIMITS.maxLabelChars),
    scope: mention.scope,
    ...(mention.nodeId ? { nodeId: mention.nodeId } : {}),
    ...(mention.generationId ? { generationId: mention.generationId } : {}),
    ...(mention.seq === undefined ? {} : { seq: mention.seq }),
    ...(mention.role ? { role: mention.role } : {}),
  }
}

// ─── 解析（发送前）──────────────────────────────────────────────────

/**
 * 这几种来源的东西**会消失**：画布上的卡会被删、参考位会被摘、📎 会被 ×、角色与
 * LoRA 会被删。发送前它们必须还在当前的候选里，否则就是「已删除」。
 * 结果 / 素材库是库里的永久记录，登记时还在就算在（服务端照旧按 id 再核一次）。
 */
const LIVE_SCOPES: ReadonlySet<AssistantMentionScope> = new Set([
  ASSISTANT_MENTION_SCOPE_IDS.canvas,
  ASSISTANT_MENTION_SCOPE_IDS.reference,
  ASSISTANT_MENTION_SCOPE_IDS.attachment,
  ASSISTANT_MENTION_SCOPE_IDS.character,
  ASSISTANT_MENTION_SCOPE_IDS.lora,
])

export interface DraftMention {
  readonly key: string
  /** 能解析时是那一条（名字取**此刻**的，改过名就是新名字）。 */
  readonly mention: AssistantMention | null
  /** 指的东西没了（灰色「已删除」，拦住发送）。 */
  readonly missing: boolean
}

/**
 * 正文里每一枚胶囊此刻指着什么 —— 输入框画胶囊、计数、发送前的闸都读这一份，
 * ⛔ 不各算各的（这就是「一套 chip」）。按首次出现排序、按键去重。
 *
 * @param registry 登记表：选的时候记下的那一份（名字 / 缩略图 / scope）。
 * @param live 此刻还在的候选，按键索引（画布的卡、参考位、📎、角色、LoRA…）。
 */
export function resolveDraftMentions(
  text: string,
  registry: readonly AssistantMention[],
  live: ReadonlyMap<string, AssistantMention>,
): DraftMention[] {
  const registered = new Map(registry.map((item) => [mentionKey(item), item]))
  const out: DraftMention[] = []
  const seen = new Set<string>()
  for (const token of parseMentionTokens(text)) {
    if (seen.has(token.key)) continue
    seen.add(token.key)
    const current = live.get(token.key)
    const recorded = registered.get(token.key)
    if (current) {
      // 用途是用户在胶囊上定的，候选里没有 —— 从登记表带过来。
      out.push({
        key: token.key,
        mention: recorded?.role ? { ...current, role: recorded.role } : current,
        missing: false,
      })
      continue
    }
    if (recorded && !LIVE_SCOPES.has(recorded.scope)) {
      out.push({ key: token.key, mention: recorded, missing: false })
      continue
    }
    out.push({ key: token.key, mention: recorded ?? null, missing: true })
  }
  return out
}

/** 胶囊上那一圈：缺失的显示快照名（有的话），没有快照就只写「已删除」。 */
export function draftMentionLabel(draft: DraftMention): string | undefined {
  return draft.mention?.label
}

/** 打字点名时，名字后面紧跟这些字符就不算（`@图1` ≠ `@图10`、`@Ann` ≠ `@Anna`）。 */
const NAME_CONTINUES = /[\p{L}\p{N}_]/u
/** `@` 前面是这些字符就不算（邮箱局部名，见 `mention-input.tsx` 同名判据）。 */
const EMAIL_LOCAL_PART_CHAR = /[A-Za-z0-9._%+-]/

/**
 * **手打的 `@名字` 也算引用**（2026-09-24 真机：没经过选择器的「@图1」原样进了
 * 气泡，也没带上图）。只认此刻候选里**名字完全相同**的那几条，长名字先换；
 * 同名的几条一条都不认（猜一个就是又回到按名字找卡）。
 */
export function resolveTypedMentions(
  text: string,
  candidates: readonly AssistantMention[],
): { text: string; mentions: AssistantMention[] } {
  const byLabel = new Map<string, AssistantMention[]>()
  for (const candidate of candidates) {
    const label = candidate.label.trim()
    if (!label) continue
    byLabel.set(label, [...(byLabel.get(label) ?? []), candidate])
  }
  const labels = [...byLabel.keys()]
    .filter((label) => byLabel.get(label)?.length === 1)
    .sort((a, b) => b.length - a.length)
  if (!labels.length) return { text, mentions: [] }
  const found: AssistantMention[] = []
  let out = ''
  let i = 0
  while (i < text.length) {
    if (
      text[i] === '@' &&
      // `<@kind:id>` 自己的那个 `@` 不是手打的点名。
      text[i - 1] !== '<' &&
      !(i > 0 && EMAIL_LOCAL_PART_CHAR.test(text[i - 1] ?? ''))
    ) {
      const label = labels.find(
        (name) =>
          text.startsWith(name, i + 1) &&
          !(
            NAME_CONTINUES.test(name.at(-1) ?? '') &&
            NAME_CONTINUES.test(text[i + 1 + name.length] ?? '')
          ),
      )
      if (label) {
        const mention = byLabel.get(label)![0]
        if (!found.some((item) => mentionKey(item) === mentionKey(mention)))
          found.push(mention)
        out += formatMentionToken(mention)
        i += 1 + label.length
        continue
      }
    }
    out += text[i]
    i += 1
  }
  return { text: out, mentions: found }
}

/** `@Image2` / `@图2` / `@画像2`（手打的槽位编号，owner 09-24 / 10-09 两条都保留）。 */
const SLOT_MENTION =
  /(?<![\w.%+<-])@(?:Image|图|画像)\s?([1-9]\d*)(?![\p{L}\p{N}_])/gu

/**
 * 手打的槽位编号换成记号：`slots[n-1]` 就是第 n 张。越界的留着并报出来
 * （「引用的图片不可用」）。
 */
export function resolveSlotMentions(
  text: string,
  slots: readonly AssistantMention[],
): { text: string; mentions: AssistantMention[]; invalid: boolean } {
  let invalid = false
  const found: AssistantMention[] = []
  const out = text.replace(SLOT_MENTION, (token, number: string) => {
    const slot = slots[Number(number) - 1]
    if (!slot) {
      invalid = true
      return token
    }
    if (!found.some((item) => mentionKey(item) === mentionKey(slot)))
      found.push(slot)
    return formatMentionToken(slot)
  })
  return { text: out, mentions: found, invalid }
}

// ─── 来源转换 ────────────────────────────────────────────────────────

const ATTACHMENT_KIND: Record<
  StudioOperatorAttachment['kind'],
  AssistantMentionKind
> = {
  image: ASSISTANT_MENTION_KIND_IDS.image,
  video: ASSISTANT_MENTION_KIND_IDS.video,
  audio: ASSISTANT_MENTION_KIND_IDS.audio,
  model3d: ASSISTANT_MENTION_KIND_IDS.model3d,
}

/**
 * 附件形状的东西（库里的产物、上传、结果）→ 一条引用。
 * ⚠ `generationId` 只在它确实是库里一件时给（scope 是结果 / 素材库）。
 */
export function mentionFromAttachment(
  attachment: StudioOperatorAttachment,
  scope: AssistantMentionScope,
): AssistantMention {
  const kind = ATTACHMENT_KIND[attachment.kind]
  const thumb =
    attachment.thumbnailUrl ??
    (attachment.kind === 'image' ? attachment.url : undefined)
  const isRecord =
    scope === ASSISTANT_MENTION_SCOPE_IDS.library ||
    scope === ASSISTANT_MENTION_SCOPE_IDS.result
  return {
    kind,
    id: attachment.id,
    label: clampLabel(attachment.label || attachment.id),
    scope,
    url: attachment.url,
    ...(thumb ? { thumb } : {}),
    ...(isRecord ? { generationId: attachment.id } : {}),
    ...(typeof attachment.seq === 'number' ? { seq: attachment.seq } : {}),
  }
}

export function clampLabel(label: string): string {
  const flat = label.replace(/\s+/g, ' ').trim()
  return flat.length > ASSISTANT_MENTION_LIMITS.maxLabelChars
    ? `${flat.slice(0, ASSISTANT_MENTION_LIMITS.maxLabelChars - 1)}…`
    : flat
}

/** 能被「看」的那几条（图；视频只在视频档）——看图名单与「将看 N 张」同源。 */
export function isLookableMention(
  mention: AssistantMention,
  includeVideo: boolean,
): boolean {
  if (!mention.url) return false
  return (
    mention.kind === ASSISTANT_MENTION_KIND_IDS.image ||
    (includeVideo && mention.kind === ASSISTANT_MENTION_KIND_IDS.video)
  )
}

// ─── 搜索 ────────────────────────────────────────────────────────────

/** `#12` / `12` / `图_012` 里的那个号。 */
function readIndexTerm(term: string): number | null {
  const match = term.match(/^#?(\d{1,7})$/) ?? term.match(/_(\d{1,7})$/)
  return match ? Number(match[1]) : null
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase()
}

/** 一个词在一条候选上能拿几分；0 = 没命中（多词时任一个词没命中整条就不要）。 */
function scoreTerm(candidate: AssistantMentionCandidate, term: string): number {
  const label = normalize(candidate.label)
  const index = readIndexTerm(term)
  if (index !== null && candidate.seq === index) return 100
  if (term.startsWith('#')) {
    // `#` 开头只认序号（找不到就别拿 `#` 去撞名字里的井号）。
    return index === null && label.includes(term) ? 30 : 0
  }
  if (label === term) return 80
  if (label.startsWith(term)) return 60
  if (label.split(/[\s·_\-/()（）「」]+/).some((word) => word.startsWith(term)))
    return 50
  if (label.includes(term)) return 40
  if (candidate.subtitle && normalize(candidate.subtitle).includes(term))
    return 20
  if (candidate.keywords?.some((word) => normalize(word).includes(term)))
    return 10
  if (candidate.preview && normalize(candidate.preview).includes(term)) return 5
  return 0
}

/** 拆词：空白分隔，最多 `maxQueryTerms` 个。 */
export function splitMentionQuery(query: string): string[] {
  return normalize(query)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, ASSISTANT_MENTION_LIMITS.maxQueryTerms)
}

/**
 * 搜索排序（§10b）：**多词都要命中**；序号精确 > 名字全等 > 前缀 > 词首 > 子串 >
 * 副标题（画布 / 文件夹 / 类型）> 标签 / 提示词。同分时最近用过的在前，再按原顺序。
 * 最多 `limit` 条。
 */
export function searchMentionCandidates<T extends AssistantMentionCandidate>(
  candidates: readonly T[],
  query: string,
  options: {
    readonly recentKeys?: readonly string[]
    readonly limit?: number
  } = {},
): T[] {
  const terms = splitMentionQuery(query)
  const limit = options.limit ?? ASSISTANT_MENTION_LIMITS.searchResults
  if (!terms.length) return candidates.slice(0, limit)
  const recent = new Map(
    (options.recentKeys ?? []).map((key, index) => [key, index]),
  )
  const scored: { candidate: T; score: number; order: number }[] = []
  const seen = new Set<string>()
  candidates.forEach((candidate, order) => {
    const key = mentionKey(candidate)
    if (seen.has(key)) return
    let score = 0
    for (const term of terms) {
      const termScore = scoreTerm(candidate, term)
      if (termScore === 0) return
      score += termScore
    }
    seen.add(key)
    scored.push({ candidate, score, order })
  })
  const rank = (key: string) => recent.get(key) ?? Number.POSITIVE_INFINITY
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      rank(mentionKey(a.candidate)) - rank(mentionKey(b.candidate)) ||
      a.order - b.order,
  )
  return scored.slice(0, limit).map((entry) => entry.candidate)
}

/** 「最近使用」里还在候选里的那几条（按最近在前）。 */
export function pickRecentCandidates<T extends AssistantMentionCandidate>(
  candidates: readonly T[],
  recentKeys: readonly string[],
  limit: number = ASSISTANT_MENTION_LIMITS.recent,
): T[] {
  const byKey = new Map(candidates.map((item) => [mentionKey(item), item]))
  return recentKeys
    .flatMap((key) => {
      const hit = byKey.get(key)
      return hit ? [hit] : []
    })
    .slice(0, limit)
}

/** 把刚用过的几条记到最前（去重、截到上限）。 */
export function pushRecentKeys(
  current: readonly string[],
  used: readonly string[],
  limit: number = ASSISTANT_MENTION_LIMITS.recent * 4,
): string[] {
  const next: string[] = []
  for (const key of [...used].reverse()) if (!next.includes(key)) next.push(key)
  for (const key of current) if (!next.includes(key)) next.push(key)
  return next.slice(0, limit)
}

// ─── 发给模型 ────────────────────────────────────────────────────────

const SCOPE_NOTE: Record<AssistantMentionScope, string> = {
  canvas: 'canvas card',
  reference: 'reference slot',
  result: 'result',
  library: 'library asset',
  attachment: 'attached',
  character: 'character',
  lora: 'LoRA',
}

/**
 * 对白里那一行 `[mentioned: …]` —— 与 `[attached: …]` 并排，模型读得到「「X」是
 * 画布上的哪一种东西」。看得见的媒体带地址（视觉线与 `critique_result` 还认它）。
 * ⚠ 它是给模型读的**展示文本**，⛔ 不是准入名单（名单是 `mentionedAssets` / `mentions`）。
 */
export function describeMentionNote(
  mentions: readonly AssistantMention[],
): string {
  if (!mentions.length) return ''
  return `\n[mentioned: ${mentions
    .map((mention) => {
      const role = mention.role ? ` as ${mention.role.replace('_', ' ')}` : ''
      const url =
        mention.url &&
        (mention.kind === ASSISTANT_MENTION_KIND_IDS.image ||
          mention.kind === ASSISTANT_MENTION_KIND_IDS.video ||
          mention.kind === ASSISTANT_MENTION_KIND_IDS.audio)
          ? ` ${mention.url}`
          : ''
      return `「${mention.label}」 (${mention.kind} · ${SCOPE_NOTE[mention.scope]}${role})${url}`
    })
    .join(', ')}]`
}
