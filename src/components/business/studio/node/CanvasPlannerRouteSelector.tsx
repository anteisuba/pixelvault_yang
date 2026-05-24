'use client'

import { useCallback, useMemo, useState } from 'react'
import { Check, ChevronDown, Key, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { AI_ADAPTER_TYPES, getProviderLabel } from '@/constants/providers'
import {
  SCRIPT_BREAKDOWN_QUICK_SETUP_OPTION_PREFIX,
  SCRIPT_PLANNER_MODEL_OPTIONS,
  SCRIPT_PLANNER_PROVIDER_IDS,
  type ScriptPlannerConcreteProvider,
} from '@/constants/script-breakdown'
import { useApiKeysContext } from '@/contexts/api-keys-context'
import { QuickSetupDialog } from '@/components/business/studio/QuickSetupDialog'
import { ApiKeyHealthDot } from '@/components/business/ApiKeyHealthDot'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface NodePlannerRouteSelection {
  optionId: string
  plannerProvider: ScriptPlannerConcreteProvider
  apiKeyId: string
}

interface CanvasPlannerRouteSelectorProps {
  value: NodePlannerRouteSelection | null
  onChange: (value: NodePlannerRouteSelection) => void
  className?: string
}

interface SavedPlannerRouteOption extends NodePlannerRouteSelection {
  routeLabel: string
  modelLabel: string
  providerLabel: string
  maskedKey: string
}

interface LockedPlannerRouteOption {
  optionId: string
  adapterType: AI_ADAPTER_TYPES
  modelId: string
  modelLabel: string
  providerLabel: string
}

interface QuickSetupState {
  open: boolean
  modelId: string
  modelLabel: string
  adapterType: AI_ADAPTER_TYPES
  optionId: string
}

function getPlannerProviderForAdapter(
  adapterType: AI_ADAPTER_TYPES,
): ScriptPlannerConcreteProvider | null {
  switch (adapterType) {
    case AI_ADAPTER_TYPES.GEMINI:
      return SCRIPT_PLANNER_PROVIDER_IDS.gemini
    case AI_ADAPTER_TYPES.OPENAI:
      return SCRIPT_PLANNER_PROVIDER_IDS.openai
    default:
      return null
  }
}

export function getPlannerKeyOptionId(keyId: string): string {
  return `${SCRIPT_BREAKDOWN_QUICK_SETUP_OPTION_PREFIX}:key:${keyId}`
}

function getPlannerSetupOptionId(modelId: string): string {
  return `${SCRIPT_BREAKDOWN_QUICK_SETUP_OPTION_PREFIX}:setup:${modelId}`
}

export function CanvasPlannerRouteSelector({
  value,
  onChange,
  className,
}: CanvasPlannerRouteSelectorProps) {
  const t = useTranslations('StudioNode.plannerRoute')
  const tApiKeys = useTranslations('StudioApiKeys')
  const { keys, healthMap, isLoading } = useApiKeysContext()
  const [open, setOpen] = useState(false)
  const [quickSetup, setQuickSetup] = useState<QuickSetupState>({
    open: false,
    modelId: '',
    modelLabel: '',
    adapterType: AI_ADAPTER_TYPES.GEMINI,
    optionId: '',
  })

  const savedRoutes = useMemo<SavedPlannerRouteOption[]>(() => {
    const routes: SavedPlannerRouteOption[] = []

    for (const key of keys) {
      if (!key.isActive) {
        continue
      }

      const plannerProvider = getPlannerProviderForAdapter(key.adapterType)
      if (!plannerProvider) {
        continue
      }

      const plannerModel = SCRIPT_PLANNER_MODEL_OPTIONS.find(
        (option) => option.provider === plannerProvider,
      )
      if (!plannerModel) {
        continue
      }

      routes.push({
        optionId: getPlannerKeyOptionId(key.id),
        plannerProvider,
        apiKeyId: key.id,
        routeLabel: key.label,
        modelLabel: plannerModel.label,
        providerLabel: getProviderLabel(key.providerConfig),
        maskedKey: key.maskedKey,
      })
    }

    return routes
  }, [keys])

  const lockedRoutes = useMemo<LockedPlannerRouteOption[]>(
    () =>
      SCRIPT_PLANNER_MODEL_OPTIONS.map((option) => ({
        optionId: getPlannerSetupOptionId(option.modelId),
        adapterType: option.adapterType,
        modelId: option.modelId,
        modelLabel: option.label,
        providerLabel: option.label,
      })),
    [],
  )

  const selectedSavedRoute = value
    ? savedRoutes.find((option) => option.apiKeyId === value.apiKeyId)
    : undefined
  const selectedLabel = selectedSavedRoute?.routeLabel ?? t('triggerLabel')
  const selectedHealthStatus = selectedSavedRoute
    ? healthMap[selectedSavedRoute.apiKeyId]
    : undefined

  const handleSelectSavedRoute = useCallback(
    (option: SavedPlannerRouteOption) => {
      onChange({
        optionId: option.optionId,
        plannerProvider: option.plannerProvider,
        apiKeyId: option.apiKeyId,
      })
      setOpen(false)
    },
    [onChange],
  )

  const handleOpenQuickSetup = useCallback(
    (option: LockedPlannerRouteOption) => {
      setQuickSetup({
        open: true,
        modelId: option.modelId,
        modelLabel: option.modelLabel,
        adapterType: option.adapterType,
        optionId: option.optionId,
      })
      setOpen(false)
    },
    [],
  )

  const handleQuickSetupOpenChange = useCallback((nextOpen: boolean) => {
    setQuickSetup((current) => ({
      ...current,
      open: nextOpen,
    }))
  }, [])

  const handleQuickSetupVerified = useCallback(
    (modelId: string, keyId: string) => {
      const plannerModel = SCRIPT_PLANNER_MODEL_OPTIONS.find(
        (option) => option.modelId === modelId,
      )
      if (!plannerModel) {
        return
      }

      onChange({
        optionId: getPlannerKeyOptionId(keyId),
        plannerProvider: plannerModel.provider,
        apiKeyId: keyId,
      })
    },
    [onChange],
  )

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={t('triggerLabel')}
            aria-expanded={open}
            className={cn(
              'inline-flex h-9 max-w-52 justify-between rounded-xl border-node-panel-inner bg-node-panel-soft px-2.5 text-node-muted shadow-none hover:bg-node-panel-inner hover:text-node-foreground',
              className,
            )}
          >
            {selectedSavedRoute ? (
              <ApiKeyHealthDot status={selectedHealthStatus} />
            ) : (
              <Sparkles className="size-4 text-node-amber" />
            )}
            <span className="truncate text-xs font-medium">
              {isLoading ? tApiKeys('triggerLoading') : selectedLabel}
            </span>
            <ChevronDown
              className={cn(
                'size-3.5 shrink-0 transition-transform',
                open && 'rotate-180',
              )}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          collisionPadding={12}
          className="w-80 overflow-hidden rounded-2xl border-node-panel-inner bg-node-panel/95 p-2 text-node-foreground shadow-node-panel backdrop-blur-xl"
        >
          <div className="max-h-80 overflow-y-auto overscroll-contain pr-1">
            {isLoading ? (
              <div className="rounded-xl px-3 py-2 text-xs text-node-muted">
                {tApiKeys('loading')}
              </div>
            ) : null}

            {savedRoutes.length > 0 && (
              <div className="space-y-1">
                <p className="px-2 py-1 text-2xs font-semibold tracking-nav-dense text-node-muted">
                  {t('configured')}
                </p>
                {savedRoutes.map((option) => {
                  const isSelected = option.apiKeyId === value?.apiKeyId

                  return (
                    <button
                      key={option.optionId}
                      type="button"
                      onClick={() => handleSelectSavedRoute(option)}
                      className={cn(
                        'group flex w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition-colors',
                        isSelected
                          ? 'border-lime-400/35 bg-lime-500/10'
                          : 'border-transparent hover:border-node-panel-inner hover:bg-node-panel-inner',
                      )}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-node-panel-inner text-node-muted transition-colors group-hover:text-node-foreground">
                        <Sparkles className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <ApiKeyHealthDot
                            status={healthMap[option.apiKeyId]}
                          />
                          <span className="truncate text-sm font-semibold text-node-foreground">
                            {option.routeLabel}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-node-muted">
                          {t('savedMeta', {
                            model: option.modelLabel,
                            key: option.maskedKey,
                          })}
                        </span>
                      </span>
                      {isSelected ? (
                        <Check className="size-4 shrink-0 text-lime-200" />
                      ) : null}
                    </button>
                  )
                })}
              </div>
            )}

            <div className={cn('space-y-1', savedRoutes.length > 0 && 'mt-2')}>
              <p className="px-2 py-1 text-2xs font-semibold tracking-nav-dense text-node-muted">
                {t('addKey')}
              </p>
              {lockedRoutes.map((option) => (
                <button
                  key={option.optionId}
                  type="button"
                  onClick={() => handleOpenQuickSetup(option)}
                  className="group flex w-full items-center gap-3 rounded-xl border border-transparent px-2.5 py-2 text-left transition-colors hover:border-node-panel-inner hover:bg-node-panel-inner"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-node-panel-inner text-node-muted transition-colors group-hover:text-node-foreground">
                    <Key className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-node-foreground">
                      {t('configureProvider', {
                        provider: option.modelLabel,
                      })}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-node-muted">
                      {option.providerLabel}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <QuickSetupDialog
        open={quickSetup.open}
        onOpenChange={handleQuickSetupOpenChange}
        modelId={quickSetup.modelId}
        modelLabel={quickSetup.modelLabel}
        adapterType={quickSetup.adapterType}
        optionId={quickSetup.optionId}
        onVerified={handleQuickSetupVerified}
      />
    </>
  )
}
