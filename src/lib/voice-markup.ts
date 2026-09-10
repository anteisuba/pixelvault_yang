/**
 * 行内语气标记的**编译器**（v3 spec §4 / §8.3，画板 `AudioSelected.dc.html`）。
 *
 * ── 为什么是「编译器」而不是一个 `emotion` 参数 ────────────────────────────
 * Fish 的 `/v1/tts` 请求体里**根本没有** `emotion` / `style` / `instruction` 字段
 * （调研 `fish-audio-emotion.md` §2.6 逐字核过 OpenAPI）——情绪只有一条路：写进
 * `text` 的方括号标记。所以「UI 选项翻译成标记」不是一种设计选择，而是唯一实现
 * 路径。UI 上那颗黑底 chip 与文本里的 `[愤怒]` 是**同一份真值**（文本），⛔ 不另存
 * 一份「这句的情绪是什么」的影子状态——那正是「UI 与文本不同步」那一类经典 bug 的
 * 出处。
 *
 * ── 三条判据 ──────────────────────────────────────────────────────────────
 * ① **文本是唯一真值**：标记就住在台词里，可退格整体删、可手写。
 * ② **认不出的标签原样进方括号**：S2 明说标记不限于固定集（官方示例
 *    `[whispers sweetly]` / `[laughing nervously]`），所以「自定义描述」不需要任何
 *    转义，⛔ 不因为查不到映射就把用户写的东西吞掉。
 * ③ **纯函数**：不碰 DOM / store / 网络。视频卡的 @语音 与剪辑台的「加一句台词」
 *    复用同一份（spec §4 末句）。
 *
 * ⚠ 标记一律编译成**英文**：官方全部示例都是英文标记，中文标记「大概率有效但零
 * 官方示例」（调研 §2.5）。台词照旧是中文——S2.1-Pro 自动检测语言。
 */

/** 一条标签：中文显示名 → Fish 方括号里的英文标记。 */
export interface VoiceMarkupTag {
  readonly label: string
  readonly tag: string
  /** 官方固定表内的标记；`false` = S2 允许的自由描述（语法官方，听感需实测）。 */
  readonly official: boolean
}

/**
 * 情绪组（画板那一排）。官方基础情绪 24 个里取常用的九个，
 * 「温柔」官方表内无对应词条 —— 走自由描述。
 */
export const VOICE_MARKUP_EMOTIONS: readonly VoiceMarkupTag[] = [
  { label: '愤怒', tag: 'angry', official: true },
  { label: '悲伤', tag: 'sad', official: true },
  { label: '开心', tag: 'happy', official: true },
  { label: '害怕', tag: 'scared', official: true },
  { label: '惊讶', tag: 'surprised', official: true },
  { label: '厌恶', tag: 'disgusted', official: true },
  { label: '平静', tag: 'calm', official: true },
  { label: '兴奋', tag: 'excited', official: true },
  { label: '温柔', tag: 'gentle', official: false },
  { label: '讽刺', tag: 'sarcastic', official: true },
]

/**
 * 语气 / 音量组。「咬牙切齿」「颤抖」不在官方固定表里，用官方明确允许的自由
 * 自然语言描述（`[through gritted teeth]` 与 owner 那句用例同源）。
 */
export const VOICE_MARKUP_TONES: readonly VoiceMarkupTag[] = [
  { label: '咬牙切齿', tag: 'through gritted teeth', official: false },
  { label: '耳语', tag: 'whispering', official: true },
  { label: '喊', tag: 'shouting', official: true },
  { label: '颤抖', tag: 'trembling', official: false },
  { label: '急促', tag: 'in a hurry tone', official: true },
  { label: '哽咽', tag: 'sobbing', official: true },
]

export const VOICE_MARKUP_INTENSITY_IDS = {
  light: 'light',
  medium: 'medium',
  strong: 'strong',
} as const

export type VoiceMarkupIntensity =
  (typeof VOICE_MARKUP_INTENSITY_IDS)[keyof typeof VOICE_MARKUP_INTENSITY_IDS]

/**
 * 强度三档。**用官方的手段**（修饰词 `slightly` / `very`，官方原文示例），
 * ⛔ 不自造强度语法。中档不加修饰词 —— 它就是标记本身。
 *
 * `labelPrefix` 是**文本里**的写法（`[轻·愤怒]`）：强度必须住在文本里，否则它就
 * 成了第二份真值。
 */
export interface VoiceMarkupIntensitySpec {
  readonly id: VoiceMarkupIntensity
  readonly label: string
  readonly tagPrefix: string
}

export const VOICE_MARKUP_INTENSITIES: readonly VoiceMarkupIntensitySpec[] = [
  { id: VOICE_MARKUP_INTENSITY_IDS.light, label: '轻', tagPrefix: 'slightly ' },
  { id: VOICE_MARKUP_INTENSITY_IDS.medium, label: '中', tagPrefix: '' },
  { id: VOICE_MARKUP_INTENSITY_IDS.strong, label: '强', tagPrefix: 'very ' },
]

export const VOICE_MARKUP = {
  open: '[',
  close: ']',
  /** 强度与标签之间的分隔符（`[强·愤怒]`）。 */
  intensitySeparator: '·',
  /** 官方建议每句 ≤ 3 个标记（"Maximum of 3 combined emotions per sentence"）。 */
  maxPerSentence: 3,
  /** 句子边界 —— 「插在句首」按它回溯。 */
  sentenceEnders: ['。', '！', '？', '.', '!', '?', '\n'],
} as const

const ALL_TAGS: readonly VoiceMarkupTag[] = [
  ...VOICE_MARKUP_EMOTIONS,
  ...VOICE_MARKUP_TONES,
]

/** 这个中文标签有没有登记过（登记过 = 编译成英文，没登记 = 原样进方括号）。 */
export function findVoiceMarkupTag(label: string): VoiceMarkupTag | undefined {
  return ALL_TAGS.find((item) => item.label === label)
}

export interface VoiceMarkupToken {
  /** 方括号里的原文，如 `强·愤怒`。 */
  readonly raw: string
  /** 去掉强度前缀之后的标签，如 `愤怒`。 */
  readonly label: string
  readonly intensity?: VoiceMarkupIntensity
  /** 在原文里的区间（含左方括号，不含右方括号之后）。 */
  readonly start: number
  readonly end: number
}

export type VoiceMarkupSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'marker'; readonly token: VoiceMarkupToken }

function splitIntensity(raw: string): {
  label: string
  intensity?: VoiceMarkupIntensity
} {
  const index = raw.indexOf(VOICE_MARKUP.intensitySeparator)
  if (index <= 0) return { label: raw }
  const head = raw.slice(0, index)
  const spec = VOICE_MARKUP_INTENSITIES.find((item) => item.label === head)
  // ⚠ 只有**恰好等于**某一档强度名时才当强度切：用户的自定义描述里也可能带
  // 间隔号，那种整串都是标签。
  if (!spec) return { label: raw }
  return { label: raw.slice(index + 1), intensity: spec.id }
}

/**
 * 把一行台词切成「文字段 / 标记段」。渲染 chip 与落 `[]` 都读这一份。
 *
 * ⚠ 不做嵌套、不做转义：方括号里再出现方括号一律按最近的 `]` 收口 —— 台词是
 * 人写的自然语言，多一层语法只会让退格删不干净。
 */
export function parseVoiceMarkup(text: string): VoiceMarkupSegment[] {
  const segments: VoiceMarkupSegment[] = []
  /** 还没被交出去的那段文字从哪开始。 */
  let cursor = 0
  /** 从哪继续找左方括号。⚠ 与 `cursor` 分开：跳过一对空方括号时**不能**动
   *  `cursor`，否则它前面那段文字会被整段吞掉。 */
  let searchFrom = 0

  while (searchFrom < text.length) {
    const open = text.indexOf(VOICE_MARKUP.open, searchFrom)
    if (open === -1) break
    const close = text.indexOf(VOICE_MARKUP.close, open + 1)
    if (close === -1) break
    const raw = text.slice(open + 1, close)
    // 空方括号不是标记，是用户打的两个字符。
    if (raw.trim().length === 0) {
      searchFrom = close + 1
      continue
    }
    if (open > cursor) {
      segments.push({ kind: 'text', text: text.slice(cursor, open) })
    }
    segments.push({
      kind: 'marker',
      token: {
        raw,
        ...splitIntensity(raw),
        start: open,
        end: close + 1,
      },
    })
    cursor = close + 1
    searchFrom = close + 1
  }

  if (cursor < text.length) {
    segments.push({ kind: 'text', text: text.slice(cursor) })
  }
  return segments
}

/** 这行台词里有没有行内标记 —— 预览行要不要出来就问它。 */
export function hasVoiceMarkup(text: string): boolean {
  return parseVoiceMarkup(text).some((segment) => segment.kind === 'marker')
}

/**
 * 光标停在一个标记**右边**时，退格要删掉的整段区间（spec §1.7 的同一条手感：
 * chip 整体删，⛔ 不是一次退一个字符把 `[愤怒]` 啃成 `[愤怒`）。
 *
 * 返回 `null` = 这一下退格不特殊，交给浏览器。
 */
export function voiceMarkupDeletionRangeAt(
  text: string,
  caret: number,
): { readonly start: number; readonly end: number } | null {
  for (const segment of parseVoiceMarkup(text)) {
    if (segment.kind !== 'marker') continue
    if (segment.token.end === caret) {
      return { start: segment.token.start, end: segment.token.end }
    }
  }
  return null
}

/** 光标所在句子的起点（回溯到上一个句末符之后）。 */
export function voiceMarkupSentenceStart(text: string, caret: number): number {
  const clamped = Math.min(Math.max(caret, 0), text.length)
  for (let index = clamped - 1; index >= 0; index -= 1) {
    const char = text.charAt(index)
    if ((VOICE_MARKUP.sentenceEnders as readonly string[]).includes(char)) {
      return index + 1
    }
  }
  return 0
}

/** 这句里已经有几个标记 —— 官方建议 ≤ 3，UI 硬拦。 */
export function countVoiceMarkupInSentence(
  text: string,
  caret: number,
): number {
  const start = voiceMarkupSentenceStart(text, caret)
  let end = text.length
  for (let index = start; index < text.length; index += 1) {
    if (
      (VOICE_MARKUP.sentenceEnders as readonly string[]).includes(
        text.charAt(index),
      )
    ) {
      end = index + 1
      break
    }
  }
  return parseVoiceMarkup(text.slice(start, end)).filter(
    (segment) => segment.kind === 'marker',
  ).length
}

export interface VoiceMarkupInsert {
  readonly label: string
  readonly intensity?: VoiceMarkupIntensity
}

/**
 * 在光标所在**句首**插入若干标记（画板：「插在句首，可叠两个」）。
 *
 * 超过 `maxPerSentence` 的部分**丢掉而不是挤进去**（官方 Don'ts：别堆标记）——
 * 与 `NodePromptBar` 对超额 chip 的处理同一条纪律。
 */
export function insertVoiceMarkup(
  text: string,
  caret: number,
  inserts: readonly VoiceMarkupInsert[],
): { readonly text: string; readonly caret: number } {
  const at = voiceMarkupSentenceStart(text, caret)
  const room = Math.max(
    0,
    VOICE_MARKUP.maxPerSentence - countVoiceMarkupInSentence(text, caret),
  )
  const usable = inserts.slice(0, room)
  if (usable.length === 0) return { text, caret }

  const chunk = usable
    .map((insert) => {
      const spec = VOICE_MARKUP_INTENSITIES.find(
        (item) => item.id === insert.intensity,
      )
      const prefix =
        spec && spec.id !== VOICE_MARKUP_INTENSITY_IDS.medium
          ? `${spec.label}${VOICE_MARKUP.intensitySeparator}`
          : ''
      return `${VOICE_MARKUP.open}${prefix}${insert.label}${VOICE_MARKUP.close}`
    })
    .join('')

  return {
    text: `${text.slice(0, at)}${chunk}${text.slice(at)}`,
    caret: at + chunk.length,
  }
}

export interface VoiceMarkupCompileResult {
  /** 送给 Fish 的 `text`：标记原地编译成官方方括号写法。 */
  readonly text: string
  /** 编译出来的标记，按出现顺序（不含方括号）。 */
  readonly tags: readonly string[]
  /** 去掉全部标记的净台词（存档 / 显示摘要用）。 */
  readonly plainText: string
}

/**
 * 台词（含行内标记）→ Fish 文本。
 *
 * `[强·愤怒][咬牙切齿] 把她还给我！` → `[very angry][through gritted teeth] 把她还给我！`
 *
 * ⚠ 标记**原地**编译，不上提到句首：S2 明确允许标记出现在句中（官方示例
 * `I can't believe it [gasp] you actually did it`），一段多情绪正是选 S2 的理由。
 */
export function compileVoiceMarkup(text: string): VoiceMarkupCompileResult {
  const tags: string[] = []
  let compiled = ''
  let plain = ''

  for (const segment of parseVoiceMarkup(text)) {
    if (segment.kind === 'text') {
      compiled += segment.text
      plain += segment.text
      continue
    }
    const { label, intensity } = segment.token
    const known = findVoiceMarkupTag(label)
    const spec = VOICE_MARKUP_INTENSITIES.find((item) => item.id === intensity)
    // 认不出的标签 = 自定义描述，**原样**进方括号（强度前缀对它无意义，
    // 用户自己就是在写自然语言）。
    const tag = known
      ? `${spec?.tagPrefix ?? ''}${known.tag}`
      : segment.token.raw
    tags.push(tag)
    compiled += `${VOICE_MARKUP.open}${tag}${VOICE_MARKUP.close}`
  }

  return { text: compiled, tags, plainText: plain.trim() }
}
