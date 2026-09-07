/**
 * 产物名的**唯一一套算法**（第三期 · 工作台 N1）。词法见
 * `constants/generation-naming.ts` 的头注（含「序号为什么不是计数器」）。
 *
 * 纯函数、无 `server-only`：写入侧（`generation.service.ts`）、助手侧
 * （`search_assets` / 快照结果行）、客户端（`@` 选择器、结果行卡角标）**必须**
 * 算出同一个字符串，所以它只能是一个两边都进得来的纯模块。
 *
 * ── 名字分两段，只有前一段是「身份」 ──────────────────────────────
 *   `图_012` · `银发少女立绘`
 *    └ 标签 ┘   └── 摘要 ──┘
 * **标签**只由 `(outputType, id)` 决定 —— 任何入口、任何时候都一样，`@` 解析
 * 认的就是它。**摘要**是装饰：优先用助手给的 `label`（写进 snapshot 时定下），
 * 没有就取提示词头几个字。于是「助手给过 label 的那些行在列表口读不到 label」
 * 这件事只会让摘要退化，⛔ 不会让指认失灵。
 */

import {
  ASSISTANT_MENTION_LIMITS,
  GENERATION_NAME,
  GENERATION_NAME_PREFIX_BY_OUTPUT_TYPE,
  type GenerationNameOutputType,
} from '@/constants/generation-naming'

const DEFAULT_OUTPUT_TYPE: GenerationNameOutputType = 'IMAGE'

function prefixOf(outputType: string | null | undefined): string {
  const key = (outputType ?? DEFAULT_OUTPUT_TYPE) as GenerationNameOutputType
  return (
    GENERATION_NAME_PREFIX_BY_OUTPUT_TYPE[key] ??
    GENERATION_NAME_PREFIX_BY_OUTPUT_TYPE[DEFAULT_OUTPUT_TYPE]
  )
}

/**
 * 行 id → 序号。FNV-1a（32 位），取模到 `serialModulo`。
 *
 * ⚠ 要求只有一条：**同一个 id 永远得到同一个数**（跨进程、跨语言无关，这里
 * 只有 TS 一处实现）。⛔ 不用 `Math.random`、⛔ 不用时间、⛔ 不读 DB。
 */
export function deriveGenerationSerial(id: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index)
    // FNV prime 16777619，用移位保持在 32 位无符号域内。
    hash =
      (hash +
        ((hash << 1) +
          (hash << 4) +
          (hash << 7) +
          (hash << 8) +
          (hash << 24))) >>>
      0
  }
  return hash % GENERATION_NAME.serialModulo
}

/** `12` → `012`。超出位数时原样展开（同 `formatShotPrefix` 的规矩，不截断）。 */
export function formatGenerationSerial(serial: number): string {
  return String(serial).padStart(GENERATION_NAME.serialDigits, '0')
}

export interface GenerationNameIdentity {
  readonly id: string
  readonly outputType?: string | null
}

/** 身份段 —— `图_012`。`@` 解析认的就是这一段。 */
export function buildGenerationTag({
  id,
  outputType,
}: GenerationNameIdentity): string {
  return `${prefixOf(outputType)}${GENERATION_NAME.prefixSeparator}${formatGenerationSerial(
    deriveGenerationSerial(id),
  )}`
}

/**
 * 摘要段 —— 提示词/label 的头 8 个字。
 *
 * ⚠ 先把换行与连续空白压成一个空格：提示词常常是多行的，原样截会把一段排版
 * 塞进名字里。空串回 `undefined`（上传来的行 prompt 就是空的），调用方于是只
 * 拿到身份段，⛔ 不是一个尾巴上挂着 `·` 的名字。
 */
export function buildGenerationSummary(
  source: string | null | undefined,
): string | undefined {
  if (typeof source !== 'string') return undefined
  const flat = source.replace(/\s+/g, ' ').trim()
  if (!flat) return undefined
  // ⚠ 截完再 trim 一次：正好切在空格上时会留一个尾空格，落进名字里看不见但
  // 会让「名字相等」判据莫名其妙地不相等。
  const clamped = flat.slice(0, GENERATION_NAME.summaryChars).trim()
  return clamped || undefined
}

export interface GenerationNameInput extends GenerationNameIdentity {
  readonly prompt?: string | null
  /** 助手给的名字（`label` 覆盖摘要）。 */
  readonly label?: string | null
}

/**
 * 完整名字。**幂等**：同一份输入永远同一个字符串，⛔ 不带任何时间/随机来源。
 */
export function buildGenerationDisplayName(input: GenerationNameInput): string {
  const tag = buildGenerationTag(input)
  const summary =
    buildGenerationSummary(input.label) ?? buildGenerationSummary(input.prompt)
  const name = summary ? `${tag}${GENERATION_NAME.separator}${summary}` : tag
  return name.slice(0, GENERATION_NAME.maxLength)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 快照里存下来的那个名字（存量行没有 → `undefined`）。 */
export function readSnapshotDisplayName(snapshot: unknown): string | undefined {
  if (!isRecord(snapshot)) return undefined
  const stored = snapshot.displayName
  return typeof stored === 'string' && stored.trim() ? stored : undefined
}

export interface GenerationNameSource extends GenerationNameIdentity {
  readonly prompt?: string | null
  readonly snapshot?: unknown
}

/**
 * 读取侧的名字：**存了就用存的，没存就按同一条规则现算**（存量行不回填库）。
 *
 * ⚠ 现算与存的那次算的**身份段一定相同**（都只看 id + outputType），差别最多
 * 出现在摘要上（助手给过 label 而这一跳没带 snapshot）。
 */
export function resolveGenerationDisplayName(
  generation: GenerationNameSource,
): string {
  return (
    readSnapshotDisplayName(generation.snapshot) ??
    buildGenerationDisplayName(generation)
  )
}

/* ── `@` 解析 ───────────────────────────────────────────────────────── */

const PREFIX_ALTERNATION = Object.values(GENERATION_NAME_PREFIX_BY_OUTPUT_TYPE)
  .slice()
  // 长的在前：`视频` 与 `图` 无前缀关系，但这条规矩让以后加前缀时不会踩到。
  .sort((a, b) => b.length - a.length)
  .join('|')

/**
 * 正文里的 `@图_012` / `@图_012·银发少女立绘`。
 *
 * 三条判据与 `readMentionTrigger` 一致（`@` 前是行首或空白，⛔ 不匹配
 * `a@b.com`），另加一条：**序号必须是数字**，否则 `@图片很好看` 会被当成一次
 * 提及。摘要段可有可无 —— 匹配只看身份段，多出来的那截原样留在句子里。
 */
const MENTION_PATTERN = new RegExp(
  `(^|\\s)@((?:${PREFIX_ALTERNATION})${GENERATION_NAME.prefixSeparator}\\d{${GENERATION_NAME.serialDigits},})`,
  'gu',
)

export interface GenerationMentionToken {
  /** 身份段，不含 `@`。 */
  readonly tag: string
  /** 身份段里那个数字。 */
  readonly serial: number
}

/**
 * 读出正文里所有产物名提及，**去重、按出现顺序**，最多
 * `ASSISTANT_MENTION_LIMITS.maxPerMessage` 个（超出的丢掉，见常量头注）。
 */
export function readGenerationMentions(
  text: string,
): readonly GenerationMentionToken[] {
  const seen = new Set<string>()
  const tokens: GenerationMentionToken[] = []
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const tag = match[2]
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    const digits = tag.split(GENERATION_NAME.prefixSeparator)[1] ?? ''
    tokens.push({ tag, serial: Number.parseInt(digits, 10) })
    if (tokens.length >= ASSISTANT_MENTION_LIMITS.maxPerMessage) break
  }
  return tokens
}

export interface GenerationMentionCandidate {
  readonly id: string
  readonly label?: string
}

/**
 * 一个提及落到哪一条候选上。**名单之外一律不命中**（返回 `undefined`）——
 * 名字是给人念的，不是凭证：服务端拿它去 `mentionedAssets` 里找，找不到就拒。
 *
 * ⚠ 命中判据是**序号相等**（身份段只由 id 决定），不是「label 里含这几个字」：
 * 后者会让 `@图_012` 命中一条摘要里恰好写着 `图_012` 的行。
 * ⚠ 撞号时取**第一条** —— 调用方按「新的在前」给名单（选择器与结果行都是），
 * 于是撞号退化成「指的是最近那一张」，⛔ 不静默挂两张。
 */
export function matchGenerationMention(
  token: GenerationMentionToken,
  candidates: readonly GenerationMentionCandidate[],
): GenerationMentionCandidate | undefined {
  return candidates.find(
    (candidate) => deriveGenerationSerial(candidate.id) === token.serial,
  )
}

/**
 * 正文 → 命中的候选（保持出现顺序，去重）。未知名字**不成 chip**：用户写错一个
 * 号时该看见「什么都没挂」，⛔ 不是悄悄挂上一张别的图。
 */
export function resolveGenerationMentions(
  text: string,
  candidates: readonly GenerationMentionCandidate[],
): readonly GenerationMentionCandidate[] {
  const picked: GenerationMentionCandidate[] = []
  const seen = new Set<string>()
  for (const token of readGenerationMentions(text)) {
    const hit = matchGenerationMention(token, candidates)
    if (!hit || seen.has(hit.id)) continue
    seen.add(hit.id)
    picked.push(hit)
  }
  return picked
}
