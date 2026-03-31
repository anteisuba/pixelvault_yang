'use client'

import { useState } from 'react'
import {
  Sparkles,
  ChevronDown,
  ChevronRight,
  User,
  Loader2,
  Plus,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import type {
  CharacterCardRecord,
  CreateCharacterCardRequest,
  UpdateCharacterCardRequest,
} from '@/types'
import { CharacterCardCreateForm } from '@/components/business/CharacterCardCreateForm'
import { CharacterCardItem } from '@/components/business/CharacterCardItem'
import { CharacterCardGallery } from '@/components/business/CharacterCardGallery'

interface CharacterCardManagerProps {
  cards: CharacterCardRecord[]
  activeCardIds: string[]
  isLoading: boolean
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
  onToggleSelect,
  onCreate,
  onUpdate,
  onDelete,
}: CharacterCardManagerProps) {
  const t = useTranslations('CharacterCard')
  const [isCollapsed, setIsCollapsed] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)

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
          {!showCreateForm && (
            <button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-1 rounded-md border border-primary/30 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/5"
            >
              <Plus className="size-3" />
              {t('createNew')}
            </button>
          )}

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
          ) : (
            <div className="space-y-2">
              {cards.map((card) => (
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
