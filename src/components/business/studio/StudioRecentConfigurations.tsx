'use client'

import { memo, useMemo } from 'react'
import { Clock3 } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  getModelMessageKey,
  isBuiltInModel,
} from '@/constants/models'
import { useStudioForm, useStudioData } from '@/contexts/studio-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { buildRecentStudioConfigurations } from '@/lib/studio-history'
import { cn } from '@/lib/utils'

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`
}

export const StudioRecentConfigurations = memo(
  function StudioRecentConfigurations() {
    const { state, dispatch } = useStudioForm()
    const { projects, characters, backgrounds, styles } = useStudioData()
    const { modelOptions } = useImageModelOptions()
    const tStudio = useTranslations('StudioV3')
    const tCards = useTranslations('StudioV2')
    const tModels = useTranslations('Models')

    const recentConfigurations = useMemo(
      () => buildRecentStudioConfigurations(projects.history, modelOptions),
      [projects.history, modelOptions],
    )

    const characterNames = useMemo(() => {
      const entries = new Map<string, string>()
      for (const card of characters.cards) {
        entries.set(card.id, card.name)
        for (const variant of card.variants) {
          entries.set(variant.id, variant.name)
        }
      }
      return entries
    }, [characters.cards])

    const backgroundNames = useMemo(
      () => new Map(backgrounds.cards.map((card) => [card.id, card.name])),
      [backgrounds.cards],
    )

    const styleNames = useMemo(
      () => new Map(styles.cards.map((card) => [card.id, card.name])),
      [styles.cards],
    )

    const modelNames = useMemo(() => {
      const entries = new Map<string, string>()
      for (const option of modelOptions) {
        const label = isBuiltInModel(option.modelId)
          ? tModels(`${getModelMessageKey(option.modelId)}.label`)
          : option.modelId
        entries.set(option.modelId, label)
      }
      return entries
    }, [modelOptions, tModels])

    const selectedCharacterId = characters.activeCardIds[0] ?? null

    const getConfigurationTitle = (
      configuration: (typeof recentConfigurations)[number],
    ): string => {
      if (configuration.workflowMode === 'card') {
        const parts: string[] = []

        if (configuration.characterCardId) {
          parts.push(
            characterNames.get(configuration.characterCardId) ?? tCards('character'),
          )
        }

        if (configuration.backgroundCardId) {
          parts.push(
            backgroundNames.get(configuration.backgroundCardId) ?? tCards('background'),
          )
        }

        if (configuration.styleCardId) {
          parts.push(styleNames.get(configuration.styleCardId) ?? tCards('style'))
        }

        if (parts.length > 0) {
          return parts.join(' / ')
        }
      }

      if (configuration.modelId) {
        return modelNames.get(configuration.modelId) ?? configuration.modelId
      }

      return configuration.workflowMode === 'card'
        ? tStudio('cardMode')
        : tStudio('quickMode')
    }

    const isConfigurationActive = (
      configuration: (typeof recentConfigurations)[number],
    ): boolean =>
      state.workflowMode === configuration.workflowMode &&
      state.prompt === configuration.prompt &&
      state.aspectRatio === configuration.aspectRatio &&
      selectedCharacterId === configuration.characterCardId &&
      backgrounds.activeCardId === configuration.backgroundCardId &&
      styles.activeCardId === configuration.styleCardId &&
      (configuration.workflowMode !== 'quick' ||
        !configuration.optionId ||
        state.selectedOptionId === configuration.optionId)

    const applyConfiguration = (
      configuration: (typeof recentConfigurations)[number],
    ) => {
      dispatch({ type: 'CLOSE_ALL_PANELS' })
      dispatch({
        type: 'SET_WORKFLOW_MODE',
        payload: configuration.workflowMode,
      })
      dispatch({ type: 'SET_PROMPT', payload: configuration.prompt })
      dispatch({
        type: 'SET_ASPECT_RATIO',
        payload: configuration.aspectRatio,
      })

      if (configuration.workflowMode === 'quick') {
        dispatch({ type: 'SET_OPTION_ID', payload: configuration.optionId })
      }

      characters.setActiveCardIds(
        configuration.characterCardId ? [configuration.characterCardId] : [],
      )
      backgrounds.setActiveCardId(configuration.backgroundCardId)
      styles.setActiveCardId(configuration.styleCardId)
    }

    return (
      <div className="space-y-2 rounded-xl border border-border/40 bg-background/30 p-3">
        <div className="flex items-center gap-2">
          <Clock3 className="size-3.5 text-primary/70" />
          <span className="text-xs font-medium text-muted-foreground">
            {tStudio('recentConfigurations')}
          </span>
        </div>

        {recentConfigurations.length === 0 ? (
          <p className="text-xs font-serif leading-5 text-muted-foreground/70">
            {tStudio('recentConfigurationsEmpty')}
          </p>
        ) : (
          <div className="space-y-2">
            {recentConfigurations.map((configuration) => (
              <button
                key={configuration.generationId}
                type="button"
                onClick={() => applyConfiguration(configuration)}
                className={cn(
                  'w-full rounded-lg border px-3 py-2 text-left transition-colors',
                  isConfigurationActive(configuration)
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border/50 bg-background/70 hover:border-primary/20 hover:bg-primary/5',
                )}
                aria-label={tStudio('applyRecentConfiguration')}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {getConfigurationTitle(configuration)}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs font-serif leading-5 text-muted-foreground">
                      {truncateText(configuration.prompt, 80)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-border/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {configuration.workflowMode === 'card'
                      ? tStudio('cardMode')
                      : tStudio('quickMode')}
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground/70">
                  {configuration.aspectRatio}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  },
)
