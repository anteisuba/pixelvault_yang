'use client'

import { useMemo, useState } from 'react'
import { Copy, Pencil, Trash2, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'
import { isBuiltInModel } from '@/constants/models'
import { isAiAdapterType } from '@/constants/providers'
import type {
  StyleCardRecord,
  CreateStyleCardRequest,
  UpdateStyleCardRequest,
} from '@/types'
import { CardManagerToolbar } from '@/components/business/CardManagerToolbar'
import { StyleCardEditor } from '@/components/business/StyleCardEditor'
import type { CardManagerSortMode } from '@/lib/card-management'
import {
  matchesCardSearch,
  sortCardManagerItems,
} from '@/lib/card-management'

interface StyleCardManagerProps {
  cards: StyleCardRecord[]
  activeCardId: string | null
  isLoading: boolean
  lastUsedAtById: Record<string, number>
  onSelect: (id: string | null) => void
  onCreate: (data: CreateStyleCardRequest) => Promise<void>
  onUpdate: (
    id: string,
    data: UpdateStyleCardRequest,
  ) => Promise<boolean | void>
  onDelete: (id: string) => Promise<boolean | void>
}

type ManagerView =
  | { type: 'list' }
  | { type: 'create' }
  | { type: 'edit'; card: StyleCardRecord }
  | { type: 'confirmDelete'; card: StyleCardRecord }

/**
 * Style card list + CRUD manager for Studio V2.
 * Uses StyleCardEditor for create/edit so model + LoRA fields are always shown.
 */
export function StyleCardManager({
  cards,
  activeCardId,
  isLoading,
  lastUsedAtById,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
}: StyleCardManagerProps) {
  const t = useTranslations('StudioV2')
  const tStyle = useTranslations('StyleCard')
  const tCard = useTranslations('CardSlot')
  const tV3 = useTranslations('StudioV3')

  const [view, setView] = useState<ManagerView>({ type: 'list' })
  const [isSaving, setIsSaving] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortMode, setSortMode] = useState<CardManagerSortMode>('recent')

  const handleSave = async (
    data: CreateStyleCardRequest | UpdateStyleCardRequest,
  ) => {
    setIsSaving(true)
    try {
      if (view.type === 'create') {
        await onCreate(data as CreateStyleCardRequest)
      } else if (view.type === 'edit') {
        await onUpdate(view.card.id, data as UpdateStyleCardRequest)
      }
      setView({ type: 'list' })
      return true
    } catch {
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (card: StyleCardRecord) => {
    setIsSaving(true)
    try {
      await onDelete(card.id)
      if (activeCardId === card.id) onSelect(null)
      setView({ type: 'list' })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDuplicate = async (card: StyleCardRecord) => {
    setIsSaving(true)
    try {
      await onCreate({
        name: `${card.name} ${tCard('copySuffix')}`,
        description: card.description ?? undefined,
        stylePrompt: card.stylePrompt,
        attributes: card.attributes ?? undefined,
        modelId: card.modelId && isBuiltInModel(card.modelId) ? card.modelId : undefined,
        adapterType:
          card.adapterType && isAiAdapterType(card.adapterType)
            ? card.adapterType
            : undefined,
        advancedParams: card.advancedParams ?? undefined,
        tags: card.tags,
        projectId: card.projectId ?? undefined,
      })
    } finally {
      setIsSaving(false)
    }
  }

  const visibleCards = useMemo(
    () =>
      sortCardManagerItems(
        cards.filter((card) =>
          matchesCardSearch(searchQuery, [
            card.name,
            card.description,
            card.stylePrompt,
            card.tags,
            card.modelId,
          ]),
        ),
        sortMode,
        (card) => card.name,
        (card) => card.createdAt,
        (card) => lastUsedAtById[card.id] ?? 0,
      ),
    [cards, lastUsedAtById, searchQuery, sortMode],
  )

  if (view.type === 'create' || view.type === 'edit') {
    return (
      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground">
          {view.type === 'create' ? t('new') : t('edit')} — {tStyle('title')}
        </p>
        <StyleCardEditor
          card={view.type === 'edit' ? view.card : undefined}
          onSave={handleSave}
          onCancel={() => setView({ type: 'list' })}
          isLoading={isSaving}
        />
      </div>
    )
  }

  if (view.type === 'confirmDelete') {
    const card = view.card
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
        <p className="text-sm text-foreground">{tStyle('deleteConfirm')}</p>
        <p className="text-xs text-muted-foreground">{card.name}</p>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => setView({ type: 'list' })}
            className="rounded-md border border-border/60 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/30"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => handleDelete(card)}
            className="rounded-md bg-destructive px-3 py-1.5 text-xs text-destructive-foreground disabled:opacity-50"
          >
            {tStyle('delete')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          {tStyle('title')}
        </p>
      </div>

      <CardManagerToolbar
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        sortMode={sortMode}
        onSortModeChange={setSortMode}
        createLabel={t('new')}
        onCreate={() => setView({ type: 'create' })}
        createDisabled={isLoading || isSaving}
      />

      {cards.length === 0 && (
        <p className="py-3 text-center text-xs text-muted-foreground">
          {tStyle('empty')}
        </p>
      )}

      <div className="space-y-1">
        {cards.length > 0 && visibleCards.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground">
            {t('cardSearchEmpty')}
          </p>
        ) : null}
        {visibleCards.map((card) => {
          const isActive = card.id === activeCardId
          return (
            <div
              key={card.id}
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors',
                isActive
                  ? 'border-primary/40 bg-primary/5'
                  : 'border-border/60 bg-background hover:bg-muted/30',
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(isActive ? null : card.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                {isActive && (
                  <Check className="h-3 w-3 flex-shrink-0 text-primary" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {card.name}
                  </p>
                  {card.modelId ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {card.modelId}
                      {card.advancedParams?.loras?.length
                        ? ` · ${card.advancedParams.loras.length} ${tV3('loraBadge')}`
                        : ''}
                    </p>
                  ) : (
                    <p className="text-xs text-amber-600">{t('noModel')}</p>
                  )}
                </div>
              </button>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setView({ type: 'edit', card })}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title={t('edit')}
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleDuplicate(card)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  title={tCard('duplicate')}
                >
                  <Copy className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setView({ type: 'confirmDelete', card })}
                  className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-500"
                  title={tStyle('delete')}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
