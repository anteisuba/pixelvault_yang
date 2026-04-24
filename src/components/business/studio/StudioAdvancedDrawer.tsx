'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { KeyRound, SlidersHorizontal } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { AdvancedSettings } from '@/components/business/AdvancedSettings'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  useStudioData,
  useStudioForm,
  useStudioGen,
  type PanelName,
} from '@/contexts/studio-context'
import { useImageModelOptions } from '@/hooks/use-image-model-options'
import { cn } from '@/lib/utils'

import { StudioQuickRouteSelector } from './StudioQuickRouteSelector'

interface StudioAdvancedDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface DrawerSectionProps {
  title: string
  description?: string
  children: ReactNode
  className?: string
}

function DrawerSection({
  title,
  description,
  children,
  className,
}: DrawerSectionProps) {
  return (
    <section className={cn('border-t border-border/60 pt-5', className)}>
      <div className="mb-3">
        <h3 className="font-display text-sm font-semibold text-foreground">
          {title}
        </h3>
        {description ? (
          <p className="mt-1 font-serif text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  )
}

export function StudioAdvancedDrawer({
  open,
  onOpenChange,
}: StudioAdvancedDrawerProps) {
  const { state, dispatch } = useStudioForm()
  const { styles, imageUpload } = useStudioData()
  const { isGenerating } = useStudioGen()
  const { selectedModel } = useImageModelOptions()
  const tAdvanced = useTranslations('StudioAdvanced')
  const tV3 = useTranslations('StudioV3')
  const tV2 = useTranslations('StudioV2')
  const [side, setSide] = useState<'right' | 'bottom'>('right')

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return
    }

    const query = window.matchMedia('(max-width: 767px)')
    const syncSide = () => setSide(query.matches ? 'bottom' : 'right')

    syncSide()
    query.addEventListener('change', syncSide)
    return () => query.removeEventListener('change', syncSide)
  }, [])

  const selectedStyleCard = styles.activeCard
  const adapterType =
    state.workflowMode === 'quick' && selectedModel
      ? selectedModel.adapterType
      : ((selectedStyleCard?.adapterType as AI_ADAPTER_TYPES) ??
        AI_ADAPTER_TYPES.FAL)
  const modelId =
    state.workflowMode === 'quick' && selectedModel
      ? selectedModel.modelId
      : (selectedStyleCard?.modelId ?? undefined)
  const hasProviderContext = Boolean(
    selectedModel?.adapterType || selectedStyleCard?.adapterType,
  )

  const providerPanelActions = useMemo(() => {
    const actions: Array<{ panel: PanelName; label: string }> = []

    if (state.outputType === 'video') {
      actions.push({
        panel: 'videoParams',
        label: tAdvanced('providerVideoSettings'),
      })
    }

    if (state.outputType === 'audio') {
      actions.push(
        {
          panel: 'voiceSelector',
          label: tAdvanced('providerVoiceSelector'),
        },
        {
          panel: 'voiceTrainer',
          label: tAdvanced('providerVoiceTrainer'),
        },
      )
    }

    return actions
  }, [state.outputType, tAdvanced])

  const openPanel = (panel: PanelName) => {
    dispatch({ type: 'OPEN_PANEL', payload: panel })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className={cn(
          'flex w-full flex-col overflow-hidden bg-background font-display sm:max-w-md',
          side === 'bottom' && 'max-h-screen rounded-t-2xl',
        )}
      >
        <SheetHeader className="border-b border-border/60 px-5 py-5">
          <SheetTitle className="font-display text-xl">
            {tAdvanced('title')}
          </SheetTitle>
          <SheetDescription className="font-serif leading-6">
            {tAdvanced('description')}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 pb-6">
          <DrawerSection
            title={tAdvanced('sections.mode')}
            description={tAdvanced('modeDescription')}
            className="border-t-0 pt-1"
          >
            <div
              role="tablist"
              aria-label={tV3('workflowModeLabel')}
              className="inline-flex w-full rounded-lg border border-border/60 bg-background/70 p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={state.workflowMode === 'quick'}
                onClick={() =>
                  dispatch({ type: 'SET_WORKFLOW_MODE', payload: 'quick' })
                }
                className={cn(
                  'flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                  state.workflowMode === 'quick'
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
                )}
              >
                {tV3('quickMode')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={state.workflowMode === 'card'}
                onClick={() =>
                  dispatch({ type: 'SET_WORKFLOW_MODE', payload: 'card' })
                }
                className={cn(
                  'flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                  state.workflowMode === 'card'
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground',
                )}
              >
                {tV3('cardMode')}
              </button>
            </div>
          </DrawerSection>

          <DrawerSection
            title={tAdvanced('sections.routeModel')}
            description={tAdvanced('routeModelDescription')}
          >
            <StudioQuickRouteSelector managementMode="inline" />
            <button
              type="button"
              onClick={() => openPanel('modelSelector')}
              className="mt-3 flex w-full items-center gap-2 rounded-lg border border-border/60 bg-background/70 px-3 py-3 text-left text-sm font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              <KeyRound className="size-4 text-primary" />
              {tAdvanced('openModelSelector')}
            </button>
          </DrawerSection>

          <DrawerSection
            title={tAdvanced('sections.provider')}
            description={tAdvanced('providerDescription')}
          >
            {state.outputType === 'image' ? (
              hasProviderContext ? (
                <AdvancedSettings
                  adapterType={adapterType}
                  modelId={modelId}
                  params={state.advancedParams}
                  onChange={(params) =>
                    dispatch({ type: 'SET_ADVANCED_PARAMS', payload: params })
                  }
                  hasReferenceImage={imageUpload.referenceImages.length > 0}
                  disabled={isGenerating}
                />
              ) : (
                <p className="rounded-lg border border-dashed border-border/60 bg-background/60 px-3 py-4 text-center font-serif text-xs text-muted-foreground">
                  {tV2('selectModelFirst')}
                </p>
              )
            ) : (
              <div className="grid gap-2">
                {providerPanelActions.map((action) => (
                  <button
                    key={action.panel}
                    type="button"
                    onClick={() => openPanel(action.panel)}
                    className="flex items-center justify-between rounded-lg border border-border/60 bg-background/70 px-3 py-3 text-left text-sm font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5"
                  >
                    <span>{action.label}</span>
                    <SlidersHorizontal className="size-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </DrawerSection>
        </div>
      </SheetContent>
    </Sheet>
  )
}
