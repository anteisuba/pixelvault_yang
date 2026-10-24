'use client'

import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'

import { Check } from '@/components/icons'
import { useDanbooruTagPreview } from '@/hooks/use-danbooru-tag-library'
import { useNearViewport } from '@/hooks/use-near-viewport'
import {
  compactPostCount,
  displayDanbooruTag,
  stylePromptTag,
} from '@/lib/tag-lookup'
import { cn } from '@/lib/utils'
import type { DanbooruCatalogKind } from '@/types/danbooru-catalog'

import type { LookupItem } from '../lookup/lookup-kinds'

/**
 * 标签库网格里的一张卡（第 9f 步 9f-2c）：样图 · 标签名 · 作品数（角色再带出处）。
 * 网格按热度翻出来的卡没带样图：滚到视野附近才问；问回来一张全年龄样图都没有就不画这张
 * （`hideBare`，多半是成人向的标签）。搜索 / 收藏带着样图来，照常画。
 */
export function TagLibraryCard({
  kind,
  item,
  added,
  hideBare,
  onOpen,
}: {
  kind: DanbooruCatalogKind
  item: LookupItem
  added: boolean
  hideBare?: boolean
  onOpen: () => void
}) {
  const t = useTranslations('StudioTags.lookup')
  const locale = useLocale()
  const lazy = item.previews.length === 0
  const { setNode, isNearViewport } = useNearViewport('400px')
  const preview = useDanbooruTagPreview(kind, item.name, lazy && isNearViewport)
  const previews = lazy ? (preview?.previews ?? []) : item.previews
  const work = item.work ?? preview?.work ?? null

  if (hideBare && lazy && preview && previews.length === 0) return null

  const posts = t('posts', { count: compactPostCount(item.count, locale) })
  const label =
    kind === 'artist'
      ? stylePromptTag(item.name)
      : displayDanbooruTag(item.name)

  return (
    <li ref={setNode} className="min-w-0">
      <button
        type="button"
        onClick={onOpen}
        className="group flex w-full flex-col gap-1.5 rounded-xl p-1 text-left transition-colors duration-fast ease-linear hover:bg-surface-fill focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
      >
        <span className="relative block aspect-3/4 w-full overflow-hidden rounded-lg bg-muted">
          {previews[0] ? (
            <Image
              unoptimized
              src={previews[0]}
              alt=""
              fill
              sizes="200px"
              className="object-cover object-top"
            />
          ) : lazy && !preview ? (
            <span className="absolute inset-0 animate-pulse bg-muted motion-reduce:animate-none" />
          ) : null}
          {added ? (
            <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background">
              <Check className="size-3" aria-label={t('added')} />
            </span>
          ) : null}
        </span>
        <span className="flex min-w-0 flex-col px-0.5">
          <span
            title={label}
            className={cn(
              'truncate text-2sm font-medium text-foreground',
              kind === 'artist' && 'font-mono',
            )}
          >
            {label}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {kind === 'character' && work
              ? t('rowWork', { work: displayDanbooruTag(work), posts })
              : posts}
          </span>
        </span>
      </button>
    </li>
  )
}
