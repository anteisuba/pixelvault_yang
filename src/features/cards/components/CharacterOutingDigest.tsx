'use client'

import { ArrowUpRight } from '@/components/icons'
import type { CharacterOutingRun } from '@/types/character-growth'
import { useOutingSourceLabel } from '@/features/cards/components/CharacterOutingCard'
import {
  resolveSiteName,
  webHostOf,
} from '@/features/cards/lib/outing-site-name'

/**
 * 话题那一趟回来写的**带出处的小结**（11-05「小房间」）：每句后面挂几颗小丸子，
 * 丸子显示站名、点开去那条见闻的原链接。没小结（旧的趟 / 没带回）调用方就不画这一块。
 */

type Digest = NonNullable<NonNullable<CharacterOutingRun['topic']>['digest']>

/** 这一趟有没有能画的小结（有话题、有至少一句）。 */
export function digestLinesOf(run: CharacterOutingRun | null) {
  return run?.topic?.digest?.lines.filter((line) => line.text.trim()) ?? []
}

/** 域名 → 站名：名册里的网页站写名册的名，现有来源跟着界面语言，认不出留域名。 */
export function useSiteName() {
  const sourceLabel = useOutingSourceLabel()
  return (host: string) => {
    const site = resolveSiteName(host)
    return site.kind === 'label'
      ? site.label
      : site.kind === 'source'
        ? sourceLabel(site.source)
        : site.host
  }
}

const chipClass =
  'ml-1 inline-flex h-5 items-center gap-0.5 rounded-full bg-background px-2 align-middle text-xs text-muted-foreground'

export function OutingDigest({ lines }: { lines: Digest['lines'] }) {
  const siteName = useSiteName()
  return (
    <div
      data-testid="character-outing-digest"
      className="flex flex-col gap-2.5 rounded-2xl bg-muted px-4 py-3"
    >
      {lines.map((line, index) => (
        <p key={index} className="text-md leading-reading">
          {line.text}
          {[...new Set(line.urls)].map((url) => {
            const host = webHostOf(url)
            if (!host)
              return (
                <span key={url} className={chipClass}>
                  {url}
                </span>
              )
            const name = siteName(host)
            return (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                title={url}
                className={`${chipClass} transition-colors duration-fast hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus`}
              >
                {name}
                <ArrowUpRight aria-hidden className="size-3 shrink-0" />
              </a>
            )
          })}
        </p>
      ))}
    </div>
  )
}
