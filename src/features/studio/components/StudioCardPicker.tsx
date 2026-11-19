'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'

import { supportsNovelAiPreciseReference } from '@/constants/novelai'
import { cardManagementPath } from '@/constants/routes'
import type { CharacterCardRecord } from '@/types'
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Search,
  UserRound,
} from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { CharacterImagePickGrid } from '@/features/cards'
import { useStudioCharacterOutlet } from '@/features/studio/hooks/use-studio-character-outlet'
import { useStudioData } from '@/contexts/studio-context'
import { useStudioRunModels } from '@/hooks/use-studio-run-models'
import { Link } from '@/i18n/navigation'
import { findLook, slotsCoverUrl } from '@/lib/card-bus'
import { lookLabel } from '@/lib/character-looks'
import { characterWork } from '@/lib/character-works'
import { filterByQuery } from '@/lib/search-utils'
import { buildStudioCardUsageMap } from '@/lib/studio-history'
import { cn } from '@/lib/utils'

/**
 * 工作台「角色」弹层（owner 09-27）。
 *
 * ⭐ 只剩角色（画风卡 · 背景卡 · 内置风格一起下线）。点一个角色只是**展开看看**（11-17：
 *   展开不再替你选）；展开后顶上一排造型（只有一套也列出来），点一套 = 用这套带她、勾这套
 *   的主图；点正在用的那套 = 这次不带她。下面是她的图（卡上的在前，用她出的在后），勾一张
 *   或几张 = 这次带这几张；一张都不勾 = 她不在场。
 * ⭐ 张数按**这个模型一次能收的参考图**卡住（含你自己挂的参考图）：到上限，没勾的格子
 *   勾不上并写明原因。模型不收参考图时不列图，点造型只是让她在场（名字和标签进文字）。
 * ⭐ NovelAI V4.5 才出「造型主图做精确参考」开关（默认关：开了 Opus 的免费出图也变成
 *   按 Anlas 计，每张 +5；标签本来就能认出角色）。
 * ⚠ 挑的图住在 `characters.imagePicks`、造型住在 `characters.lookIds`；出图时随请求送给
 *   卡片总线，服务端按本人校验。
 */

function toTimestampMs(value: Date | string | number | null | undefined) {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }
  return 0
}

export function StudioCardPicker({
  fill = false,
  hideTitle = false,
}: {
  /** 舞台面板：列表吃满宿主给的高度（弹层 / 抽屉里仍按半屏收）。 */
  fill?: boolean
  /**
   * 宿主自己已经写了「角色」标题（舞台面板那副头）—— 这里不再写第二遍（11-19 真机走查：
   * 标题叠了两行）。只剩「已选 N · 清空」那一截，没选人时整行不占位。
   */
  hideTitle?: boolean
} = {}) {
  const { characters, projects, imageUpload } = useStudioData()
  const { runModels } = useStudioRunModels()
  const outlet = useStudioCharacterOutlet()
  // NovelAI 精确参考只有 V4.5 有（官方），别的模型不出这个开关。
  const showPreciseToggle = runModels.some((model) =>
    supportsNovelAiPreciseReference(model.modelId),
  )
  const t = useTranslations('StudioV2')
  const tLooks = useTranslations('CharacterLooks')
  const locale = useLocale()
  const [query, setQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const usage = useMemo(
    () => buildStudioCardUsageMap(projects.history),
    [projects.history],
  )

  const maxImages = imageUpload.maxImages
  const ownReferences = imageUpload.referenceImages.length
  const pickedTotal = characters.activeCardIds.reduce(
    (total, id) => total + (characters.imagePicks[id]?.length ?? 0),
    0,
  )
  const noReferences = maxImages === 0
  const remaining = Number.isFinite(maxImages)
    ? Math.max(0, maxImages - ownReferences - pickedTotal)
    : Infinity

  const visible = filterByQuery(characters.cards, query, (card) => [
    card.name,
    ...card.looks.flatMap((look) => [look.label ?? '', ...look.tags]),
    characterWork(card, locale).label ?? '',
  ]).sort((left, right) => {
    const rightUsed = toTimestampMs(usage.character[right.id])
    const leftUsed = toTimestampMs(usage.character[left.id])
    if (rightUsed !== leftUsed) return rightUsed - leftUsed
    return (
      toTimestampMs(right.createdAt) - toTimestampMs(left.createdAt) ||
      left.name.localeCompare(right.name)
    )
  })

  /** 展开 / 收起只是看，⛔ 不替用户选（11-17：点开看看就被带进这一枪是误伤）。 */
  const toggleRow = (card: CharacterCardRecord) => {
    setExpandedId((current) => (current === card.id ? null : card.id))
  }

  /**
   * 点一套造型 = 用这套带她出场（有位子就勾这套的主图）；点正在用的那套 = 这次不带她。
   * 模型不收参考图时同理，只是不勾图（名字和标签进文字）。
   */
  const pickLook = (card: CharacterCardRecord, lookId: string) => {
    const active = characters.activeCardIds.includes(card.id)
    const current = findLook(card, characters.lookIds[card.id])
    const look = findLook(card, lookId)
    if (active && current.id === look.id) {
      characters.toggleCardSelection(card.id)
      return
    }
    // 原来那套挑的图马上清掉（图属于原来那套），它们占的位子也让出来。
    const room = remaining + (characters.imagePicks[card.id]?.length ?? 0)
    characters.setLookId(card.id, look.isDefault ? null : look.id)
    const primary =
      look.referenceSlots.find((slot) => slot.isPrimary) ??
      look.referenceSlots[0]
    if (!noReferences && primary && room > 0) {
      characters.setImagePicks(card.id, [{ slotId: primary.id }])
      return
    }
    if (!active) characters.toggleCardSelection(card.id)
  }

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-xl',
        fill ? 'h-full min-h-0' : 'max-h-full',
      )}
    >
      <header className="flex flex-col gap-2.5 border-b border-border/40 px-4 py-3">
        <div
          className={cn(
            'flex items-center gap-2',
            hideTitle && characters.activeCardIds.length === 0 && 'hidden',
          )}
        >
          {hideTitle ? null : (
            <>
              <UserRound className="size-4 text-muted-foreground" />
              <h2 className="text-md font-semibold">{t('characters')}</h2>
            </>
          )}
          {characters.activeCardIds.length > 0 ? (
            <>
              <span className="rounded-full bg-muted px-2 py-0.5 text-2xs tabular-nums">
                {characters.activeCardIds.length}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => characters.setActiveCardIds([])}
                className="ml-auto text-2sm"
              >
                {t('clearCharacters')}
              </Button>
            </>
          ) : null}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('searchCharactersPlaceholder')}
            // ⚠ <768 必须 ≥16px：iOS 对小于 16px 的可聚焦输入框会自动放大整页。
            className="pl-9 pr-3"
          />
        </div>
        <p
          className="text-2xs text-muted-foreground"
          data-testid="card-picker-limit"
        >
          {noReferences
            ? t('noReferenceImages')
            : Number.isFinite(maxImages)
              ? t('referenceLimit', {
                  max: maxImages,
                  used: ownReferences + pickedTotal,
                })
              : null}
        </p>
        {showPreciseToggle ? (
          <div className="flex items-start gap-2.5 rounded-lg bg-muted/60 px-3 py-2">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <label
                htmlFor="studio-novelai-precise"
                className="text-2sm font-semibold"
              >
                {t('novelAiPreciseReference')}
              </label>
              <p className="text-2xs text-muted-foreground">
                {characters.novelAiPreciseReference &&
                !outlet.novelAiPreciseReference
                  ? t('novelAiPreciseReferenceIdle')
                  : t('novelAiPreciseReferenceHint')}
              </p>
            </div>
            <Switch
              id="studio-novelai-precise"
              checked={characters.novelAiPreciseReference}
              onCheckedChange={characters.setNovelAiPreciseReference}
            />
          </div>
        ) : null}
      </header>

      <div
        className={cn(
          'overflow-y-auto p-2',
          // 舞台上整块高度都给列表；弹层里仍按半屏收着。
          fill ? 'min-h-0 flex-1' : 'max-h-[min(48vh,28rem)]',
        )}
      >
        {characters.isLoading && characters.cards.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner size="lg" className="text-muted-foreground" />
          </div>
        ) : visible.length === 0 ? (
          query.trim() ? (
            <p className="px-3 py-10 text-center text-2sm text-muted-foreground">
              {t('cardSearchEmpty')}
            </p>
          ) : (
            <div className="flex flex-col items-center gap-3 px-3 py-10 text-center">
              <p className="max-w-72 text-2sm leading-6 text-muted-foreground">
                {t('noCharacterCards')}
              </p>
              <Link
                href={cardManagementPath()}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-2sm font-semibold text-background transition-colors hover:tint-hover"
              >
                {t('openCardManagement')}
                <ArrowUpRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          )
        ) : (
          <ul className="flex flex-col gap-1">
            {visible.map((card) => {
              const active = characters.activeCardIds.includes(card.id)
              const picks = characters.imagePicks[card.id] ?? []
              const expanded = expandedId === card.id
              const work = characterWork(card, locale).label
              const look = findLook(card, characters.lookIds[card.id])
              const thumb = slotsCoverUrl(look.referenceSlots)
              return (
                <li
                  key={card.id}
                  data-testid="card-picker-character"
                  className={cn(
                    'rounded-12 transition-colors duration-fast',
                    fill && 'border border-border/70 bg-card shadow-ring',
                    active
                      ? 'bg-muted/60'
                      : fill
                        ? 'hover:border-border hover:bg-surface-companion/55'
                        : 'hover:tint-hover',
                  )}
                >
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => toggleRow(card)}
                    className="touch-target-y flex w-full items-center gap-3 p-2 text-left"
                  >
                    <span className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {thumb ? (
                        <Image
                          src={thumb}
                          alt=""
                          fill
                          sizes="40px"
                          className="object-cover object-top"
                        />
                      ) : null}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-2sm font-semibold">
                        {card.name}
                      </span>
                      <span className="truncate text-2xs text-muted-foreground">
                        {[
                          work ?? t('originalWork'),
                          look.isDefault
                            ? null
                            : lookLabel(look, card.looks, tLooks),
                          active
                            ? picks.length
                              ? t('pickedImages', { count: picks.length })
                              : t('autoImages')
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    {active ? (
                      <Check
                        className="size-4 shrink-0"
                        data-testid="card-picker-active"
                        aria-hidden
                      />
                    ) : null}
                    <ChevronDown
                      className={cn(
                        'size-4 shrink-0 text-muted-foreground transition-transform duration-fast',
                        expanded && 'rotate-180',
                      )}
                      aria-hidden
                    />
                  </button>
                  {expanded ? (
                    <div
                      role="group"
                      aria-label={tLooks('title')}
                      className="flex flex-wrap items-center gap-1 px-2 pb-2"
                    >
                      {card.looks.map((item) => {
                        const label = lookLabel(item, card.looks, tLooks)
                        const pressed = active && item.id === look.id
                        return (
                          <Button
                            key={item.id}
                            type="button"
                            size="xs"
                            variant={pressed ? 'default' : 'secondary'}
                            aria-pressed={pressed}
                            onClick={() => pickLook(card, item.id)}
                            className="rounded-full text-2sm"
                          >
                            {label}
                          </Button>
                        )
                      })}
                      {active ? null : (
                        <span className="px-1 text-2xs text-muted-foreground">
                          {t('pickHint')}
                        </span>
                      )}
                    </div>
                  ) : null}
                  {expanded && !noReferences ? (
                    <CharacterImagePickGrid
                      card={card}
                      look={look}
                      picks={picks}
                      remaining={remaining}
                      onChange={(next) =>
                        characters.setImagePicks(card.id, next)
                      }
                    />
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
