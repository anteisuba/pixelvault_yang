'use client'

import type { Ref } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import { ThirdPartyImage } from '@/components/business/ThirdPartyImage'
import { Check, Search } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { useStudioForm, useStudioGen } from '@/contexts/studio-context'
import { useDanbooruFavorites } from '@/hooks/use-danbooru-favorites'
import {
  addLookupTags,
  displayDanbooruTag,
  hasTag,
  localDanbooruName,
  stylePromptTag,
  toggleStyleTag,
} from '@/lib/tag-lookup'
import { cn } from '@/lib/utils'
import {
  DanbooruCatalogKindSchema,
  type DanbooruCatalogKind,
  type DanbooruFavorite,
} from '@/types/danbooru-catalog'
import { LookupSay, LookupSkeletonRows } from './lookup/LookupList'
import { styleSections } from './lookup/lookup-kinds'

/** 一条收藏进提示词时写成什么：画风页（画师 / 画法）走 `stylePromptTag`，别的按空格写。 */
function promptTagOf(kind: DanbooruCatalogKind, name: string): string {
  return kind === 'artist' ? stylePromptTag(name) : displayDanbooruTag(name)
}

/**
 * 标签台「收藏」（11-18 工作台里开库）：盖在舞台上的一块，底栏留着。收藏按类分栏
 * （角色 · 画法 · 画师 · 作品 · 特征，每栏标数量，空栏不画）；有样图就带一张、没有就
 * 不留图位；点一下加进整体的正向标签、再点一下拿掉，面板不关。「收起」与 Esc 关。
 * 数据是查资料那一份收藏（`useDanbooruFavorites`，全站共用）；「查资料 → 收藏」那一页照旧在。
 */
export function StudioTagFavoritesPanel({
  onClose,
  onOpenLookup,
  headingRef,
  variant = 'stage',
}: {
  onClose: () => void
  /** 空态的下一步：去查资料里收藏。 */
  onOpenLookup?: () => void
  headingRef?: Ref<HTMLHeadingElement>
  /** `sheet` = 手机底部抽屉里（标题由抽屉给读屏，这里只画可见那一行）。 */
  variant?: 'stage' | 'sheet'
}) {
  const t = useTranslations('StudioTags.favoritesPanel')
  const tLookup = useTranslations('StudioTags.lookup')
  const locale = useLocale()
  const favorites = useDanbooruFavorites()
  const { state, dispatch } = useStudioForm()
  const { isGenerating } = useStudioGen()
  const chips = state.tagChips
  const sheet = variant === 'sheet'

  const isIn = (item: DanbooruFavorite) =>
    hasTag(chips, promptTagOf(item.kind, item.name))
  const toggle = (item: DanbooruFavorite) => {
    const tag = promptTagOf(item.kind, item.name)
    const next =
      item.kind === 'artist'
        ? toggleStyleTag(chips, item.name)
        : hasTag(chips, tag)
          ? chips.filter(
              (chip) => chip.text.toLowerCase() !== tag.toLowerCase(),
            )
          : addLookupTags(chips, [tag])
    dispatch({
      type: 'SET_TAG_CHIPS',
      payload: { polarity: 'positive', chips: next },
    })
  }

  const columns = DanbooruCatalogKindSchema.options.flatMap((kind) =>
    styleSections(kind, favorites.of(kind)).map((section) => ({
      key: `${kind}:${section.key}`,
      label: tLookup(section.label),
      items: section.items,
    })),
  )
  const total = columns.reduce((sum, column) => sum + column.items.length, 0)

  const body = !favorites.loaded ? (
    <LookupSkeletonRows label={tLookup('loading')} />
  ) : favorites.failed ? (
    <LookupSay
      title={t('errorTitle')}
      text={t('errorText')}
      action={{ label: t('retry'), onClick: favorites.retry }}
    />
  ) : total === 0 ? (
    <div
      role="status"
      className="flex flex-col items-start gap-1.5 px-0.5 pt-2.5"
    >
      <b className="text-md font-semibold text-foreground">{t('emptyTitle')}</b>
      <span className="text-2xs leading-5 text-muted-foreground">
        {t('emptyText')}
      </span>
      {onOpenLookup ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-1 min-h-11 lg:min-h-0"
          onClick={onOpenLookup}
        >
          <Search aria-hidden />
          {t('goLookup')}
        </Button>
      ) : null}
    </div>
  ) : (
    <div className="@container min-h-0 flex-1 overflow-y-auto">
      <div className="grid grid-cols-1 gap-x-5 gap-y-6 @md:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-5">
        {columns.map((column) => (
          <section
            key={column.key}
            aria-label={column.label}
            className="flex min-w-0 flex-col gap-1.5"
          >
            <h3 className="flex min-h-7 items-center justify-between text-2sm font-semibold text-foreground">
              {column.label}
              <span className="font-mono text-2xs font-normal tabular-nums text-muted-foreground">
                {column.items.length}
              </span>
            </h3>
            <ul className="flex flex-col gap-1">
              {column.items.map((item) => {
                const added = isIn(item)
                const local = localDanbooruName(item, locale)
                const label = promptTagOf(item.kind, item.name)
                return (
                  <li key={item.id}>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-pressed={added}
                      aria-label={
                        added
                          ? t('removeLabel', { tag: label })
                          : t('addLabel', { tag: label })
                      }
                      disabled={isGenerating}
                      onClick={() => toggle(item)}
                      className={cn(
                        'h-auto min-h-11 w-full justify-start gap-3 rounded-xl p-1.5 text-left whitespace-normal lg:min-h-9',
                        added
                          ? 'bg-highlight-soft text-foreground hover:text-foreground'
                          : 'text-foreground',
                      )}
                    >
                      {item.previews[0] ? (
                        <span className="relative block size-11 shrink-0 overflow-hidden rounded-lg bg-muted">
                          <ThirdPartyImage
                            src={item.previews[0]}
                            alt=""
                            fill
                            sizes="48px"
                            className="object-cover object-top"
                          />
                        </span>
                      ) : null}
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-2sm font-semibold">
                          {label}
                        </span>
                        {local ? (
                          <span className="truncate text-2xs text-muted-foreground">
                            {local}
                          </span>
                        ) : null}
                      </span>
                      {added ? (
                        <span className="flex shrink-0 items-center gap-0.5 text-2xs font-semibold text-highlight">
                          {t('added')}
                          <Check className="size-3" aria-hidden />
                        </span>
                      ) : null}
                    </Button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )

  return (
    <section
      aria-labelledby="studio-tag-favorites-title"
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-3',
        sheet ? 'px-4 pt-2 pb-4' : 'lg:gap-3.5',
      )}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        onClose()
      }}
    >
      <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1">
        <h2
          ref={headingRef}
          id="studio-tag-favorites-title"
          tabIndex={-1}
          className="text-md font-semibold outline-none"
        >
          {t('title')}
        </h2>
        <span className="min-w-0 flex-1 truncate text-2xs text-muted-foreground">
          {t('hint')}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-11 lg:min-h-0"
          onClick={onClose}
        >
          {t('close')}
        </Button>
      </div>
      {body}
    </section>
  )
}
