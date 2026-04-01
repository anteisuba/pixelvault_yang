'use client'

import { useState } from 'react'
import {
  Trash2,
  Edit3,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Check,
  FolderPlus,
  Copy,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'

import type {
  CharacterCardRecord,
  CreateCharacterCardRequest,
  UpdateCharacterCardRequest,
  CharacterAttributes,
} from '@/types'
import { CharacterCardCreateForm } from '@/components/business/CharacterCardCreateForm'
import { CharacterCardGallery } from '@/components/business/CharacterCardGallery'
import { cn } from '@/lib/utils'

// ─── Status Badge ──────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations('CharacterCard')
  const colors: Record<string, string> = {
    DRAFT: 'bg-muted text-muted-foreground',
    REFINING: 'bg-chart-3/10 text-chart-3',
    STABLE: 'bg-emerald-500/10 text-emerald-600',
    ARCHIVED: 'bg-muted text-muted-foreground/60',
  }
  const labels: Record<string, string> = {
    DRAFT: t('statusDraft'),
    REFINING: t('statusRefining'),
    STABLE: t('statusStable'),
    ARCHIVED: t('statusArchived'),
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        colors[status] ?? colors.DRAFT,
      )}
    >
      {labels[status] ?? status}
    </span>
  )
}

// ─── Attribute List ────────────────────────────────────────────

function AttributeList({ attributes }: { attributes: CharacterAttributes }) {
  const t = useTranslations('CharacterCard.attributeLabels')
  const entries = Object.entries(attributes).filter(
    ([key, val]) => val && key !== 'freeformDescription',
  )
  if (entries.length === 0) return null
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      {entries.map(([key, val]) => (
        <div key={key} className="flex gap-1">
          <span className="text-muted-foreground">
            {t(key as keyof CharacterAttributes)}:
          </span>
          <span className="truncate text-foreground">{val}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Card Item ─────────────────────────────────────────────────

export interface CharacterCardItemProps {
  card: CharacterCardRecord
  isSelected: boolean
  isExpanded: boolean
  onToggleSelect: () => void
  onToggleExpand: () => void
  onDelete: () => void
  onUpdate: (data: UpdateCharacterCardRequest) => Promise<boolean>
  onCreate: (
    data: CreateCharacterCardRequest,
  ) => Promise<CharacterCardRecord | null>
  onDuplicateCard?: (card: CharacterCardRecord) => Promise<void> | void
  activeCardIds: string[]
  onToggleSelectCard: (id: string) => void
  onDeleteCard: (id: string) => Promise<boolean>
  onUpdateCard: (
    id: string,
    data: UpdateCharacterCardRequest,
  ) => Promise<boolean>
  depth?: number
}

export function CharacterCardItem({
  card,
  isSelected,
  isExpanded,
  onToggleSelect,
  onToggleExpand,
  onDelete,
  onUpdate,
  onCreate,
  onDuplicateCard,
  activeCardIds,
  onToggleSelectCard,
  onDeleteCard,
  onUpdateCard,
  depth = 0,
}: CharacterCardItemProps) {
  const t = useTranslations('CharacterCard')
  const tCard = useTranslations('CardSlot')
  const tView = useTranslations('CharacterCard.viewTypes')
  const [expanded, setExpanded] = useState(false)
  const [localExpanded, setLocalExpanded] = useState(false)
  const [showVariants, setShowVariants] = useState(false)
  const [showVariantForm, setShowVariantForm] = useState(false)
  const [isCreatingVariant, setIsCreatingVariant] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editPrompt, setEditPrompt] = useState(card.characterPrompt)

  const hasVariants = card.variants && card.variants.length > 0
  const isRoot = depth === 0
  const isExpandedResolved = depth > 0 ? localExpanded : isExpanded

  const handleToggleItemExpand = () => {
    if (depth > 0) {
      setLocalExpanded((prev) => !prev)
      return
    }

    onToggleExpand()
  }

  const handleSavePrompt = async () => {
    const success = await onUpdate({ characterPrompt: editPrompt })
    if (success) setIsEditing(false)
  }

  const handleCreateVariant = async (data: CreateCharacterCardRequest) => {
    setIsCreatingVariant(true)
    const newCard = await onCreate(data)
    setIsCreatingVariant(false)
    if (newCard) {
      setShowVariantForm(false)
      setShowVariants(true)
      onToggleSelectCard(newCard.id)
    }
    return newCard
  }

  const sourceEntries =
    card.sourceImageEntries.length > 0
      ? card.sourceImageEntries
      : card.sourceImages.map((url) => ({
          url,
          viewType: 'other' as const,
        }))

  return (
    <div
      className={cn(
        'rounded-lg border transition-colors',
        isSelected
          ? 'border-primary/40 bg-primary/5'
          : 'border-border/60 bg-background/50',
        depth > 0 && 'ml-6 border-l-2 border-l-primary/20',
      )}
    >
      {/* Header */}
      <div className="flex w-full items-center gap-3 p-3">
        <button
          type="button"
          onClick={onToggleSelect}
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded border transition-colors',
            isSelected
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border/60 bg-background hover:border-primary/40',
          )}
          aria-label={isSelected ? t('deselectCard') : t('selectCard')}
        >
          {isSelected && <Check className="size-3" />}
        </button>
        <button
          type="button"
          onClick={handleToggleItemExpand}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <div className="relative size-12 shrink-0 overflow-hidden rounded-md border border-border/40">
            <Image
              src={card.sourceImageUrl}
              alt={card.name}
              fill
              className="object-cover"
              sizes="48px"
              unoptimized
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{card.name}</span>
              {card.variantLabel && (
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  {card.variantLabel}
                </span>
              )}
              <StatusBadge status={card.status} />
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              {card.stabilityScore !== null && (
                <span className="text-xs text-muted-foreground">
                  {t('stabilityScore')}: {Math.round(card.stabilityScore * 100)}
                  %
                </span>
              )}
              {isRoot && hasVariants && (
                <span className="text-xs text-muted-foreground">
                  · {card.variants.length} {t('variantsCount')}
                </span>
              )}
            </div>
          </div>
          {isExpandedResolved ? (
            <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Expanded content */}
      {isExpandedResolved && (
        <div className="space-y-3 border-t border-border/40 p-3">
          {/* Source images */}
          {sourceEntries.length > 0 && (
            <div>
              <span className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('sourceImage')}
              </span>
              <div className="flex gap-2 overflow-x-auto">
                {sourceEntries.map((entry, i) => (
                  <div
                    key={i}
                    className="relative size-16 shrink-0 overflow-hidden rounded-md border border-border/40"
                  >
                    <Image
                      src={entry.url}
                      alt={`Source ${i + 1}`}
                      fill
                      className="object-cover"
                      sizes="64px"
                      unoptimized
                    />
                    {entry.viewType !== 'other' && (
                      <span className="absolute bottom-0 left-0 right-0 bg-background/80 text-center text-[9px] font-medium backdrop-blur-sm">
                        {tView(entry.viewType)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Toggle attributes */}
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {t('attributes')}
            {expanded ? (
              <ChevronUp className="size-3" />
            ) : (
              <ChevronDown className="size-3" />
            )}
          </button>

          {expanded && (
            <>
              {card.attributes && (
                <AttributeList attributes={card.attributes} />
              )}

              {/* Prompt edit */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t('extractedPrompt')}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsEditing(!isEditing)}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <Edit3 className="size-3" />
                    {t('editPrompt')}
                  </button>
                </div>
                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      rows={4}
                      className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-xs focus:border-primary/40 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleSavePrompt}
                      className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground"
                    >
                      {t('save')}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-foreground/80 line-clamp-3">
                    {card.characterPrompt}
                  </p>
                )}
              </div>

              {/* Reference images */}
              {card.referenceImages && card.referenceImages.length > 0 && (
                <div>
                  <span className="mb-1 block text-xs font-medium text-muted-foreground">
                    {t('referenceImages')}
                  </span>
                  <div className="flex gap-2 overflow-x-auto">
                    {card.referenceImages.map((url, i) => (
                      <div
                        key={i}
                        className="relative size-16 shrink-0 overflow-hidden rounded-md border border-border/40"
                      >
                        <Image
                          src={url}
                          alt={`Reference ${i + 1}`}
                          fill
                          className="object-cover"
                          sizes="64px"
                          unoptimized
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Related works gallery */}
              <div>
                <span className="mb-2 block text-xs font-medium text-muted-foreground">
                  {t('relatedWorks')}
                </span>
                <CharacterCardGallery
                  cardIds={[card.id]}
                  cardNames={[card.name]}
                />
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {isRoot && (
              <button
                type="button"
                onClick={() => setShowVariantForm(!showVariantForm)}
                className="flex items-center gap-1 rounded-md border border-primary/30 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/5"
              >
                <FolderPlus className="size-3" />
                {t('addVariant')}
              </button>
            )}
            {onDuplicateCard ? (
              <button
                type="button"
                onClick={() => void onDuplicateCard(card)}
                className="flex items-center gap-1 rounded-md border border-border/60 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Copy className="size-3" />
                {tCard('duplicate')}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center gap-1 rounded-md border border-destructive/30 px-2.5 py-1 text-xs text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 className="size-3" />
              {tCard('delete')}
            </button>
          </div>

          {/* Variant create form */}
          {showVariantForm && (
            <CharacterCardCreateForm
              onSubmit={handleCreateVariant}
              onCancel={() => setShowVariantForm(false)}
              isSubmitting={isCreatingVariant}
              parentId={card.id}
            />
          )}
        </div>
      )}

      {/* Variants (folder-style) */}
      {isRoot && hasVariants && (
        <div className="border-t border-border/40">
          <button
            type="button"
            onClick={() => setShowVariants(!showVariants)}
            className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronRight
              className={cn(
                'size-3 transition-transform',
                showVariants && 'rotate-90',
              )}
            />
            {t('variantsCount')}: {card.variants.length}
          </button>
          {showVariants && (
            <div className="space-y-2 px-3 pb-3">
              {card.variants.map((variant) => (
                <CharacterCardItem
                  key={variant.id}
                  card={variant}
                  isSelected={activeCardIds.includes(variant.id)}
                  isExpanded={false}
                  onToggleSelect={() => onToggleSelectCard(variant.id)}
                  onToggleExpand={() => {}}
                  onDelete={() => onDeleteCard(variant.id)}
                  onUpdate={(data) => onUpdateCard(variant.id, data)}
                  onCreate={onCreate}
                  activeCardIds={activeCardIds}
                  onToggleSelectCard={onToggleSelectCard}
                  onDeleteCard={onDeleteCard}
                  onUpdateCard={onUpdateCard}
                  onDuplicateCard={onDuplicateCard}
                  depth={1}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
