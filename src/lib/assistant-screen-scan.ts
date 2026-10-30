import {
  ASSISTANT_LIBRARY_SCREEN_LIMIT,
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
): Record<string, string> {
  if (!name) return {}
  return {
    [ATTR.kind]: kind,
    [ATTR.name]: name,
    // ⚠ 过长的地址不报：一格不合规整条请求会被拒。
    ...(thumb && /^https?:\/\//.test(thumb) && thumb.length <= 2_000
      ? { [ATTR.thumb]: thumb }
      : {}),
  }
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
    found.push({ kind: itemKind, name, thumb, rect })
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
