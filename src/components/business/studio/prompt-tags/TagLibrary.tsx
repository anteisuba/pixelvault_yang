'use client'

import { useMemo, useState } from 'react'
import {
  ArrowUpRight,
  Check,
  Loader2,
  Plus,
  Search,
  Tag,
  Trash2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  LORA_WORKBENCH_SEARCH_PARAM,
  LORA_WORKBENCH_SECTIONS,
} from '@/constants/lora'
import { PROMPT_TAG_DEFINITIONS } from '@/constants/prompt-tags'
import { ROUTES } from '@/constants/routes'
import { useActiveLoraStack } from '@/hooks/use-active-lora-stack'
import { useCivitaiMinedPrompts } from '@/hooks/prompts/use-civitai-mined-prompts'
import { useModelKeywordLoraTags } from '@/hooks/prompts/use-model-keyword-lora-tags'
import { usePromptTagStack } from '@/hooks/use-prompt-tag-stack'
import { Link } from '@/i18n/navigation'
import {
  getPromptTagCategories,
  searchPromptTags,
} from '@/lib/prompt-tag-search'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { LoraAssetRecord } from '@/types'
import type { PromptPolarity, PromptTagSearchResult } from '@/types/prompt-tags'
import type { PromptTagDefinition } from '@/types/prompt-tags'

import { TagSourceBadge } from './TagSourceBadge'

interface TagLibraryProps {
  onClose?: () => void
  className?: string
}

type PromptTagsTranslator = ReturnType<typeof useTranslations>

export function TagLibrary({ onClose, className }: TagLibraryProps) {
  const t = useTranslations('PromptTags')
  const [query, setQuery] = useState('')
  const [polarity, setPolarity] = useState<PromptPolarity>('positive')
  const promptTags = usePromptTagStack()
  const loraStack = useActiveLoraStack()
  const trimmedQuery = query.trim()
  const modelKeywordTags = useModelKeywordLoraTags(trimmedQuery)
  const activeLoraTags = useMemo(
    () =>
      loraStack.items.flatMap((entry) => buildLoraSourceTags(entry.asset, t)),
    [loraStack.items, t],
  )
  const searchableDefinitions = useMemo(
    () => [
      ...PROMPT_TAG_DEFINITIONS,
      ...activeLoraTags,
      ...modelKeywordTags.tags,
    ],
    [activeLoraTags, modelKeywordTags.tags],
  )

  const results = useMemo(
    () =>
      searchPromptTags({
        query,
        polarity,
        definitions: searchableDefinitions,
        selectedTagIds: promptTags.selectedTagIds,
      }),
    [polarity, promptTags.selectedTagIds, query, searchableDefinitions],
  )
  const categories = useMemo(
    () => getPromptTagCategories(PROMPT_TAG_DEFINITIONS, polarity),
    [polarity],
  )
  const landingTags = useMemo(
    () =>
      PROMPT_TAG_DEFINITIONS.filter(
        (tag) => tag.source === 'system' && tag.polarity === polarity,
      ).slice(0, 10),
    [polarity],
  )

  const addCustomTag = () => {
    const promptText = trimmedQuery
    if (!promptText) return
    promptTags.addTag({
      id: `user:${polarity}:${promptText.toLowerCase().replace(/\s+/g, '-')}`,
      type: polarity === 'negative' ? 'negative' : 'subject',
      source: 'user',
      label: promptText,
      promptText,
      aliases: [],
      category: 'custom',
      polarity,
      modelFamilies: ['any'],
      orderGroup: 90,
      confidence: 'user',
    })
    setQuery('')
  }

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="space-y-3 border-b border-border/60 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Enter' && results.length === 0) {
                event.preventDefault()
                addCustomTag()
              }
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onFocus={(event) => event.stopPropagation()}
            placeholder={t('library.searchPlaceholder')}
            className="pl-8"
          />
        </div>
        <div className="grid grid-cols-2 rounded-lg bg-muted p-1">
          {(['positive', 'negative'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setPolarity(value)}
              className={cn(
                'h-8 rounded-md text-xs font-semibold transition-colors',
                polarity === value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t(`library.${value}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {trimmedQuery ? (
          <SearchResults
            results={results}
            query={trimmedQuery}
            polarity={polarity}
            isModelKeywordLoading={modelKeywordTags.isLoading}
            modelKeywordError={modelKeywordTags.error}
            onAddCustom={addCustomTag}
          />
        ) : (
          <div className="space-y-4">
            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('library.recommended')}
                </h3>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {landingTags.map((tag) => (
                  <TagQuickChip
                    key={tag.id}
                    result={{
                      tag,
                      score: 1,
                      isSelected: promptTags.selectedTagIds.has(tag.id),
                    }}
                  />
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('library.loraTags')}
              </h3>
              {loraStack.items.length > 0 ? (
                <div className="space-y-2">
                  {loraStack.items.map((entry) => (
                    <LoraSourceTagGroup
                      key={entry.asset.id}
                      asset={entry.asset}
                    />
                  ))}
                </div>
              ) : (
                <Link
                  href={`${ROUTES.STUDIO_LORA}?${LORA_WORKBENCH_SEARCH_PARAM}=${LORA_WORKBENCH_SECTIONS.MINE}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border px-2.5 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                  onClick={onClose}
                >
                  {t('library.openLoraLibrary')}
                  <ArrowUpRight className="size-3.5" aria-hidden />
                </Link>
              )}
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('library.categories')}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => setQuery(category)}
                    className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {t(`category.${category}`)}
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border/60 p-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => {
            promptTags.clearTags()
            loraStack.clear()
          }}
          disabled={
            promptTags.selectedCount === 0 && loraStack.items.length === 0
          }
        >
          <Trash2 className="size-4" aria-hidden />
          {t('library.clearAll')}
        </Button>
        <Link
          href={`${ROUTES.STUDIO_LORA}?${LORA_WORKBENCH_SEARCH_PARAM}=${LORA_WORKBENCH_SECTIONS.MINE}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-foreground hover:bg-muted"
          onClick={onClose}
        >
          {t('library.openLoraLibraryShort')}
          <ArrowUpRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  )
}

interface SearchResultsProps {
  results: PromptTagSearchResult[]
  query: string
  polarity: PromptPolarity
  onAddCustom: () => void
  isModelKeywordLoading: boolean
  modelKeywordError: string | null
}

function SearchResults({
  results,
  query,
  polarity,
  onAddCustom,
  isModelKeywordLoading,
  modelKeywordError,
}: SearchResultsProps) {
  const t = useTranslations('PromptTags')

  if (results.length === 0 && isModelKeywordLoading) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-center">
        <Loader2
          className="mx-auto size-5 animate-spin text-muted-foreground"
          aria-hidden
        />
        <p className="mt-2 text-sm font-medium">
          {t('library.modelKeywordLoading')}
        </p>
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-4 text-center">
        <Tag className="mx-auto size-5 text-muted-foreground" aria-hidden />
        <p className="mt-2 text-sm font-medium">{t('library.emptyTitle')}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('library.emptyDescription', { query })}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={onAddCustom}
        >
          <Plus className="size-4" aria-hidden />
          {t('library.addCustom', {
            polarity: t(`library.${polarity}`),
          })}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {results.map((result) => (
        <TagResultRow key={result.tag.id} result={result} />
      ))}
      {isModelKeywordLoading ? (
        <div className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          {t('library.modelKeywordLoading')}
        </div>
      ) : null}
      {modelKeywordError ? (
        <p className="px-1 text-xs text-muted-foreground">
          {t('library.modelKeywordError')}
        </p>
      ) : null}
    </div>
  )
}

function tagSlug(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return slug.replace(/^-+|-+$/g, '') || 'tag'
}

function buildLoraPromptTag({
  asset,
  idSuffix,
  label,
  promptText,
  source,
  orderGroup,
  confidence,
}: {
  asset: LoraAssetRecord
  idSuffix: string
  label: string
  promptText: string
  source: PromptTagDefinition['source']
  orderGroup: number
  confidence: PromptTagDefinition['confidence']
}): PromptTagDefinition {
  return {
    id: `lora-source:${asset.id}:${idSuffix}`,
    type:
      source === 'mined_prompt' || source === 'civitai'
        ? 'prompt_preset'
        : 'lora_trigger',
    source,
    label,
    promptText,
    aliases: [
      asset.name,
      asset.triggerWord,
      asset.baseModelFamily,
      asset.provider,
    ].filter((value): value is string => Boolean(value)),
    category: 'lora',
    polarity: 'positive',
    modelFamilies: ['any'],
    orderGroup,
    confidence,
    loraAssetId: asset.id,
    loraStyleCode: asset.styleCode,
    loraUrl: asset.loraUrl,
    loraDefaultScale: asset.defaultScale,
  }
}

function buildLoraSourceTags(
  asset: LoraAssetRecord,
  t: PromptTagsTranslator,
): PromptTagDefinition[] {
  const tags: PromptTagDefinition[] = []
  const trigger = asset.triggerWord.trim()
  if (trigger) {
    tags.push(
      buildLoraPromptTag({
        asset,
        idSuffix: 'trigger',
        label: t('library.loraSourceTrigger', { name: asset.name }),
        promptText: trigger,
        source: 'lora_asset',
        orderGroup: 20,
        confidence: 'official',
      }),
    )
  }

  const authorPrompt = asset.recommendedPrompt?.trim()
  if (authorPrompt) {
    tags.push(
      buildLoraPromptTag({
        asset,
        idSuffix: 'author',
        label: t('library.loraSourceAuthorPrompt', { name: asset.name }),
        promptText: authorPrompt,
        source: 'civitai',
        orderGroup: 21,
        confidence: 'official',
      }),
    )
  }

  for (const [index, variant] of (
    asset.recommendedPromptAlternates ?? []
  ).entries()) {
    const prompt = variant.prompt.trim()
    if (!prompt) continue
    tags.push(
      buildLoraPromptTag({
        asset,
        idSuffix: `author-alt-${index}`,
        label: t('library.loraSourceAlternatePrompt', {
          name: asset.name,
          index: index + 2,
        }),
        promptText: prompt,
        source: 'civitai',
        orderGroup: 22 + index,
        confidence: 'official',
      }),
    )
  }

  return tags
}

function LoraSourceTagGroup({ asset }: { asset: LoraAssetRecord }) {
  const t = useTranslations('PromptTags')
  const promptTags = usePromptTagStack()
  const minedPrompts = useCivitaiMinedPrompts(asset)
  const sourceTags = useMemo(() => {
    const baseTags = buildLoraSourceTags(asset, t)
    const minedTags = minedPrompts.outfits.map((outfit, index) =>
      buildLoraPromptTag({
        asset,
        idSuffix: `mined-${index}-${tagSlug(outfit.prompt)}`,
        label: t('library.loraSourceMinedPrompt', {
          name: asset.name,
          index: index + 1,
        }),
        promptText: outfit.prompt,
        source: 'mined_prompt',
        orderGroup: 30 + index,
        confidence: 'mined',
      }),
    )
    return [...baseTags, ...minedTags]
  }, [asset, minedPrompts.outfits, t])

  return (
    <div className="rounded-lg border border-border/70 bg-background/40 p-2.5">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-foreground">
            {asset.name}
          </p>
          <p className="mt-0.5 truncate font-mono text-2xs text-muted-foreground">
            {asset.triggerWord}
          </p>
        </div>
        <Check className="size-3.5 shrink-0 text-emerald-500" aria-hidden />
      </div>
      {sourceTags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {sourceTags.map((tag) => (
            <TagQuickChip
              key={tag.id}
              result={{
                tag,
                score: 1,
                isSelected: promptTags.selectedTagIds.has(tag.id),
              }}
            />
          ))}
        </div>
      ) : null}
      {minedPrompts.isLoading ? (
        <div className="mt-2 inline-flex h-6 items-center gap-1.5 rounded-md text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          {t('library.civitaiMinedLoading')}
        </div>
      ) : null}
      {minedPrompts.hasFetched &&
      minedPrompts.outfits.length === 0 &&
      asset.fileHashAutoV3 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {t('library.civitaiMinedEmpty')}
        </p>
      ) : null}
    </div>
  )
}

function TagQuickChip({ result }: { result: PromptTagSearchResult }) {
  const t = useTranslations('PromptTags')
  const { addTag } = usePromptTagStack()
  const tag = result.tag

  return (
    <button
      type="button"
      disabled={result.isSelected}
      onClick={() => addTag(tag)}
      title={tag.promptText}
      className={cn(
        'inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        result.isSelected
          ? 'border-emerald-400/50 bg-emerald-500/10 text-emerald-200'
          : 'border-border/70 bg-background/40 text-foreground hover:bg-muted',
      )}
    >
      {result.isSelected ? (
        <Check className="size-3.5 shrink-0" aria-hidden />
      ) : (
        <Plus className="size-3.5 shrink-0" aria-hidden />
      )}
      <span className="truncate">{tag.label}</span>
      <span className="sr-only">
        {result.isSelected ? t('library.added') : t('library.add')}
      </span>
    </button>
  )
}

function TagResultRow({ result }: { result: PromptTagSearchResult }) {
  const t = useTranslations('PromptTags')
  const { addTag } = usePromptTagStack()
  const tag = result.tag

  return (
    <button
      type="button"
      disabled={result.isSelected}
      onClick={() => addTag(tag)}
      className="flex w-full items-center justify-between gap-2 rounded-lg border border-border/60 px-2.5 py-2 text-left transition-colors hover:bg-muted/60 disabled:cursor-default disabled:bg-muted/40"
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium">{tag.label}</span>
          <TagSourceBadge source={tag.source} />
        </div>
        <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
          {tag.promptText}
        </p>
      </div>
      <span
        className={cn(
          'inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
          result.isSelected
            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
            : 'border-border text-muted-foreground',
        )}
      >
        {result.isSelected ? (
          <Check className="size-3.5" aria-hidden />
        ) : (
          <Plus className="size-3.5" aria-hidden />
        )}
        <span className="sr-only">
          {result.isSelected ? t('library.added') : t('library.add')}
        </span>
      </span>
    </button>
  )
}
