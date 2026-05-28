'use client'

import { useMemo, useState } from 'react'
import { Copy, Pencil, Trash2, Palette, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { isBuiltInModel } from '@/constants/models'
import { isAiAdapterType } from '@/constants/providers'
import type {
  StyleCardRecord,
  CreateStyleCardRequest,
  UpdateStyleCardRequest,
} from '@/types'
import { CardManagerToolbar } from '@/components/business/cards/CardManagerToolbar'
import { MediaCardTile } from '@/components/business/MediaCardTile'
import { StyleCardEditor } from '@/components/business/StyleCardEditor'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { CardManagerSortMode } from '@/lib/card-management'
import { matchesCardSearch, sortCardManagerItems } from '@/lib/card-management'

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
  const [detailCardId, setDetailCardId] = useState<string | null>(null)

  const detailCard = useMemo(
    () => cards.find((c) => c.id === detailCardId) ?? null,
    [cards, detailCardId],
  )

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
        modelId:
          card.modelId && isBuiltInModel(card.modelId)
            ? card.modelId
            : undefined,
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
    <div className="rounded-xl border border-border/60 bg-background/30">
      <div className="flex items-center gap-2.5 px-4 py-3">
        <Palette className="size-4 text-chart-4" />
        <span className="text-sm font-medium font-display text-foreground">
          {tStyle('title')}
        </span>
        <span className="text-xs text-muted-foreground">({cards.length})</span>

        {activeCardId && (
          <span className="ml-auto max-w-[120px] truncate text-xs text-primary">
            {cards.find((c) => c.id === activeCardId)?.name}
          </span>
        )}
      </div>

      <div className="border-t border-border/40 px-4 py-3 space-y-2">
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
          <button
            type="button"
            onClick={() => setView({ type: 'create' })}
            className="group flex aspect-square w-1/3 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 bg-card/30 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-card/50 hover:text-foreground"
          >
            <Plus className="size-6 transition-transform group-hover:scale-110" />
            <span className="text-xs font-medium">{t('new')}</span>
            <span className="px-3 text-center text-[10px] text-muted-foreground/70">
              {tStyle('empty')}
            </span>
          </button>
        )}

        {cards.length > 0 && visibleCards.length === 0 && (
          <p className="py-3 text-center text-xs text-muted-foreground">
            {t('cardSearchEmpty')}
          </p>
        )}

        {visibleCards.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {visibleCards.map((card) => {
              const subtitle = card.modelId
                ? `${card.modelId}${
                    card.advancedParams?.loras?.length
                      ? ` · ${card.advancedParams.loras.length} ${tV3('loraBadge')}`
                      : ''
                  }`
                : t('noModel')
              return (
                <MediaCardTile
                  key={card.id}
                  name={card.name}
                  sourceImageUrl={card.sourceImageUrl ?? null}
                  subtitle={subtitle}
                  isSelected={card.id === activeCardId}
                  aspect="square"
                  selectLabel={tCard('select')}
                  deselectLabel={tCard('change')}
                  onToggleSelect={() =>
                    onSelect(card.id === activeCardId ? null : card.id)
                  }
                  onOpenDetail={() => setDetailCardId(card.id)}
                />
              )
            })}
          </div>
        )}

        <Dialog
          open={detailCard !== null}
          onOpenChange={(open) => {
            if (!open) setDetailCardId(null)
          }}
        >
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{detailCard?.name ?? ''}</DialogTitle>
            </DialogHeader>
            {detailCard && (
              <div className="space-y-3">
                {detailCard.modelId ? (
                  <div className="text-xs text-muted-foreground">
                    <span className="text-foreground">
                      {detailCard.modelId}
                    </span>
                    {detailCard.advancedParams?.loras?.length ? (
                      <span>
                        {' '}
                        · {detailCard.advancedParams.loras.length}{' '}
                        {tV3('loraBadge')}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-amber-500">{t('noModel')}</p>
                )}
                {detailCard.stylePrompt && (
                  <p className="text-xs font-serif text-foreground/80">
                    {detailCard.stylePrompt}
                  </p>
                )}
                <div className="flex gap-2 border-t border-border/40 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setView({ type: 'edit', card: detailCard })
                      setDetailCardId(null)
                    }}
                    className="flex items-center gap-1 rounded-md border border-border/60 px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="size-3" />
                    {t('edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDuplicate(detailCard)}
                    className="flex items-center gap-1 rounded-md border border-border/60 px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Copy className="size-3" />
                    {tCard('duplicate')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setView({ type: 'confirmDelete', card: detailCard })
                      setDetailCardId(null)
                    }}
                    className="flex items-center gap-1 rounded-md border border-destructive/30 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="size-3" />
                    {tStyle('delete')}
                  </button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
