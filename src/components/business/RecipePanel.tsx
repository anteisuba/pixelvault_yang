'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Sparkles, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { CardSlot } from '@/components/business/CardSlot'
import { cn } from '@/lib/utils'
import type { CardType } from '@/constants/card-types'
import type {
  CharacterCardRecord,
  BackgroundCardRecord,
  StyleCardRecord,
  ModelCardRecord,
  AdvancedParams,
} from '@/types'

// ─── Types ──────────────────────────────────────────────────────

interface RecipePanelProps {
  // Card data
  characterCards: CharacterCardRecord[]
  backgroundCards: BackgroundCardRecord[]
  styleCards: StyleCardRecord[]
  modelCards: ModelCardRecord[]
  // Selected IDs
  selectedCharacterId: string | null
  selectedBackgroundId: string | null
  selectedStyleId: string | null
  selectedModelId: string | null
  // Callbacks
  onSelectCharacter: (id: string | null) => void
  onSelectBackground: (id: string | null) => void
  onSelectStyle: (id: string | null) => void
  onSelectModel: (id: string | null) => void
  // Free prompt
  freePrompt: string
  onFreePromptChange: (value: string) => void
  // Compile
  compiledPrompt: string | null
  onCompile: () => void
  isCompiling: boolean
  // Loading states
  isLoadingCards?: boolean
}

// ─── Component ──────────────────────────────────────────────────

export function RecipePanel({
  characterCards,
  backgroundCards,
  styleCards,
  modelCards,
  selectedCharacterId,
  selectedBackgroundId,
  selectedStyleId,
  selectedModelId,
  onSelectCharacter,
  onSelectBackground,
  onSelectStyle,
  onSelectModel,
  freePrompt,
  onFreePromptChange,
  compiledPrompt,
  onCompile,
  isCompiling,
  isLoadingCards,
}: RecipePanelProps) {
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false)
  const t = useTranslations('CardRecipe')

  // Build badge for model card (LoRA count)
  const selectedModel = modelCards.find((m) => m.id === selectedModelId)
  const loraCount =
    (selectedModel?.advancedParams as AdvancedParams | null)?.loras?.length ?? 0
  const modelBadge = loraCount > 0 ? `${loraCount} LoRA` : undefined

  // Count selected cards
  const selectedCount = [
    selectedCharacterId,
    selectedBackgroundId,
    selectedStyleId,
    selectedModelId,
  ].filter(Boolean).length

  return (
    <div className="space-y-2">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground font-display">
          {t('title')}
        </h3>
        {selectedCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {selectedCount}/4
          </span>
        )}
      </div>

      {/* Card slots — collapsible */}
      <div className="space-y-1.5">
        <CardSlot
          cardType={'CHARACTER' as CardType}
          items={characterCards.map((c) => ({ id: c.id, name: c.name }))}
          selectedId={selectedCharacterId}
          onSelect={onSelectCharacter}
          isLoading={isLoadingCards}
        />
        <CardSlot
          cardType={'BACKGROUND' as CardType}
          items={backgroundCards.map((c) => ({ id: c.id, name: c.name }))}
          selectedId={selectedBackgroundId}
          onSelect={onSelectBackground}
          isLoading={isLoadingCards}
        />
        <CardSlot
          cardType={'STYLE' as CardType}
          items={styleCards.map((c) => ({ id: c.id, name: c.name }))}
          selectedId={selectedStyleId}
          onSelect={onSelectStyle}
          isLoading={isLoadingCards}
        />
        <CardSlot
          cardType={'MODEL' as CardType}
          items={modelCards.map((c) => ({ id: c.id, name: c.name }))}
          selectedId={selectedModelId}
          onSelect={onSelectModel}
          isLoading={isLoadingCards}
          badge={modelBadge}
        />
      </div>

      {/* Free prompt (action/scene) */}
      <div className="space-y-1">
        <label
          htmlFor="recipe-free-prompt"
          className="text-xs font-medium text-muted-foreground"
        >
          {t('freePrompt')}
        </label>
        <textarea
          id="recipe-free-prompt"
          value={freePrompt}
          onChange={(e) => onFreePromptChange(e.target.value)}
          placeholder={t('freePromptPlaceholder')}
          className="w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm font-serif text-foreground placeholder:text-muted-foreground/40 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20 resize-none"
          rows={2}
        />
      </div>

      {/* Compiled preview */}
      {compiledPrompt && (
        <div className="rounded-lg border border-border/40 bg-muted/20">
          <button
            type="button"
            onClick={() => setIsPreviewExpanded(!isPreviewExpanded)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left"
          >
            <Sparkles className="size-3 text-primary" />
            <span className="text-xs font-medium text-muted-foreground">
              {t('compiledPrompt')}
            </span>
            {isPreviewExpanded ? (
              <ChevronUp className="ml-auto size-3 text-muted-foreground" />
            ) : (
              <ChevronDown className="ml-auto size-3 text-muted-foreground" />
            )}
          </button>
          {isPreviewExpanded && (
            <div className="border-t border-border/30 px-3 py-2">
              <p className="text-xs font-serif text-foreground/80 whitespace-pre-wrap">
                {compiledPrompt}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Compile button */}
      <button
        type="button"
        onClick={onCompile}
        disabled={isCompiling || !selectedModelId}
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
          selectedModelId
            ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm'
            : 'bg-muted text-muted-foreground cursor-not-allowed',
        )}
      >
        {isCompiling ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {t('compiling')}
          </>
        ) : (
          <>
            <Sparkles className="size-4" />
            {t('compile')}
          </>
        )}
      </button>
    </div>
  )
}
