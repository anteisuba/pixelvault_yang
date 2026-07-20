'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Image from 'next/image'
import {
  ArrowUpRight,
  ImageIcon,
  Palette,
  PanelsTopLeft,
  Search,
  UserRound,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import { modelSupportsLora } from '@/constants/models'
import { cardManagementPath, type CardManagementTab } from '@/constants/routes'
import { NO_STYLE_PRESET_ID, STYLE_PRESETS } from '@/constants/style-presets'
import { useStudioData, useStudioForm } from '@/contexts/studio-context'
import { Link } from '@/i18n/navigation'
import { filterByQuery } from '@/lib/search-utils'
import { buildStudioCardUsageMap } from '@/lib/studio-history'
import { Spinner } from '@/components/ui/spinner'

type CardKind = 'character' | 'style' | 'background'

interface SelectableCard {
  id: string
  name: string
  sourceImageUrl: string | null
  tags?: string[]
  createdAt?: Date | string | number | null
  lastUsedAt?: Date | string | number | null
}

interface CardPickerGroup {
  kind: CardKind
  label: string
  noneLabel: string
  emptyLabel: string
  managementTab: CardManagementTab
  icon: ReactNode
  cards: SelectableCard[]
  selectedIds: string[]
  isLoading: boolean
  onSelect: (id: string | null) => void
}

function toTimestampMs(value: Date | string | number | null | undefined) {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? 0 : parsed
  }
  return 0
}

/**
 * StudioCardPicker — 3-tab picker (character / style / background) reused
 * by the toolbar Cards popover. Extracted from StudioPanelDialogs so the
 * popover button can host it without round-tripping through a modal.
 */
export function StudioCardPicker() {
  const { characters, backgrounds, styles, projects } = useStudioData()
  const { state, dispatch } = useStudioForm()
  const t = useTranslations('StudioV2')
  const tV3 = useTranslations('StudioV3')
  const tPresets = useTranslations('StylePresets')
  const activePresetId = state.stylePresetId
  const presetActive = activePresetId !== NO_STYLE_PRESET_ID
  const [activeKind, setActiveKind] = useState<CardKind>('character')
  const [query, setQuery] = useState('')
  const usage = useMemo(
    () => buildStudioCardUsageMap(projects.history),
    [projects.history],
  )
  const selectedStyleId = styles.activeCardId ? [styles.activeCardId] : []
  const selectedBackgroundId = backgrounds.activeCardId
    ? [backgrounds.activeCardId]
    : []
  const groups = [
    {
      kind: 'character',
      label: t('characterCards'),
      noneLabel: t('noneCharacterCard'),
      emptyLabel: t('noCharacterCards'),
      managementTab: 'characters',
      icon: <UserRound className="size-4" />,
      cards: characters.cards.map((card) => ({
        id: card.id,
        name: card.name,
        sourceImageUrl: card.sourceImageUrl ?? null,
        tags: card.tags,
        createdAt: card.createdAt,
        lastUsedAt: usage.character[card.id] ?? null,
      })),
      selectedIds: characters.activeCardIds,
      isLoading: characters.isLoading,
      onSelect: (id) => {
        if (!id) {
          characters.setActiveCardIds([])
          return
        }
        characters.toggleCardSelection(id)
      },
    },
    {
      kind: 'style',
      label: t('styleCards'),
      noneLabel: t('noneStyleCard'),
      emptyLabel: t('noStyleCards'),
      managementTab: 'styles',
      icon: <Palette className="size-4" />,
      cards: styles.cards.map((card) => ({
        id: card.id,
        name: card.modelId
          ? `${card.name} · ${
              modelSupportsLora(card.modelId)
                ? tV3('loraBadge')
                : tV3('referenceBadge')
            }`
          : card.name,
        sourceImageUrl: card.sourceImageUrl ?? null,
        tags: card.tags,
        createdAt: card.createdAt,
        lastUsedAt: usage.style[card.id] ?? null,
      })),
      selectedIds: presetActive
        ? [...selectedStyleId, activePresetId]
        : selectedStyleId,
      isLoading: styles.isLoading,
      onSelect: (id) => styles.setActiveCardId(id),
    },
    {
      kind: 'background',
      label: t('backgroundCards'),
      noneLabel: t('noneBackgroundCard'),
      emptyLabel: t('noBackgroundCards'),
      managementTab: 'backgrounds',
      icon: <ImageIcon className="size-4" />,
      cards: backgrounds.cards.map((card) => ({
        id: card.id,
        name: card.name,
        sourceImageUrl: card.sourceImageUrl ?? null,
        tags: card.tags,
        createdAt: card.createdAt,
        lastUsedAt: usage.background[card.id] ?? null,
      })),
      selectedIds: selectedBackgroundId,
      isLoading: backgrounds.isLoading,
      onSelect: (id) => backgrounds.setActiveCardId(id),
    },
  ] satisfies [CardPickerGroup, CardPickerGroup, CardPickerGroup]
  const activeGroup =
    groups.find((group) => group.kind === activeKind) ?? groups[0]
  const visibleCards = filterByQuery(activeGroup.cards, query, (card) => [
    card.name,
    ...(card.tags ?? []),
  ]).sort((left, right) => {
    const rightUsed = toTimestampMs(right.lastUsedAt)
    const leftUsed = toTimestampMs(left.lastUsedAt)
    if (rightUsed !== leftUsed) return rightUsed - leftUsed
    return (
      toTimestampMs(right.createdAt) - toTimestampMs(left.createdAt) ||
      left.name.localeCompare(right.name)
    )
  })
  const selectedCardCount = groups.reduce(
    (total, group) => total + group.selectedIds.length,
    0,
  )
  const handleSelectKind = (kind: CardKind) => {
    setActiveKind(kind)
    setQuery('')
  }

  return (
    <div className="flex max-h-full flex-col overflow-hidden rounded-xl">
      <header className="border-b border-border/40 px-4 py-3">
        <div className="flex items-center gap-2">
          <PanelsTopLeft className="size-4 text-muted-foreground" />
          <h2 className="font-display text-sm font-semibold">{t('cards')}</h2>
          {selectedCardCount > 0 ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {selectedCardCount}
            </span>
          ) : null}
        </div>
        <div
          role="tablist"
          aria-label={t('cards')}
          className="mt-2.5 grid grid-cols-3 gap-1 rounded-xl bg-muted/30 p-1"
        >
          {groups.map((group) => {
            const active = group.kind === activeKind
            return (
              <button
                key={group.kind}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                title={group.label}
                onPointerDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  handleSelectKind(group.kind)
                }}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  handleSelectKind(group.kind)
                }}
                className={`flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-xs transition-colors ${
                  active
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {group.icon}
                <span className="truncate">{group.label}</span>
                {group.selectedIds.length > 0 ? (
                  <span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">
                    {group.selectedIds.length}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
        <div className="relative mt-2.5">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('searchCardsPlaceholder')}
            className="h-9 w-full rounded-lg border border-border/60 bg-background pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary/35 focus:ring-2 focus:ring-primary/15"
          />
        </div>
      </header>

      <div className="max-h-[min(48vh,28rem)] overflow-y-auto p-3">
        {/* 内置风格 — 原工具栏「风格」预设并入画风页签（direction.md 决议 5①）。
            与画风卡可叠加（预设改写 prompt，画风卡带模型/参考），语义与原 chip 一致。 */}
        {activeGroup.kind === 'style' ? (
          <div className="mb-3 space-y-2">
            <p className="px-1 text-2xs font-medium uppercase tracking-wide text-muted-foreground/70">
              {t('builtinStyles')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() =>
                  dispatch({
                    type: 'SET_STYLE_PRESET',
                    payload: NO_STYLE_PRESET_ID,
                  })
                }
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-medium transition-colors duration-150 ${
                  !presetActive
                    ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                {tPresets('none')}
              </button>
              {STYLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() =>
                    dispatch({ type: 'SET_STYLE_PRESET', payload: preset.id })
                  }
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-medium transition-colors duration-150 ${
                    activePresetId === preset.id
                      ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <span>{preset.icon}</span>
                  <span>{tPresets(preset.messageKey)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {activeGroup.cards.length > 0 || activeGroup.selectedIds.length > 0 ? (
          <button
            type="button"
            onClick={() => activeGroup.onSelect(null)}
            className={`mb-2 flex w-full items-center gap-3 rounded-lg border border-border/60 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/35 ${
              activeGroup.selectedIds.length === 0
                ? 'bg-muted/35 text-foreground'
                : 'bg-background'
            }`}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
              {activeGroup.icon}
            </span>
            <span className="font-medium">{activeGroup.noneLabel}</span>
          </button>
        ) : null}

        {activeGroup.isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Spinner size="lg" className="text-muted-foreground" />
          </div>
        ) : visibleCards.length === 0 ? (
          query.trim() ? (
            <p className="px-3 py-10 text-center font-serif text-sm text-muted-foreground">
              {t('cardSearchEmpty')}
            </p>
          ) : (
            <div className="flex flex-col items-center gap-3 px-3 py-10 text-center">
              <p className="max-w-72 text-sm leading-6 text-muted-foreground">
                {activeGroup.emptyLabel}
              </p>
              <Link
                href={cardManagementPath({ tab: activeGroup.managementTab })}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-semibold text-background transition-colors hover:bg-foreground/90"
              >
                {t('openCardManagement')}
                <ArrowUpRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          )
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {visibleCards.map((card) => {
              const isSelected = activeGroup.selectedIds.includes(card.id)
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => activeGroup.onSelect(card.id)}
                  className={`group flex min-w-0 items-center gap-3 rounded-lg border p-2 text-left transition-colors hover:border-primary/35 hover:bg-card ${
                    isSelected
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-border/60 bg-card/70'
                  }`}
                >
                  <span className="relative size-12 shrink-0 overflow-hidden rounded-md bg-muted">
                    {card.sourceImageUrl ? (
                      <Image
                        src={card.sourceImageUrl}
                        alt={card.name}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : (
                      <span className="flex size-full items-center justify-center text-muted-foreground">
                        {activeGroup.icon}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {card.name}
                    </span>
                    {card.tags?.length ? (
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {card.tags.slice(0, 3).join(' / ')}
                      </span>
                    ) : null}
                  </span>
                  {isSelected ? (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                      {t('selected')}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
