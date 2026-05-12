'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  Trash2,
  Edit3,
  Check,
  ChevronDown,
  ChevronRight,
  Upload,
  Loader2,
  X,
  Image as ImageIcon,
  Palette,
  Copy,
  Plus,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'

import { cn } from '@/lib/utils'
import type { CardType } from '@/constants/card-types'
import { CardManagerToolbar } from '@/components/business/CardManagerToolbar'
import {
  MediaCardTile,
  type MediaCardAspect,
} from '@/components/business/MediaCardTile'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { CardManagerSortMode } from '@/lib/card-management'
import { matchesCardSearch, sortCardManagerItems } from '@/lib/card-management'

// ─── Types ──────────────────────────────────────────────────────

interface CardItem {
  id: string
  name: string
  description: string | null
  sourceImageUrl: string | null
  prompt: string // backgroundPrompt / stylePrompt / model name
  tags: string[]
  createdAt?: Date | string | number | null
  lastUsedAt?: Date | string | number | null
}

interface SimpleCardManagerProps {
  cardType: CardType
  title: string
  cards: CardItem[]
  activeCardId: string | null
  isLoading: boolean
  onSelect: (id: string | null) => void
  onCreate: (data: {
    name: string
    description?: string
    prompt: string
    sourceImageData?: string
    tags?: string[]
    loras?: { url: string; scale: number }[]
  }) => Promise<unknown>
  onUpdate: (
    id: string,
    data: { name?: string; prompt?: string },
  ) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
  /** Whether this card type supports image extraction */
  supportsImageExtraction?: boolean
  /** Extra content to render inside the create form (e.g. model selector, LoRA) */
  createFormExtra?: React.ReactNode
  /** Hide the prompt textarea in create form (for model cards where prompt is replaced by selector) */
  hidePromptInput?: boolean
  /** Show LoRA configuration in create form */
  showLoraConfig?: boolean
  /** Max LoRAs allowed */
  maxLoras?: number
  /** Placeholder for the prompt field */
  promptPlaceholder?: string
  /** Label for the prompt field */
  promptLabel?: string
}

// ─── Icon Map ───────────────────────────────────────────────────

const CARD_ICONS: Record<CardType, typeof ImageIcon> = {
  CHARACTER: ImageIcon,
  BACKGROUND: ImageIcon,
  STYLE: Palette,
}

const CARD_COLORS: Record<CardType, string> = {
  CHARACTER: 'text-chart-3',
  BACKGROUND: 'text-secondary',
  STYLE: 'text-primary',
}

const CARD_ASPECT: Record<CardType, MediaCardAspect> = {
  CHARACTER: 'portrait',
  BACKGROUND: 'video',
  STYLE: 'square',
}

const CARD_GRID_COLS: Record<CardType, string> = {
  CHARACTER: 'grid-cols-2',
  BACKGROUND: 'grid-cols-2',
  STYLE: 'grid-cols-3',
}

// ─── Component ──────────────────────────────────────────────────

export function SimpleCardManager({
  cardType,
  title,
  cards,
  activeCardId,
  isLoading,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
  supportsImageExtraction = false,
  createFormExtra,
  hidePromptInput = false,
  showLoraConfig = false,
  maxLoras = 5,
  promptPlaceholder,
  promptLabel,
}: SimpleCardManagerProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [detailCardId, setDetailCardId] = useState<string | null>(null)
  const [editingCardId, setEditingCardId] = useState<string | null>(null)
  const [editPrompt, setEditPrompt] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortMode, setSortMode] = useState<CardManagerSortMode>('recent')

  // Create form state
  const [newName, setNewName] = useState('')
  const [newPrompt, setNewPrompt] = useState('')
  const [newImageData, setNewImageData] = useState<string | null>(null)
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null)
  const [newLoras, setNewLoras] = useState<{ url: string; scale: number }[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const t = useTranslations('CardSlot')
  const tv2 = useTranslations('StudioV2')
  const Icon = CARD_ICONS[cardType]
  const color = CARD_COLORS[cardType]
  const aspect = CARD_ASPECT[cardType]
  const gridCols = CARD_GRID_COLS[cardType]

  const detailCard = useMemo(
    () => cards.find((c) => c.id === detailCardId) ?? null,
    [cards, detailCardId],
  )

  const visibleCards = useMemo(
    () =>
      sortCardManagerItems(
        cards.filter((card) =>
          matchesCardSearch(searchQuery, [
            card.name,
            card.description,
            card.prompt,
            card.tags,
          ]),
        ),
        sortMode,
        (card) => card.name,
        (card) => card.createdAt,
        (card) => card.lastUsedAt,
      ),
    [cards, searchQuery, sortMode],
  )

  // ── Image Upload ─────────────────────────────────────────────
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        setNewImageData(dataUrl)
        setNewImagePreview(dataUrl)
      }
      reader.readAsDataURL(file)
    },
    [],
  )

  // ── Create ───────────────────────────────────────────────────
  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return
    setIsCreating(true)
    try {
      const validLoras = newLoras.filter((l) => l.url.trim())
      await onCreate({
        name: newName.trim(),
        prompt: newPrompt.trim() || newName.trim(),
        sourceImageData: newImageData ?? undefined,
        loras: validLoras.length > 0 ? validLoras : undefined,
      })
      setNewName('')
      setNewPrompt('')
      setNewImageData(null)
      setNewImagePreview(null)
      setNewLoras([])
      setShowCreateForm(false)
    } finally {
      setIsCreating(false)
    }
  }, [newName, newPrompt, newImageData, newLoras, onCreate])

  // ── Edit Prompt ──────────────────────────────────────────────
  const handleStartEdit = useCallback((card: CardItem) => {
    setEditingCardId(card.id)
    setEditPrompt(card.prompt)
  }, [])

  const handleSaveEdit = useCallback(
    async (id: string) => {
      await onUpdate(id, { prompt: editPrompt })
      setEditingCardId(null)
    },
    [editPrompt, onUpdate],
  )

  const handleDuplicate = useCallback(
    async (card: CardItem) => {
      setIsCreating(true)
      try {
        await onCreate({
          name: `${card.name} ${t('copySuffix')}`,
          description: card.description ?? undefined,
          prompt: card.prompt,
          tags: card.tags.length > 0 ? card.tags : undefined,
        })
      } finally {
        setIsCreating(false)
      }
    },
    [onCreate, t],
  )

  return (
    <div className="rounded-xl border border-border/60 bg-background/30">
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        <Icon className={cn('size-4', color)} />
        <span className="text-sm font-medium font-display text-foreground">
          {title}
        </span>
        <span className="text-xs text-muted-foreground">({cards.length})</span>

        {activeCardId && (
          <span className="ml-auto mr-2 max-w-[120px] truncate text-xs text-primary">
            {cards.find((c) => c.id === activeCardId)?.name}
          </span>
        )}

        {isExpanded ? (
          <ChevronDown className="ml-auto size-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="ml-auto size-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-border/40 px-4 py-3 space-y-2">
          <CardManagerToolbar
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            sortMode={sortMode}
            onSortModeChange={setSortMode}
            createLabel={t('create')}
            onCreate={() => setShowCreateForm(true)}
            createDisabled={isLoading || showCreateForm || isCreating}
          />

          {/* Create Form */}
          {showCreateForm && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t('namePlaceholder')}
                className="w-full rounded-md border border-border/60 bg-background px-3 py-1.5 text-sm focus:border-primary/40 focus:outline-none"
              />

              {/* Image upload for bg/style cards */}
              {supportsImageExtraction && (
                <div className="space-y-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {newImagePreview ? (
                    <div className="relative">
                      <div className="relative h-24 w-full overflow-hidden rounded-md border border-border/40">
                        <Image
                          src={newImagePreview}
                          alt="Source"
                          fill
                          className="object-cover"
                          sizes="300px"
                          loading="lazy"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setNewImageData(null)
                          setNewImagePreview(null)
                        }}
                        className="absolute right-1 top-1 rounded-full bg-background/80 p-0.5"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border/60 py-3 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                    >
                      <Upload className="size-3.5" />
                      {t('uploadToExtract')}
                    </button>
                  )}
                </div>
              )}

              {/* Prompt input (skip if image will auto-extract, or hidePromptInput) */}
              {!hidePromptInput &&
                (!supportsImageExtraction || !newImageData) && (
                  <textarea
                    value={newPrompt}
                    onChange={(e) => setNewPrompt(e.target.value)}
                    placeholder={
                      promptPlaceholder ?? t('descriptionPlaceholder')
                    }
                    rows={2}
                    className="w-full rounded-md border border-border/60 bg-background px-3 py-1.5 text-xs font-serif focus:border-primary/40 focus:outline-none resize-none"
                  />
                )}

              {/* LoRA configuration (optional) */}
              {showLoraConfig && (
                <div className="space-y-2 rounded-md border border-primary/20 bg-primary/5 p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-primary">
                      {t('loraLabel')}
                    </span>
                    {newLoras.length < maxLoras && (
                      <button
                        type="button"
                        onClick={() =>
                          setNewLoras((prev) => [
                            ...prev,
                            { url: '', scale: 1.0 },
                          ])
                        }
                        className="text-xs text-primary hover:text-primary/80"
                      >
                        + {t('addLora')}
                      </button>
                    )}
                  </div>
                  {newLoras.map((lora, i) => (
                    <div
                      key={i}
                      className="space-y-1 rounded border border-border/40 bg-background p-2"
                    >
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={lora.url}
                          onChange={(e) =>
                            setNewLoras((prev) =>
                              prev.map((l, j) =>
                                j === i ? { ...l, url: e.target.value } : l,
                              ),
                            )
                          }
                          placeholder="https://civitai.com/api/download/models/..."
                          className="flex-1 rounded border border-border/60 bg-background px-2 py-1 text-xs font-mono focus:border-primary/40 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setNewLoras((prev) =>
                              prev.filter((_, j) => j !== i),
                            )
                          }
                          className="shrink-0 p-1 text-red-400 hover:text-red-500"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground w-12">
                          {lora.scale.toFixed(2)}
                        </span>
                        <input
                          type="range"
                          min="0.1"
                          max="2"
                          step="0.05"
                          value={lora.scale}
                          onChange={(e) =>
                            setNewLoras((prev) =>
                              prev.map((l, j) =>
                                j === i
                                  ? { ...l, scale: parseFloat(e.target.value) }
                                  : l,
                              ),
                            )
                          }
                          className="flex-1"
                        />
                      </div>
                    </div>
                  ))}
                  {newLoras.length === 0 && (
                    <p className="text-[10px] text-muted-foreground/60 text-center py-1">
                      {t('loraEmptyHint')}
                    </p>
                  )}
                </div>
              )}

              {/* Extra form content (model selector, etc.) */}
              {createFormExtra}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!newName.trim() || isCreating}
                  className="flex items-center gap-1 rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground disabled:opacity-50"
                >
                  {isCreating ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Check className="size-3" />
                  )}
                  {t('create')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false)
                    setNewName('')
                    setNewPrompt('')
                    setNewImageData(null)
                    setNewImagePreview(null)
                    setNewLoras([])
                  }}
                  className="rounded-md border border-border/60 px-3 py-1 text-xs text-muted-foreground"
                >
                  {tv2('cancel')}
                </button>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && visibleCards.length > 0 && (
            <div className={cn('grid gap-3', gridCols)}>
              {visibleCards.map((card) => (
                <MediaCardTile
                  key={card.id}
                  name={card.name}
                  sourceImageUrl={card.sourceImageUrl}
                  isSelected={activeCardId === card.id}
                  aspect={aspect}
                  selectLabel={t('select')}
                  deselectLabel={t('change')}
                  onToggleSelect={() =>
                    onSelect(activeCardId === card.id ? null : card.id)
                  }
                  onOpenDetail={() => setDetailCardId(card.id)}
                />
              ))}
            </div>
          )}

          {!isLoading && cards.length === 0 && !showCreateForm && (
            <button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className={cn(
                'group flex w-1/2 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 bg-card/30 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-card/50 hover:text-foreground',
                aspect === 'portrait' && 'aspect-[3/4]',
                aspect === 'video' && 'aspect-video',
                aspect === 'square' && 'aspect-square',
              )}
            >
              <Plus className="size-6 transition-transform group-hover:scale-110" />
              <span className="text-xs font-medium">{t('create')}</span>
              <span className="px-3 text-center text-[10px] text-muted-foreground/70">
                {t('emptyState')}
              </span>
            </button>
          )}

          {!isLoading &&
            cards.length > 0 &&
            visibleCards.length === 0 &&
            !showCreateForm && (
              <div className="flex flex-col items-center gap-1.5 py-6 text-center">
                <Palette className="size-5 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground/60 font-serif">
                  {tv2('cardSearchEmpty')}
                </p>
              </div>
            )}

          <Dialog
            open={detailCard !== null}
            onOpenChange={(open) => {
              if (!open) {
                setDetailCardId(null)
                setEditingCardId(null)
              }
            }}
          >
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{detailCard?.name ?? ''}</DialogTitle>
              </DialogHeader>
              {detailCard && (
                <div className="space-y-3">
                  {detailCard.sourceImageUrl && (
                    <div
                      className={cn(
                        'relative w-full overflow-hidden rounded-md border border-white/10',
                        aspect === 'portrait' && 'aspect-[3/4]',
                        aspect === 'video' && 'aspect-video',
                        aspect === 'square' && 'aspect-square',
                      )}
                    >
                      <Image
                        src={detailCard.sourceImageUrl}
                        alt={detailCard.name}
                        fill
                        sizes="400px"
                        className="object-cover"
                      />
                    </div>
                  )}

                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        {promptLabel ?? t('promptLabel')}
                      </span>
                      {editingCardId !== detailCard.id && (
                        <button
                          type="button"
                          onClick={() => handleStartEdit(detailCard)}
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <Edit3 className="size-3" />
                          {tv2('edit')}
                        </button>
                      )}
                    </div>
                    {editingCardId === detailCard.id ? (
                      <div className="space-y-1.5">
                        <textarea
                          value={editPrompt}
                          onChange={(e) => setEditPrompt(e.target.value)}
                          rows={4}
                          className="w-full rounded-md border border-border/60 bg-background px-2 py-1.5 text-xs font-serif focus:border-primary/40 focus:outline-none resize-none"
                        />
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(detailCard.id)}
                            className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground"
                          >
                            {tv2('save')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingCardId(null)}
                            className="rounded border border-border/60 px-3 py-1 text-xs text-muted-foreground"
                          >
                            {tv2('cancel')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs font-serif text-foreground/80">
                        {detailCard.prompt}
                      </p>
                    )}
                  </div>

                  {detailCard.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {detailCard.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 border-t border-border/40 pt-3">
                    <button
                      type="button"
                      onClick={() => void handleDuplicate(detailCard)}
                      className="flex items-center gap-1 rounded-md border border-border/60 px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Copy className="size-3" />
                      {t('duplicate')}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await onDelete(detailCard.id)
                        if (ok) setDetailCardId(null)
                      }}
                      className="flex items-center gap-1 rounded-md border border-destructive/30 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="size-3" />
                      {t('delete')}
                    </button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  )
}
