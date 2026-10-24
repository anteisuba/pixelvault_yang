'use client'

import { useEffect, useRef, useState } from 'react'

import { TAG_ADD_ACK_MS } from '@/constants/motion'
import { isStyleMediumTag } from '@/lib/tag-lookup'
import type {
  DanbooruCatalog,
  DanbooruCatalogCandidate,
  DanbooruCatalogKind,
} from '@/types/danbooru-catalog'

/**
 * 查资料（标签台手机）与标签库（第 9f 步 9f-2c）共用的几样：每一类的文案键、画风两段、
 * 「已加进 ✓」那一下。
 */

export const TRAIT_LIMIT = 12
export const ARTIST_REF_LIMIT = 8
/** 别名那一行只留前几个：排在前面的是各语言的正名，后面常混进梗名。 */
export const ALIAS_LIMIT = 4

/** 按钮上那句「已加进整体 ✓」停 1.2s 再退回（动效表）。 */
export function useAck() {
  const [acked, setAcked] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return {
    acked,
    ack: () => {
      setAcked(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setAcked(false), TAG_ADD_ACK_MS)
    },
    clear: () => {
      clearTimeout(timer.current)
      setAcked(false)
    },
  }
}

/** 换词重搜时旧列表原地留着（动效表），⛔ 每打一个字就刷成骨架。 */
export function shownData(result: {
  data?: DanbooruCatalog
  previous?: DanbooruCatalog
  loading: boolean
}) {
  return result.data ?? (result.loading ? result.previous : undefined)
}

/** 每一页用哪几句文案（页签 · 类别小签 · 搜索框 · 列表标题 · 搜不到 · 样图说明）。 */
export const KIND_TEXT: Record<
  DanbooruCatalogKind,
  {
    tab: string
    kind: string
    search: string
    random: string
    results: string
    none: string
    note: string
    notePhone: string
  }
> = {
  character: {
    tab: 'tabCharacter',
    kind: 'kindCharacter',
    search: 'searchCharacter',
    random: 'randomCharacterTitle',
    results: 'characterCount',
    none: 'noneText',
    note: 'traitsNote',
    notePhone: 'traitsNotePhone',
  },
  artist: {
    tab: 'tabStyle',
    kind: 'kindArtist',
    search: 'searchArtist',
    random: 'randomTitle',
    results: 'artistResults',
    none: 'artistNoneText',
    note: 'traitsNote',
    notePhone: 'traitsNotePhone',
  },
  copyright: {
    tab: 'tabWork',
    kind: 'kindWork',
    search: 'searchWork',
    random: 'randomWorkTitle',
    results: 'workResults',
    none: 'workNoneText',
    note: 'workNote',
    notePhone: 'workNotePhone',
  },
  general: {
    tab: 'tabFeature',
    kind: 'kindFeature',
    search: 'searchFeature',
    random: 'randomFeatureTitle',
    results: 'featureResults',
    none: 'featureNoneText',
    note: 'featureNote',
    notePhone: 'featureNotePhone',
  },
}

export type ByKind<T> = Record<DanbooruCatalogKind, T>

/** 一行是哪一类（类别小签 · 行副标题 · 分段标题）：画风页的画法按名字认出来。 */
export function kindLabelKey(kind: DanbooruCatalogKind, name: string): string {
  return kind === 'artist' && isStyleMediumTag(name)
    ? 'kindMedium'
    : KIND_TEXT[kind].kind
}

/**
 * 画风页两段（owner 2026-10-22）：画法在前、画师在后，各自保持原来的先后。
 * 别的页只有一段。收藏页的「画风」也这样分。
 */
export function styleSections<T extends { name: string }>(
  kind: DanbooruCatalogKind,
  items: readonly T[],
): { key: string; label: string; items: T[] }[] {
  const sections =
    kind === 'artist'
      ? [
          {
            key: 'medium',
            label: 'kindMedium',
            items: items.filter((item) => isStyleMediumTag(item.name)),
          },
          {
            key: 'artist',
            label: 'kindArtist',
            items: items.filter((item) => !isStyleMediumTag(item.name)),
          },
        ]
      : [{ key: kind, label: KIND_TEXT[kind].kind, items: [...items] }]
  return sections.filter((section) => section.items.length > 0)
}

/** 左栏一行：搜到 / 抽到的候选，或者一条收藏（收藏那一刻的快照）。 */
export type LookupItem = Pick<
  DanbooruCatalogCandidate,
  'name' | 'count' | 'work' | 'previews' | 'zh' | 'ja'
>
