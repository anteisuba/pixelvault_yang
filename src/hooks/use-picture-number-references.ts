'use client'

import { useEffect, useMemo, useState } from 'react'

import {
  GENERATION_NAME,
  GENERATION_NAME_PREFIX_BY_OUTPUT_TYPE,
} from '@/constants/generation-naming'
import { lookupAssistantMentionAssetsAPI } from '@/lib/api-client'
import type { NamedImageReference } from '@/lib/studio-reference-mentions'

/**
 * 助手回复 / 过程行里的作品编号（`图_1624`、`视频_012`）→ 正文里的缩略图（第 9d 步，owner 10-23：
 * 编号只给模型用，界面上换成图）。
 *
 * ⭐ 编号就是这个人的 `Generation.seq`（`constants/generation-naming.ts`），按号向服务端查他自己的
 *   那一张（`/api/assistant/mentions/lookup` 的 `seqs`）。查过的号记在模块里，换台、重挂都不重查。
 * ⚠ 查不到的号（删了 / 不是他的）照原样留着字，⛔ 不画破图。
 */

const PREFIXES = [
  GENERATION_NAME_PREFIX_BY_OUTPUT_TYPE.IMAGE,
  GENERATION_NAME_PREFIX_BY_OUTPUT_TYPE.VIDEO,
]
const NUMBER_PATTERN = new RegExp(
  `(?:${PREFIXES.join('|')})${GENERATION_NAME.prefixSeparator}(\\d{1,9})(?![0-9])`,
  'g',
)
const MAX_PER_LOOKUP = 32

interface ResolvedPictureRef {
  readonly url: string
  readonly fullUrl?: string
}

/** seq → 缩略图与原图；`null` = 查过了、没有这一张。 */
const resolved = new Map<number, ResolvedPictureRef | null>()
const inFlight = new Set<number>()
const listeners = new Set<() => void>()

function notify(): void {
  listeners.forEach((listener) => listener())
}

function lookup(seqs: readonly number[]): void {
  const missing = seqs.filter((seq) => !resolved.has(seq) && !inFlight.has(seq))
  for (let start = 0; start < missing.length; start += MAX_PER_LOOKUP) {
    const batch = missing.slice(start, start + MAX_PER_LOOKUP)
    batch.forEach((seq) => inFlight.add(seq))
    void lookupAssistantMentionAssetsAPI([], batch)
      .then((result) => {
        const found = new Map(
          result.success
            ? result.data.flatMap((item) => {
                if (typeof item.seq !== 'number') return []
                const thumb =
                  item.thumb ?? (item.kind === 'image' ? item.url : undefined)
                if (!thumb) return []
                // 仅图片保留原图作回退与放大地址；视频的 `item.url` 是 mp4，不能喂给 `<img>`。
                const fullUrl =
                  item.kind === 'image' && item.url && item.url !== thumb
                    ? item.url
                    : undefined
                return [
                  [
                    item.seq,
                    { url: thumb, ...(fullUrl ? { fullUrl } : {}) },
                  ] as const,
                ]
              })
            : [],
        )
        // 请求失败不记「没有」：下次再看到这个号时重查。
        if (result.success)
          batch.forEach((seq) => resolved.set(seq, found.get(seq) ?? null))
      })
      .finally(() => {
        batch.forEach((seq) => inFlight.delete(seq))
        notify()
      })
  }
}

/** 测试用。⛔ 生产代码不要调它。 */
export function resetPictureNumberCacheForTests(): void {
  resolved.clear()
  inFlight.clear()
}

export function usePictureNumberReferences(
  text: string,
): readonly NamedImageReference[] {
  const numbers = useMemo(() => {
    const found = new Map<string, number>()
    for (const match of text.matchAll(NUMBER_PATTERN))
      found.set(match[0], Number(match[1]))
    return [...found]
  }, [text])
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (numbers.length === 0) return
    const listener = () => setRevision((value) => value + 1)
    listeners.add(listener)
    lookup(numbers.map(([, seq]) => seq))
    return () => {
      listeners.delete(listener)
    }
  }, [numbers])

  return useMemo(
    () =>
      numbers.flatMap(([name, seq]) => {
        const entry = resolved.get(seq)
        return entry
          ? [
              {
                url: entry.url,
                ...(entry.fullUrl ? { fullUrl: entry.fullUrl } : {}),
                name,
                aliases: [name],
              },
            ]
          : []
      }),
    // `revision` 只为在查回来之后重算一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [numbers, revision],
  )
}
