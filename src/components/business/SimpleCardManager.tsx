'use client'

import { useState, useRef, useCallback } from 'react'
import {
  Plus,
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
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import Image from 'next/image'

import { cn } from '@/lib/utils'
import type { CardType } from '@/constants/card-types'

// ─── Types ──────────────────────────────────────────────────────

interface CardItem {
  id: string
  name: string
  description: string | null
  sourceImageUrl: string | null
  prompt: string // backgroundPrompt / stylePrompt / model name
  tags: string[]
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
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)
  const [editingCardId, setEditingCardId] = useState<string | null>(null)
  const [editPrompt, setEditPrompt] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  // Create form state
  const [newName, setNewName] = useState('')
  const [newPrompt, setNewPrompt] = useState('')
  const [newImageData, setNewImageData] = useState<string | null>(null)
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null)
  const [newLoras, setNewLoras] = useState<{ url: string; scale: number }[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const t = useTranslations('CardSlot')
  const Icon = CARD_ICONS[cardType]
  const color = CARD_COLORS[cardType]

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
          {/* Create button */}
          {!showCreateForm && (
            <button
              type="button"
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              <Plus className="size-3.5" />
              {t('select')}
            </button>
          )}

          {/* Create Form */}
          {showCreateForm && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Name"
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
                          unoptimized
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
                      Upload image to extract attributes
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
                    placeholder={promptPlaceholder ?? 'Description...'}
                    rows={2}
                    className="w-full rounded-md border border-border/60 bg-background px-3 py-1.5 text-xs font-serif focus:border-primary/40 focus:outline-none resize-none"
                  />
                )}

              {/* LoRA configuration (optional) */}
              {showLoraConfig && (
                <div className="space-y-2 rounded-md border border-primary/20 bg-primary/5 p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-primary">
                      LoRA
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
                        + Add LoRA
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
                      Click &quot;+ Add LoRA&quot; to configure
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
                  Create
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
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Card list */}
          {!isLoading &&
            cards.map((card) => (
              <div
                key={card.id}
                className={cn(
                  'rounded-lg border transition-colors',
                  activeCardId === card.id
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border/40 bg-background/50',
                )}
              >
                {/* Card header row */}
                <div className="flex items-center gap-2 px-3 py-2">
                  {/* Select checkbox */}
                  <button
                    type="button"
                    onClick={() =>
                      onSelect(activeCardId === card.id ? null : card.id)
                    }
                    className={cn(
                      'size-4 shrink-0 rounded border transition-colors',
                      activeCardId === card.id
                        ? 'border-primary bg-primary'
                        : 'border-border/60 hover:border-primary/40',
                    )}
                  >
                    {activeCardId === card.id && (
                      <Check className="size-3 text-primary-foreground mx-auto" />
                    )}
                  </button>

                  {/* Thumbnail */}
                  {card.sourceImageUrl && (
                    <div className="relative size-8 shrink-0 overflow-hidden rounded">
                      <Image
                        src={card.sourceImageUrl}
                        alt={card.name}
                        fill
                        className="object-cover"
                        sizes="32px"
                        unoptimized
                      />
                    </div>
                  )}

                  {/* Name */}
                  <span className="flex-1 truncate text-sm font-medium text-foreground">
                    {card.name}
                  </span>

                  {/* Expand / actions */}
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedCardId(
                        expandedCardId === card.id ? null : card.id,
                      )
                    }
                    className="p-1 text-muted-foreground hover:text-foreground"
                  >
                    {expandedCardId === card.id ? (
                      <ChevronDown className="size-3.5" />
                    ) : (
                      <ChevronRight className="size-3.5" />
                    )}
                  </button>
                </div>

                {/* Expanded detail */}
                {expandedCardId === card.id && (
                  <div className="border-t border-border/30 px-3 py-2 space-y-2">
                    {/* Prompt / description */}
                    <div>
                      <span className="text-xs font-medium text-muted-foreground">
                        {promptLabel ?? 'Prompt'}
                      </span>
                      {editingCardId === card.id ? (
                        <div className="mt-1 space-y-1">
                          <textarea
                            value={editPrompt}
                            onChange={(e) => setEditPrompt(e.target.value)}
                            rows={3}
                            className="w-full rounded-md border border-border/60 bg-background px-2 py-1 text-xs font-serif focus:border-primary/40 focus:outline-none resize-none"
                          />
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(card.id)}
                              className="rounded bg-primary px-2 py-0.5 text-xs text-primary-foreground"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingCardId(null)}
                              className="rounded border border-border/60 px-2 py-0.5 text-xs text-muted-foreground"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-0.5 text-xs font-serif text-foreground/80 line-clamp-3">
                          {card.prompt}
                        </p>
                      )}
                    </div>

                    {/* Tags */}
                    {card.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {card.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-muted/50 px-2 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(card)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Edit3 className="size-3" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(card.id)}
                        className="flex items-center gap-1 text-xs text-red-500/70 hover:text-red-500"
                      >
                        <Trash2 className="size-3" />
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

          {/* Empty state */}
          {!isLoading && cards.length === 0 && !showCreateForm && (
            <div className="flex flex-col items-center gap-1.5 py-6 text-center">
              <Palette className="size-5 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground/60 font-serif">
                {t('emptyState')}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
