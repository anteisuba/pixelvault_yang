'use client'

import { useMemo, useState } from 'react'
import {
  Sparkles,
  ChevronDown,
  ChevronRight,
  User,
  Loader2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import type {
  CharacterCardRecord,
  CreateCharacterCardRequest,
  UpdateCharacterCardRequest,
} from '@/types'
import { CardManagerToolbar } from '@/components/business/CardManagerToolbar'
import { CharacterCardCreateForm } from '@/components/business/CharacterCardCreateForm'
import { CharacterCardItem } from '@/components/business/CharacterCardItem'
import { CharacterCardGallery } from '@/components/business/CharacterCardGallery'
import type { CardManagerSortMode } from '@/lib/card-management'
import {
  matchesCardSearch,
  sortCardManagerItems,
} from '@/lib/card-management'

interface CharacterCardManagerProps {
  cards: CharacterCardRecord[]
  activeCardIds: string[]
  isLoading: boolean
  lastUsedAtById: Record<string, number>
  onToggleSelect: (id: string) => void
  onCreate: (
    data: CreateCharacterCardRequest,
  ) => Promise<CharacterCardRecord | null>
  onUpdate: (id: string, data: UpdateCharacterCardRequest) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
}

export function CharacterCardManager({
  cards,
  activeCardIds,
  isLoading,
  lastUsedAtById,
  onToggleSelect,
  onCreate,
  onUpdate,
  onDelete,
}: CharacterCardManagerProps) {
  const t = useTranslations('CharacterCard')
  const tStudio = useTranslations('StudioV2')
  const tCard = useTranslations('CardSlot')
  const [isCollapsed, setIsCollapsed] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortMode, setSortMode] = useState<CardManagerSortMode>('recent')

  const selectedCount = activeCardIds.length

  const handleCreate = async (data: CreateCharacterCardRequest) => {
    setIsCreating(true)
    const card = await onCreate(data)
    setIsCreating(false)
    if (card) {
      setShowCreateForm(false)
      onToggleSelect(card.id)
    }
    return card
  }

  const handleDuplicate = async (card: CharacterCardRecord) => {
    setIsCreating(true)
    try {
      const duplicatedCard = await onCreate({
        name: `${card.name} ${tCard('copySuffix')}`,
        description: card.description ?? undefined,
        tags: card.tags.length > 0 ? card.tags : undefined,
        sourceImages:
          card.sourceImages.length > 0
            ? card.sourceImages
            : card.sourceImageEntries.map((entry) => entry.url),
        parentId: card.parentId ?? undefined,
        variantLabel: card.variantLabel ?? undefined,
      })

      if (duplicatedCard) {
        onToggleSelect(duplicatedCard.id)
      }
    } finally {
      setIsCreating(false)
    }
  }

  const visibleCards = useMemo(
    () =>
      sortCardManagerItems(
        cards.filter((card) =>
          matchesCardSearch(searchQuery, [
            card.name,
            card.description,
            card.characterPrompt,
            card.tags,
            card.variantLabel,
            card.variants.map((variant) => variant.name),
            card.variants.map((variant) => variant.variantLabel ?? ''),
            card.variants.flatMap((variant) => variant.tags),
          ]),
        ),
        sortMode,
        (card) => card.name,
        (card) => card.createdAt,
        (card) =>
          Math.max(
            lastUsedAtById[card.id] ?? 0,
            ...card.variants.map((variant) => lastUsedAtById[variant.id] ?? 0),
          ),
      ),
    [cards, lastUsedAtById, searchQuery, sortMode],
  )

  return (
    <div className="rounded-xl border border-border/60 bg-background/30">
      <button
        type="button"
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        <User className="size-4 text-chart-3" />
        <span className="text-sm font-medium font-display text-foreground">
          {t('title')}
        </span>
        <span className="text-xs text-muted-foreground">({cards.length})</span>
        {selectedCount > 0 && (
          <span className="ml-auto mr-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {selectedCount} selected
          </span>
        )}
        {isCollapsed ? (
          <ChevronRight className="ml-auto size-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="ml-auto size-4 text-muted-foreground" />
        )}
      </button>

      {!isCollapsed && (
        <div className="border-t border-border/40 px-4 py-3 space-y-3">
          <CardManagerToolbar
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            sortMode={sortMode}
            onSortModeChange={setSortMode}
            createLabel={t('createNew')}
            onCreate={() => setShowCreateForm(true)}
            createDisabled={isLoading || showCreateForm || isCreating}
          />

          {showCreateForm && (
            <CharacterCardCreateForm
              onSubmit={handleCreate}
              onCancel={() => setShowCreateForm(false)}
              isSubmitting={isCreating}
            />
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : cards.length === 0 && !showCreateForm ? (
            <div className="rounded-lg border border-dashed border-border/60 py-8 text-center">
              <Sparkles className="mx-auto mb-2 size-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{t('noCards')}</p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                {t('noCardsHint')}
              </p>
            </div>
          ) : visibleCards.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 py-8 text-center">
              <Sparkles className="mx-auto mb-2 size-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {tStudio('cardSearchEmpty')}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleCards.map((card) => (
                <CharacterCardItem
                  key={card.id}
                  card={card}
                  isSelected={activeCardIds.includes(card.id)}
                  isExpanded={expandedCardId === card.id}
                  onToggleSelect={() => onToggleSelect(card.id)}
                  onToggleExpand={() =>
                    setExpandedCardId(
                      expandedCardId === card.id ? null : card.id,
                    )
                  }
                  onDelete={() => onDelete(card.id)}
                  onUpdate={(data) => onUpdate(card.id, data)}
                  onCreate={onCreate}
                  onDuplicateCard={handleDuplicate}
                  activeCardIds={activeCardIds}
                  onToggleSelectCard={onToggleSelect}
                  onDeleteCard={onDelete}
                  onUpdateCard={onUpdate}
                />
              ))}
            </div>
          )}

          {activeCardIds.length >= 2 && (
            <div className="space-y-2 rounded-lg border border-border/40 bg-background/60 p-3">
              <h4 className="text-xs font-medium text-muted-foreground">
                {t('combinationGallery')}
              </h4>
              <CharacterCardGallery
                cardIds={activeCardIds}
                cardNames={cards
                  .filter((c) => activeCardIds.includes(c.id))
                  .map((c) => c.name)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
