import {
  ASSISTANT_LIBRARY_SCREEN_LIMIT,
  ASSISTANT_LIBRARY_TILE_ABOUT_LIMITS as ABOUT_LIMITS,
  type AssistantLibraryTileAbout,
  type AssistantLibraryViewScreen,
} from '@/types/assistant-operator'

/**
 * 屏上那几格（owner 10-30「像 Claude in Chrome 那样看见页面」）：发请求那一刻扫一遍页面，
 * 只收**真在视口里**的格子，按位置从上到下、从左到右排好，连同缩略图与位置一起报给助手。
 *
 * ⭐ 各库只给格子挂 `screenItemProps(...)` 那几个 data 属性，⛔ 不各自算「屏上前几个」：
 *   列表前 20 个与你滚到哪儿无关，扫 DOM 才是你眼前那一屏。
 * ⚠ 藏起来的（`display: none`、宽高为 0）与露出不到一半的不算。
 */

const ATTR = {
  kind: 'data-screen-kind',
  name: 'data-screen-name',
  thumb: 'data-screen-thumb',
  /** 这一格的一行摘要（JSON：类型 · 模型 · 时间 · 提示词前若干字）。 */
  about: 'data-screen-about',
} as const

/** 一格露出多少才算在屏上。 */
const MIN_VISIBLE_RATIO = 0.4
/** 同一排的判据：上沿差不到这么多像素算同一排（瀑布流各列错开）。 */
const ROW_TOLERANCE_PX = 24

type ScreenKind = AssistantLibraryViewScreen['kind']

/** 库里每一格挂上：助手「看屏」时认得出这一格是谁、长什么样。 */
export function screenItemProps(
  kind: ScreenKind,
  name: string | null | undefined,
  thumb?: string | null,
  about?: ScreenItemAboutInput | null,
): Record<string, string> {
  if (!name) return {}
  const summary = about ? screenItemAbout(about) : null
  return {
    [ATTR.kind]: kind,
    [ATTR.name]: name,
    // ⚠ 过长的地址不报：一格不合规整条请求会被拒。
    ...(thumb && /^https?:\/\//.test(thumb) && thumb.length <= 2_000
      ? { [ATTR.thumb]: thumb }
      : {}),
    ...(summary ? { [ATTR.about]: JSON.stringify(summary) } : {}),
  }
}

/**
 * 页面给一格的摘要（11-17 素材库：「第 4 行那张粉头发女孩」助手对不上号 —— 屏上只报了编号）。
 * ⭐ 摘要挂在格子自己身上、跟着扫屏走：只有屏上那 ≤20 格进请求，⛔ 不随已加载的整份列表
 *   （素材可上千条）。
 */
export interface ScreenItemAboutInput {
  type?: string | null
  model?: string | null
  /** 提示词 / 标题；这里截到上限。 */
  text?: string | null
  /** 时间：`Date`、ISO 串，或已经写好的 `YYYY-MM-DD HH:mm`。 */
  at?: Date | string | null
}

function clip(
  value: string | null | undefined,
  max: number,
): string | undefined {
  const text = value?.replace(/\s+/g, ' ').trim()
  if (!text) return undefined
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

const STAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/

function stamp(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined
  if (typeof value === 'string' && STAMP.test(value)) return value
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  // UTC、精确到分：模型只要分得清「最近那张」。
  return date.toISOString().slice(0, 16).replace('T', ' ')
}

/** 截好、去空：一格摘要不带空字段；全空 = `null`。 */
export function screenItemAbout(
  input: ScreenItemAboutInput,
): AssistantLibraryTileAbout | null {
  const about: AssistantLibraryTileAbout = {}
  const type = clip(input.type?.toLowerCase(), ABOUT_LIMITS.typeChars)
  const model = clip(input.model, ABOUT_LIMITS.modelChars)
  const text = clip(input.text, ABOUT_LIMITS.textChars)
  const at = stamp(input.at)
  if (type) about.type = type
  if (model) about.model = model
  if (text) about.text = text
  if (at) about.at = at
  return Object.keys(about).length ? about : null
}

/** 素材 / 画廊里一件产物的那一行摘要（两处同一份写法，⛔ 各写各的）。 */
export function generationScreenAbout(generation: {
  outputType?: string | null
  model?: string | null
  prompt?: string | null
  createdAt?: Date | string | null
}): ScreenItemAboutInput {
  return {
    type: generation.outputType,
    model: generation.model,
    text: generation.prompt,
    at: generation.createdAt,
  }
}

/** 读回格子上那份摘要：不是 JSON / 形状不对就当没有（⛔ 一格坏的拖垮整条请求）。 */
function readAbout(raw: string | null): AssistantLibraryTileAbout | undefined {
  if (!raw) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (!parsed || typeof parsed !== 'object') return undefined
  const record = parsed as Record<string, unknown>
  const pick = (key: keyof AssistantLibraryTileAbout) => {
    const value = record[key]
    return typeof value === 'string' ? value : undefined
  }
  return (
    screenItemAbout({
      type: pick('type'),
      model: pick('model'),
      text: pick('text'),
      at: pick('at'),
    }) ?? undefined
  )
}

export interface ScannedScreen {
  readonly kind: ScreenKind
  readonly visible: string[]
  readonly tiles: NonNullable<AssistantLibraryViewScreen['tiles']>
  readonly viewport: NonNullable<AssistantLibraryViewScreen['viewport']>
}

function round(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 1000) / 1000
}

/** 扫一遍：`kind` 给了就只收那一类（对不上开着的库的不算）；屏上一格都没有回 `null`。 */
export function scanScreen(
  kind: ScreenKind | null,
  root: ParentNode = document,
): ScannedScreen | null {
  if (typeof window === 'undefined') return null
  const width = window.innerWidth
  const height = window.innerHeight
  if (!width || !height) return null
  const seen = new Set<string>()
  const found: {
    kind: ScreenKind
    name: string
    thumb?: string
    about?: AssistantLibraryTileAbout
    rect: DOMRect
  }[] = []
  for (const element of root.querySelectorAll<HTMLElement>(`[${ATTR.name}]`)) {
    const itemKind = element.getAttribute(ATTR.kind) as ScreenKind | null
    const name = element.getAttribute(ATTR.name)?.trim().slice(0, 200)
    if (!itemKind || !name || (kind && itemKind !== kind)) continue
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) continue
    const shownWidth = Math.min(rect.right, width) - Math.max(rect.left, 0)
    const shownHeight = Math.min(rect.bottom, height) - Math.max(rect.top, 0)
    if (shownWidth <= 0 || shownHeight <= 0) continue
    if (
      (shownWidth * shownHeight) / (rect.width * rect.height) <
      MIN_VISIBLE_RATIO
    )
      continue
    const key = `${itemKind}:${name}`
    if (seen.has(key)) continue
    seen.add(key)
    const thumb = element.getAttribute(ATTR.thumb) ?? undefined
    const about = readAbout(element.getAttribute(ATTR.about))
    found.push({
      kind: itemKind,
      name,
      thumb,
      ...(about ? { about } : {}),
      rect,
    })
  }
  if (found.length === 0) return null
  // 只留一类：没指定时取最多的那一类（库里同时露出两类格子极少见）。
  const counts = new Map<ScreenKind, number>()
  for (const item of found)
    counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1)
  const chosen =
    kind ?? [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0]
  const items = found
    .filter((item) => item.kind === chosen)
    .sort((a, b) =>
      Math.abs(a.rect.top - b.rect.top) <= ROW_TOLERANCE_PX
        ? a.rect.left - b.rect.left
        : a.rect.top - b.rect.top,
    )
    .slice(0, ASSISTANT_LIBRARY_SCREEN_LIMIT)
  return {
    kind: chosen,
    visible: items.map((item) => item.name),
    tiles: items.map((item) => ({
      ...(item.thumb ? { thumb: item.thumb } : {}),
      ...(item.about ? { about: item.about } : {}),
      box: [
        round(item.rect.left / width),
        round(item.rect.top / height),
        round(item.rect.width / width),
        round(item.rect.height / height),
      ] as [number, number, number, number],
    })),
    viewport: { width: Math.round(width), height: Math.round(height) },
  }
}
