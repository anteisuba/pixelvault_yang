'use client'

import { useState, useRef } from 'react'
import {
  Plus,
  Trash2,
  Edit3,
  Sparkles,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  User,
  Upload,
  Loader2,
  FolderPlus,
  Globe,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'

import type {
  CharacterCardRecord,
  CreateCharacterCardRequest,
  UpdateCharacterCardRequest,
  CharacterAttributes,
  SourceImageUpload,
} from '@/types'
import { CHARACTER_CARD } from '@/constants/character-card'
import type { SourceImageViewType } from '@/constants/character-card'
import { CharacterCardGallery } from '@/components/business/CharacterCardGallery'
import { cn } from '@/lib/utils'

// ─── View Type Labels ─────────────────────────────────────────

const VIEW_TYPE_ICONS: Record<SourceImageViewType, string> = {
  front: 'F',
  side: 'S',
  back: 'B',
  top: 'T',
  three_quarter: '¾',
  detail: 'D',
  other: '·',
}

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

// ─── Attribute Display ─────────────────────────────────────────

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

// ─── Create / Variant Form ────────────────────────────────────

interface CreateFormProps {
  onSubmit: (
    data: CreateCharacterCardRequest,
  ) => Promise<CharacterCardRecord | null>
  onCancel: () => void
  isSubmitting: boolean
  /** If set, form creates a variant under this parent */
  parentId?: string
}

function CreateForm({
  onSubmit,
  onCancel,
  isSubmitting,
  parentId,
}: CreateFormProps) {
  const t = useTranslations('CharacterCard')
  const tView = useTranslations('CharacterCard.viewTypes')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [variantLabel, setVariantLabel] = useState('')
  const [images, setImages] = useState<SourceImageUpload[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    Array.from(files).forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        setImages((prev) => {
          if (prev.length >= CHARACTER_CARD.MAX_SOURCE_IMAGES) return prev
          return [
            ...prev,
            {
              data: reader.result as string,
              viewType: 'other' as SourceImageViewType,
            },
          ]
        })
      }
      reader.readAsDataURL(file)
    })
    e.target.value = ''
  }

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

  const setViewType = (index: number, viewType: SourceImageViewType) => {
    setImages((prev) =>
      prev.map((img, i) => (i === index ? { ...img, viewType } : img)),
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || images.length === 0) return

    await onSubmit({
      name: name.trim(),
      description: description.trim() || undefined,
      sourceImages: images,
      parentId,
      variantLabel: variantLabel.trim() || undefined,
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-border/60 bg-background/50 p-4"
    >
      {/* Name */}
      <div>
        <label className="mb-1 block text-sm font-medium">{t('name')}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('namePlaceholder')}
          maxLength={CHARACTER_CARD.NAME_MAX_LENGTH}
          className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary/40 focus:outline-none"
          required
        />
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Globe className="size-3 shrink-0" />
          {t('nameSearchHint')}
        </p>
      </div>

      {/* Variant label (only for variant creation) */}
      {parentId && (
        <div>
          <label className="mb-1 block text-sm font-medium">
            {t('variantLabel')}
          </label>
          <input
            type="text"
            value={variantLabel}
            onChange={(e) => setVariantLabel(e.target.value)}
            placeholder={t('variantLabelPlaceholder')}
            maxLength={CHARACTER_CARD.VARIANT_LABEL_MAX_LENGTH}
            className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary/40 focus:outline-none"
          />
        </div>
      )}

      {/* Description */}
      <div>
        <label className="mb-1 block text-sm font-medium">
          {t('descriptionLabel')}
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('descriptionPlaceholder')}
          maxLength={CHARACTER_CARD.DESCRIPTION_MAX_LENGTH}
          rows={2}
          className="w-full rounded-md border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary/40 focus:outline-none"
        />
      </div>

      {/* Multi-image upload with view type */}
      <div>
        <label className="mb-1 block text-sm font-medium">
          {t('sourceImage')}
        </label>
        <p className="mb-2 text-xs text-muted-foreground">
          {t('sourceImageHint')} ({images.length}/
          {CHARACTER_CARD.MAX_SOURCE_IMAGES})
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
        <div className="flex flex-wrap gap-2">
          {images.map((img, i) => (
            <div key={i} className="relative inline-block">
              <Image
                src={img.data}
                alt={`Source ${i + 1}`}
                width={96}
                height={96}
                className="rounded-md border border-border/60 object-cover"
                unoptimized
                style={{ width: 96, height: 96 }}
              />
              {/* View type selector */}
              <select
                value={img.viewType}
                onChange={(e) =>
                  setViewType(i, e.target.value as SourceImageViewType)
                }
                className="absolute bottom-0 left-0 right-0 rounded-b-md border-t border-border/60 bg-background/90 px-1 py-0.5 text-[10px] backdrop-blur-sm focus:outline-none"
              >
                {CHARACTER_CARD.VIEW_TYPES.map((vt) => (
                  <option key={vt} value={vt}>
                    {tView(vt)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground shadow-sm"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
          {images.length < CHARACTER_CARD.MAX_SOURCE_IMAGES && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex size-24 items-center justify-center rounded-md border border-dashed border-border/60 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <Upload className="size-5" />
            </button>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!name.trim() || images.length === 0 || isSubmitting}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t('creatingWithSearch')}
            </>
          ) : (
            <>
              <Plus className="size-4" />
              {parentId ? t('addVariant') : t('createNew')}
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border/60 px-4 py-2 text-sm transition-colors hover:bg-muted"
        >
          {t('cancel')}
        </button>
      </div>
    </form>
  )
}

// ─── Card Item (root or variant) ──────────────────────────────

interface CardItemProps {
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
  activeCardIds: string[]
  onToggleSelectCard: (id: string) => void
  onDeleteCard: (id: string) => Promise<boolean>
  onUpdateCard: (
    id: string,
    data: UpdateCharacterCardRequest,
  ) => Promise<boolean>
  depth?: number
}

function CardItem({
  card,
  isSelected,
  isExpanded,
  onToggleSelect,
  onToggleExpand,
  onDelete,
  onUpdate,
  onCreate,
  activeCardIds,
  onToggleSelectCard,
  onDeleteCard,
  onUpdateCard,
  depth = 0,
}: CardItemProps) {
  const t = useTranslations('CharacterCard')
  const tView = useTranslations('CharacterCard.viewTypes')
  const [expanded, setExpanded] = useState(false)
  const [showVariants, setShowVariants] = useState(false)
  const [showVariantForm, setShowVariantForm] = useState(false)
  const [isCreatingVariant, setIsCreatingVariant] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editPrompt, setEditPrompt] = useState(card.characterPrompt)

  const hasVariants = card.variants && card.variants.length > 0
  const isRoot = depth === 0

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

  // Source image entries with view type badges
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
        {/* Checkbox for multi-select */}
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
          onClick={onToggleExpand}
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
          {isExpanded ? (
            <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="space-y-3 border-t border-border/40 p-3">
          {/* Source images with view type badges */}
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

              {/* Prompt */}
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
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center gap-1 rounded-md border border-destructive/30 px-2.5 py-1 text-xs text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 className="size-3" />
            </button>
          </div>

          {/* Variant create form */}
          {showVariantForm && (
            <CreateForm
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
                <CardItem
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

// ─── Main Component ────────────────────────────────────────────

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
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)

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
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <User className="size-4 text-primary" />
          <h3 className="text-sm font-medium">{t('title')}</h3>
          <span className="text-xs text-muted-foreground">
            ({cards.length})
          </span>
        </div>
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
      </div>

      {/* Create form */}
      {showCreateForm && (
        <CreateForm
          onSubmit={handleCreate}
          onCancel={() => setShowCreateForm(false)}
          isSubmitting={isCreating}
        />
      )}

      {/* Card list */}
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
            <CardItem
              key={card.id}
              card={card}
              isSelected={activeCardIds.includes(card.id)}
              isExpanded={expandedCardId === card.id}
              onToggleSelect={() => onToggleSelect(card.id)}
              onToggleExpand={() =>
                setExpandedCardId(expandedCardId === card.id ? null : card.id)
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

      {/* Combination gallery — shown when 2+ cards are selected */}
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
  )
}
