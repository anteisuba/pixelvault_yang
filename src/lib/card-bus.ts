/**
 * 卡片总线 v3 的纯函数（进度表 35 · 第 ② 片）。
 *
 * 三件事，全部不碰库：旧的四份图列表 → 参考槽；handle 分配；正文里 `@handle`
 * 的最长匹配。回填脚本、写方双写、编译总线都从这里取，⛔ 别在调用方各写一份。
 * 契约见 `docs/references/domains/cards.md`「卡片总线 v3 契约」。
 */

import {
  CHARACTER_CARD,
  type SourceImageViewType,
} from '@/constants/cards/character-card'
import {
  NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID,
  type NodeStudioReferenceRole,
} from '@/constants/node-studio'
import type { CharacterReferenceSlot } from '@/types'

// ─── 旧数据 → 参考槽 ─────────────────────────────────────────────

export interface LegacyCardImages {
  /** 主图（第一张上传的图）。 */
  sourceImageUrl: string
  /** 旧的平铺上传列表。 */
  sourceImages?: readonly string[] | null
  /** 旧的结构化上传列表（带视角）。有它就以它为准。 */
  sourceImageEntries?: readonly {
    url: string
    viewType?: SourceImageViewType
    label?: string
  }[]
  /** 精修挑出来的图。 */
  referenceImages?: readonly string[] | null
  /** v2 旁挂的用途表：`Record<url, role>`。 */
  referenceRoles?: Readonly<Record<string, NodeStudioReferenceRole>> | null
}

/**
 * 把一张卡上的旧图列表合成一条参考槽列表，结果**满足全部不变量**
 * （见 `CharacterReferenceSlotsSchema`）。
 *
 * ⭐ 主图永远是身份槽：它就是「这个角色长这样」的那一张，用途表给它记了别的
 * 用途也以主图为准。其余图的用途取用途表，查不到按身份算（旧卡上传的都是角色图）。
 * ⚠ 顺序与 id 是确定性的（上传的在前、精修的在后，`slot-1` 起编）——回填
 * 重跑得出同一份结果。超出上限的从尾部丢，⛔ 不丢主图。
 */
export function legacyImagesToReferenceSlots(
  legacy: LegacyCardImages,
): CharacterReferenceSlot[] {
  const roles = legacy.referenceRoles ?? {}
  const uploads =
    legacy.sourceImageEntries && legacy.sourceImageEntries.length > 0
      ? legacy.sourceImageEntries
      : (legacy.sourceImages ?? []).map((url) => ({ url }))

  const candidates: Omit<CharacterReferenceSlot, 'id'>[] = [
    {
      role: 'identity',
      url: legacy.sourceImageUrl,
      isPrimary: true,
      origin: 'upload',
    },
    ...uploads.map((entry) => ({
      role: roles[entry.url] ?? ('identity' as const),
      url: entry.url,
      isPrimary: false,
      origin: 'upload' as const,
      ...('viewType' in entry && entry.viewType && entry.viewType !== 'other'
        ? { viewType: entry.viewType }
        : {}),
      ...('label' in entry && entry.label ? { label: entry.label } : {}),
    })),
    ...(legacy.referenceImages ?? []).map((url) => ({
      role: roles[url] ?? ('identity' as const),
      url,
      isPrimary: false,
      origin: 'refine' as const,
    })),
  ]

  const seen = new Set<string>()
  const slots: CharacterReferenceSlot[] = []
  for (const candidate of candidates) {
    const url = candidate.url.trim()
    if (!url || seen.has(url)) continue
    if (slots.length >= CHARACTER_CARD.MAX_REFERENCE_SLOTS) break
    seen.add(url)
    const { label, ...rest } = candidate as typeof candidate & {
      label?: string
    }
    slots.push({
      ...rest,
      url,
      id: `slot-${slots.length + 1}`,
      // `custom` 必须带名字：旧的上传标签有就用它，没有就用用途本身的 id。
      ...(rest.role === NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID
        ? {
            customLabel: (label ?? NODE_STUDIO_REFERENCE_ROLE_CUSTOM_ID).slice(
              0,
              CHARACTER_CARD.CUSTOM_SLOT_LABEL_MAX_LENGTH,
            ),
          }
        : {}),
    })
  }
  return slots
}

// ─── handle ──────────────────────────────────────────────────────

/**
 * 比较 handle 用的键：NFKC 归一 + ASCII 小写。全角 `ＬＩＮ` 与 `lin`、
 * `Shiye` 与 `shiye` 算同一个；中日文原样（它们没有大小写）。
 */
export function cardHandleKey(handle: string): string {
  return handle.normalize('NFKC').replace(/[A-Z]/g, (c) => c.toLowerCase())
}

const HANDLE_FALLBACK = 'card'

/**
 * 从展示名派生 handle 的底子：NFKC → 空白换成 `-` → 去掉不允许的字符 →
 * 去掉开头的 `-` / `_` → 截到上限。什么都不剩就用 `card`。
 */
export function deriveCardHandleBase(name: string): string {
  const cleaned = name
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .replace(/^[-_]+/, '')
    .replace(/-{2,}/g, '-')
  return (
    [...cleaned].slice(0, CHARACTER_CARD.HANDLE_MAX_LENGTH).join('') ||
    HANDLE_FALLBACK
  )
}

/** 变体的 handle 底子：`父-变体`（`林夏-雨夜`）。没有变体名就只用父的。 */
export function deriveVariantHandleBase(
  parentHandle: string,
  variantLabel: string | null | undefined,
): string {
  const suffix = variantLabel ? deriveCardHandleBase(variantLabel) : ''
  if (!suffix || suffix === HANDLE_FALLBACK) return parentHandle
  return [...`${parentHandle}-${suffix}`]
    .slice(0, CHARACTER_CARD.HANDLE_MAX_LENGTH)
    .join('')
}

/**
 * 在「已占用」里给一个底子分配 handle：不冲突就原样用，冲突就依次加 `-2`、`-3`……
 * 分配到的那个会**写进 `taken`**（调用方按确定性顺序逐张调用即可）。
 * ⚠ `taken` 存的是 `cardHandleKey`，不是原串。
 */
export function allocateCardHandle(base: string, taken: Set<string>): string {
  for (let n = 1; ; n += 1) {
    const suffix = n === 1 ? '' : `-${n}`
    const head = [...base]
      .slice(0, CHARACTER_CARD.HANDLE_MAX_LENGTH - suffix.length)
      .join('')
    const handle = `${head}${suffix}`
    const key = cardHandleKey(handle)
    if (!taken.has(key)) {
      taken.add(key)
      return handle
    }
  }
}

// ─── `@handle` 最长匹配 ──────────────────────────────────────────

export interface CardHandleMention {
  /** 命中的那个已知 handle（原样）。 */
  handle: string
  /** `@` 在正文里的下标。 */
  index: number
  /** 含 `@` 在内的长度。 */
  length: number
}

/**
 * 在正文里找出所有 `@已知handle`，**最长匹配**：`@林夏-雨夜走进来` 在同时认得
 * `林夏` 与 `林夏-雨夜` 时取后者；`@林夏走进来` 只认得 `林夏` 时取 `林夏`。
 *
 * ⛔ 不用 `\b\w+\b` 切词：中文没有词边界，那样一个都切不出来。
 * ⚠ 比较走 `cardHandleKey`（NFKC + ASCII 小写）；不认得的 `@xxx` 原样跳过。
 */
export function findCardHandleMentions(
  text: string,
  knownHandles: readonly string[],
): CardHandleMention[] {
  const known = [...new Set(knownHandles)]
    .filter(Boolean)
    .map((handle) => ({ handle, key: cardHandleKey(handle) }))
    .sort((a, b) => b.handle.length - a.handle.length)
  const mentions: CardHandleMention[] = []
  let cursor = 0
  while (cursor < text.length) {
    const at = text.indexOf('@', cursor)
    if (at === -1) break
    const hit = known.find(
      ({ handle, key }) =>
        cardHandleKey(text.slice(at + 1, at + 1 + handle.length)) === key,
    )
    if (hit) {
      mentions.push({
        handle: hit.handle,
        index: at,
        length: hit.handle.length + 1,
      })
      cursor = at + 1 + hit.handle.length
    } else {
      cursor = at + 1
    }
  }
  return mentions
}
