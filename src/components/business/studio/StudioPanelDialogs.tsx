'use client'

import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import Image from 'next/image'
import {
  ImageIcon,
  Loader2,
  Palette,
  PanelsTopLeft,
  Search,
  UserRound,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'

import { useStudioForm, useStudioData } from '@/contexts/studio-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { modelSupportsLora } from '@/constants/models'
import { buildStudioCardUsageMap } from '@/lib/studio-history'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * Shared loading state for dynamically-imported panel bodies. The first
 * click on Enhance / Reverse / Transform downloads the panel chunk before
 * the dialog can render — without a fallback, the overlay just dims the
 * page for ~1–2 s while the chunk arrives, which reads as "the screen
 * went white" to users. A centred spinner keeps the dialog feeling
 * intentional during that window.
 */
function PanelLoadingFallback() {
  return (
    <div className="flex h-32 items-center justify-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  )
}

/**
 * Radix Dialog suffers an open-and-immediately-close race when the trigger
 * is a sibling button outside the overlay: the same pointerdown that opens
 * the dialog bubbles up to the overlay's outside-click listener as soon as
 * the content mounts, and the dialog closes before the user sees it.
 *
 * Track the moment the panel goes from closed → open and ignore any
 * pointer-outside / interaction-outside event for the next 200 ms — long
 * enough for the trigger's pointer chain to finish, short enough that a
 * deliberate overlay click still dismisses the dialog.
 */
function useJustOpenedGuard(open: boolean) {
  const justOpenedRef = useRef(false)
  useEffect(() => {
    if (!open) return
    justOpenedRef.current = true
    const id = window.setTimeout(() => {
      justOpenedRef.current = false
    }, 200)
    return () => window.clearTimeout(id)
  }, [open])
  return justOpenedRef
}

const PromptAssistantPanel = dynamic(
  () =>
    import('@/components/business/PromptAssistantPanel').then(
      (mod) => mod.PromptAssistantPanel,
    ),
  { loading: () => <PanelLoadingFallback /> },
)
const ReverseEngineerPanel = dynamic(
  () =>
    import('@/components/business/ReverseEngineerPanel').then(
      (mod) => mod.ReverseEngineerPanel,
    ),
  { loading: () => <PanelLoadingFallback /> },
)
const StudioTransformPanel = dynamic(
  () =>
    import('@/components/business/studio/StudioTransformPanel').then(
      (mod) => mod.StudioTransformPanel,
    ),
  { loading: () => <PanelLoadingFallback /> },
)

const LLM_CAPABLE_ADAPTERS = new Set([
  AI_ADAPTER_TYPES.GEMINI,
  AI_ADAPTER_TYPES.OPENAI,
  AI_ADAPTER_TYPES.VOLCENGINE,
])

/**
 * Enhance is a chat panel — content scrolls inside, so it deserves a
 * fixed height so the conversation area has somewhere to live.
 */
const ENHANCE_DIALOG_CLASSES =
  'h-[min(70vh,640px)] w-[calc(100%-2rem)] !max-w-2xl !gap-0 overflow-hidden !border-0 !bg-transparent !p-0 !shadow-2xl sm:!max-w-2xl'

/**
 * Reverse engineer starts as a small upload dropzone, then grows when
 * the user picks dimensions / sees results. A fixed height left a wall
 * of empty space below the dropzone in the initial state, so this dialog
 * uses max-h instead and fits the content vertically.
 */
const REVERSE_DIALOG_CLASSES =
  'max-h-[80vh] w-[calc(100%-2rem)] !max-w-2xl !gap-0 overflow-hidden !border-0 !bg-transparent !p-0 !shadow-2xl sm:!max-w-2xl'

/**
 * Transform — image upload + 6 style presets + preservation control + 1×/4×
 * variants grid. Same shape as Reverse: starts compact (just the dropzone),
 * grows once an image is loaded; max-h keeps the variants grid scrollable
 * without forcing whitespace before upload.
 */
const TRANSFORM_DIALOG_CLASSES =
  'max-h-[85vh] w-[calc(100%-2rem)] !max-w-xl !gap-0 overflow-hidden !border-0 !bg-transparent !p-0 !shadow-2xl sm:!max-w-xl'

const CARD_DIALOG_CLASSES =
  'max-h-[82vh] w-[calc(100%-2rem)] !max-w-3xl !gap-0 overflow-hidden !border-0 !bg-transparent !p-0 !shadow-2xl sm:!max-w-3xl'

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

function StudioCardPicker() {
  const { characters, backgrounds, styles, projects } = useStudioData()
  const t = useTranslations('StudioV2')
  const tV3 = useTranslations('StudioV3')
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
      selectedIds: selectedStyleId,
      isLoading: styles.isLoading,
      onSelect: (id) => styles.setActiveCardId(id),
    },
    {
      kind: 'background',
      label: t('backgroundCards'),
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
  const normalizedQuery = query.trim().toLowerCase()
  const visibleCards = activeGroup.cards
    .filter((card) => {
      if (!normalizedQuery) return true
      return [card.name, ...(card.tags ?? [])]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    })
    .sort((left, right) => {
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

  return (
    <div className="flex max-h-full flex-col overflow-hidden rounded-xl border border-border/40 bg-background shadow-2xl">
      <header className="border-b border-border/40 px-5 py-4">
        <div className="flex items-center gap-2">
          <PanelsTopLeft className="size-4 text-muted-foreground" />
          <h2 className="font-display text-base font-semibold">{t('cards')}</h2>
          {selectedCardCount > 0 ? (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {selectedCardCount}
            </span>
          ) : null}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-muted/30 p-1">
          {groups.map((group) => {
            const active = group.kind === activeKind
            return (
              <button
                key={group.kind}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setActiveKind(group.kind)
                  setQuery('')
                }}
                className={`flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-sm transition-colors ${
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
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('searchCardsPlaceholder')}
            className="h-10 w-full rounded-lg border border-border/60 bg-background pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary/35 focus:ring-2 focus:ring-primary/15"
          />
        </div>
      </header>

      <div className="max-h-[min(58vh,34rem)] overflow-y-auto p-3">
        <button
          type="button"
          onClick={() => activeGroup.onSelect(null)}
          className={`mb-2 flex w-full items-center gap-3 rounded-lg border border-border/60 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/35 ${
            activeGroup.selectedIds.length === 0
              ? 'bg-muted/35 text-foreground'
              : 'bg-background'
          }`}
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            {activeGroup.icon}
          </span>
          <span className="font-medium">{t('none')}</span>
        </button>

        {activeGroup.isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : visibleCards.length === 0 ? (
          <p className="px-3 py-10 text-center font-serif text-sm text-muted-foreground">
            {normalizedQuery ? t('cardSearchEmpty') : t('noCards')}
          </p>
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
                  <span className="relative size-14 shrink-0 overflow-hidden rounded-md bg-muted">
                    {card.sourceImageUrl ? (
                      <Image
                        src={card.sourceImageUrl}
                        alt={card.name}
                        fill
                        sizes="56px"
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

/**
 * StudioPanelDialogs — `enhance` (prompt assistant) and `reverse` (image
 * reverse engineer) used to render inline in the dock's right 40% column.
 * They felt like a separate workspace fighting the prompt area for screen
 * space, so they're now centred small dialogs (Krea-style) the user can
 * dismiss with the chip / Esc / overlay click.
 *
 * `aspectRatio`, `refImage`, `keepChange`, etc. still live in their own
 * places (popover, sheet, dedicated component); this file owns the centred
 * modal panels that are launched from toolbar chips.
 */
export const StudioPanelDialogs = memo(function StudioPanelDialogs() {
  const { state, dispatch } = useStudioForm()
  const { imageUpload, styles } = useStudioData()
  const tCommon = useTranslations('Common')
  const tPanels = useTranslations('StudioPanels')
  const { selectedModel } = useImageModelOptions()
  const { keys: apiKeys } = useApiKeysContext()

  const llmApiKeys = apiKeys
    .filter((k) => k.isActive && LLM_CAPABLE_ADAPTERS.has(k.adapterType))
    .map((k) => ({ id: k.id, label: k.label || k.adapterType }))

  const selectedStyleCard = styles.activeCard
  const modelId =
    state.workflowMode === 'quick' && selectedModel
      ? selectedModel.modelId
      : (selectedStyleCard?.modelId ?? undefined)

  const enhanceGuard = useJustOpenedGuard(state.panels.enhance)
  const reverseGuard = useJustOpenedGuard(state.panels.reverse)
  const transformGuard = useJustOpenedGuard(state.panels.transform)
  const cardGuard = useJustOpenedGuard(state.panels.cardSelector)

  return (
    <>
      {/* ── Prompt Assistant (Enhance / 追加) ─────────────────── */}
      <Dialog
        open={state.panels.enhance}
        onOpenChange={(open) => {
          if (!open) dispatch({ type: 'CLOSE_PANEL', payload: 'enhance' })
        }}
      >
        <DialogContent
          showCloseButton={false}
          className={ENHANCE_DIALOG_CLASSES}
          onPointerDownOutside={(e) => {
            if (enhanceGuard.current) e.preventDefault()
          }}
          onInteractOutside={(e) => {
            if (enhanceGuard.current) e.preventDefault()
          }}
        >
          <DialogTitle className="sr-only">{tPanels('enhance')}</DialogTitle>
          <DialogDescription className="sr-only">
            {tPanels('enhance')}
          </DialogDescription>
          <div className="flex size-full flex-col overflow-hidden rounded-xl border border-border/40 bg-background shadow-2xl">
            <PromptAssistantPanel
              currentPrompt={state.prompt}
              modelId={modelId}
              referenceImageData={imageUpload.referenceImages[0]}
              llmApiKeys={llmApiKeys}
              onUsePrompt={(text) => {
                dispatch({ type: 'SET_PROMPT', payload: text })
              }}
              onClose={() => {
                dispatch({ type: 'CLOSE_PANEL', payload: 'enhance' })
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Cards ─────────────────────────────────────────────── */}
      <Dialog
        open={state.panels.cardSelector}
        onOpenChange={(open) => {
          if (!open)
            dispatch({
              type: 'CLOSE_PANEL',
              payload: 'cardSelector',
            })
        }}
      >
        <DialogContent
          showCloseButton
          closeLabel={tCommon('close')}
          className={CARD_DIALOG_CLASSES}
          onPointerDownOutside={(e) => {
            if (cardGuard.current) e.preventDefault()
          }}
          onInteractOutside={(e) => {
            if (cardGuard.current) e.preventDefault()
          }}
        >
          <DialogTitle className="sr-only">{tPanels('cards')}</DialogTitle>
          <DialogDescription className="sr-only">
            {tPanels('cards')}
          </DialogDescription>
          <StudioCardPicker />
        </DialogContent>
      </Dialog>

      {/* ── Reverse Engineer (图片反向工程) ───────────────────── */}
      <Dialog
        open={state.panels.reverse}
        onOpenChange={(open) => {
          if (!open) dispatch({ type: 'CLOSE_PANEL', payload: 'reverse' })
        }}
      >
        <DialogContent
          showCloseButton
          closeLabel={tCommon('close')}
          className={REVERSE_DIALOG_CLASSES}
          onPointerDownOutside={(e) => {
            if (reverseGuard.current) e.preventDefault()
          }}
          onInteractOutside={(e) => {
            if (reverseGuard.current) e.preventDefault()
          }}
        >
          <DialogTitle className="sr-only">{tPanels('reverse')}</DialogTitle>
          <DialogDescription className="sr-only">
            {tPanels('reverse')}
          </DialogDescription>
          <div className="flex max-h-full flex-col overflow-y-auto rounded-xl border border-border/40 bg-background p-4 shadow-2xl">
            <ReverseEngineerPanel
              onUsePrompt={(prompt) => {
                dispatch({ type: 'SET_PROMPT', payload: prompt })
                dispatch({ type: 'CLOSE_PANEL', payload: 'reverse' })
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Transform (图像风格转换) ──────────────────────────── */}
      <Dialog
        open={state.panels.transform}
        onOpenChange={(open) => {
          if (!open) dispatch({ type: 'CLOSE_PANEL', payload: 'transform' })
        }}
      >
        <DialogContent
          showCloseButton
          closeLabel={tCommon('close')}
          className={TRANSFORM_DIALOG_CLASSES}
          onPointerDownOutside={(e) => {
            if (transformGuard.current) e.preventDefault()
          }}
          onInteractOutside={(e) => {
            if (transformGuard.current) e.preventDefault()
          }}
        >
          <DialogTitle className="sr-only">{tPanels('transform')}</DialogTitle>
          <DialogDescription className="sr-only">
            {tPanels('transform')}
          </DialogDescription>
          <div className="flex max-h-full flex-col overflow-y-auto rounded-xl border border-border/40 bg-background p-4 shadow-2xl">
            <StudioTransformPanel />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
})
