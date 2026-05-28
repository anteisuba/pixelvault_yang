'use client'

import { useMemo, useState } from 'react'
import { Bot, Check, ChevronDown, Plus, Sparkles } from 'lucide-react'

import { ApiKeyHealthDot } from '@/components/business/ApiKeyHealthDot'
import type { StudioModelOption } from '@/components/business/ModelSelector'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { type LlmCapabilityScope } from '@/constants/llm-capability'
import {
  useLLMRoutePicker,
  type LLMRouteOption,
} from '@/hooks/use-llm-route-picker'
import { cn } from '@/lib/utils'

import { MainModelPicker, routeToStudioOption } from './MainModelPicker'

export type CanvasRouteVariant = 'planner' | 'assistant' | 'media'
export type CanvasRouteMediaModality = 'image' | 'video' | 'audio'

interface CommonProps {
  value: string | null
  onChange: (option: StudioModelOption) => void
  onRequestSetup?: (option: StudioModelOption) => void
  triggerLabel?: string
  noticeDescription?: string
  badge?: { text: string; tone: 'amber' | 'sky' | 'neutral' }
  addKeyLabel?: string
  emptyLabel?: string
  loadingLabel?: string
  /**
   * Optional extra option rendered above the saved-routes list. Used by
   * the assistant variant to expose the "auto route" entry without
   * baking that concept into useLLMRoutePicker. When isSelected is true,
   * this entry takes the selected styling and no saved route shows the
   * check mark.
   */
  topOption?: {
    label: string
    description?: string
    isSelected: boolean
    onSelect: () => void
  }
  className?: string
  disabled?: boolean
}

export type CanvasRoutePickerProps = CommonProps &
  (
    | { variant: 'planner' | 'assistant' }
    | { variant: 'media'; mediaModality: CanvasRouteMediaModality }
  )

/**
 * Picker for Node Canvas route selection. Variants:
 * - planner / assistant — LLM route selection via useLLMRoutePicker(scope)
 * - media — image/video/audio model picker, delegated to MainModelPicker
 *
 * planner and assistant share the same hook backing (T4 useLLMRoutePicker),
 * so changing the LLM_CAPABILITY scope automatically propagates to both
 * (D3 / D5 / IRON RULE — see spec §4.3.6 / §7.2).
 */
export function CanvasRoutePicker(props: CanvasRoutePickerProps) {
  const { variant, ...rest } = props
  if (variant === 'media') {
    const { mediaModality, ...mediaRest } = rest as Extract<
      CanvasRoutePickerProps,
      { variant: 'media' }
    >
    return <MainModelPicker modality={mediaModality} {...mediaRest} />
  }
  return <CanvasRouteLLMPicker scope={variant} {...rest} />
}

interface LLMPickerProps extends CommonProps {
  scope: LlmCapabilityScope
}

function CanvasRouteLLMPicker({
  scope,
  value,
  onChange,
  onRequestSetup,
  triggerLabel,
  noticeDescription,
  badge,
  addKeyLabel = 'Add API Key',
  emptyLabel = 'No routes configured',
  loadingLabel = 'Loading…',
  topOption,
  className,
  disabled,
}: LLMPickerProps) {
  const [open, setOpen] = useState(false)
  const { savedRoutes, lockedRoutes, healthMap } = useLLMRoutePicker(scope)

  const selectedRoute = useMemo(
    () => savedRoutes.find((r) => r.optionId === value),
    [savedRoutes, value],
  )

  const triggerIcon =
    scope === 'planner' ? (
      <Sparkles className="size-4 text-node-amber" />
    ) : (
      <Bot className="size-4 text-node-amber" />
    )

  const badgeToneClass =
    badge?.tone === 'amber'
      ? 'text-amber-500'
      : badge?.tone === 'sky'
        ? 'text-sky-400'
        : 'text-muted-foreground'

  const handleSelect = (route: LLMRouteOption) => {
    onChange(routeToStudioOption(route))
    setOpen(false)
  }

  const handleSelectLocked = (route: LLMRouteOption) => {
    onRequestSetup?.(routeToStudioOption(route))
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-expanded={open}
          aria-label={triggerLabel}
          className={cn(
            'group flex h-11 w-full min-w-0 items-center gap-2 rounded-2xl border border-node-panel-inner bg-node-panel-soft px-3 text-left text-node-muted transition-colors hover:border-node-amber/40 hover:bg-node-panel-inner hover:text-node-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-node-amber/35 data-[state=open]:border-node-amber/70 data-[state=open]:bg-node-panel-inner',
            'disabled:pointer-events-none disabled:opacity-50',
            selectedRoute && 'border-node-amber/70',
            className,
          )}
        >
          <span className="relative flex size-6 shrink-0 items-center justify-center text-node-amber">
            {triggerIcon}
            {selectedRoute?.apiKeyId ? (
              <span className="absolute -right-0.5 top-0 size-1.5 rounded-full ring-1 ring-node-panel">
                <ApiKeyHealthDot status={healthMap[selectedRoute.apiKeyId]} />
              </span>
            ) : null}
          </span>
          <span className="min-w-0 flex-1">
            {triggerLabel && (
              <span className="block truncate text-2xs font-medium leading-3 text-node-muted">
                {triggerLabel}
              </span>
            )}
            <span className="block truncate text-xs font-semibold leading-4 text-node-foreground">
              {topOption?.isSelected
                ? topOption.label
                : (selectedRoute?.label ?? emptyLabel)}
            </span>
          </span>
          <ChevronDown
            className={cn(
              'size-3.5 shrink-0 transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        collisionPadding={12}
        className="w-72 rounded-2xl border-node-panel-inner bg-node-panel/96 p-0 text-node-foreground shadow-node-panel backdrop-blur-xl"
      >
        {(noticeDescription || badge || triggerLabel) && (
          <div className="border-b border-node-panel-inner px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              {triggerLabel && (
                <p className="text-sm font-semibold text-node-foreground">
                  {triggerLabel}
                </p>
              )}
              {badge && (
                <span
                  className={cn(
                    'shrink-0 text-2xs font-semibold',
                    badgeToneClass,
                  )}
                >
                  {badge.text}
                </span>
              )}
            </div>
            {noticeDescription && (
              <p className="mt-1 text-xs leading-5 text-node-muted">
                {noticeDescription}
              </p>
            )}
          </div>
        )}

        <div className="max-h-80 overflow-y-auto overscroll-contain p-2">
          {savedRoutes.length === 0 &&
          lockedRoutes.length === 0 &&
          !topOption ? (
            <div className="rounded-xl px-3 py-2 text-xs text-node-muted">
              {loadingLabel}
            </div>
          ) : null}

          {topOption && (
            <button
              type="button"
              onClick={() => {
                topOption.onSelect()
                setOpen(false)
              }}
              className={cn(
                'group relative mb-1 flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors',
                topOption.isSelected
                  ? 'border-node-amber/25 bg-node-panel-soft'
                  : 'border-transparent bg-node-panel hover:border-node-panel-inner hover:bg-node-panel-inner',
              )}
            >
              {topOption.isSelected && (
                <span className="absolute bottom-3 left-0 top-3 w-1 rounded-r-full bg-node-amber" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-node-foreground">
                  {topOption.label}
                </span>
                {topOption.description && (
                  <span className="mt-0.5 block truncate text-xs text-node-muted">
                    {topOption.description}
                  </span>
                )}
              </span>
              {topOption.isSelected && (
                <Check className="size-4 shrink-0 text-lime-400" />
              )}
            </button>
          )}

          {savedRoutes.length > 0 && (
            <div className="space-y-1">
              {savedRoutes.map((route) => {
                const isSelected =
                  !topOption?.isSelected && route.optionId === value
                return (
                  <button
                    key={route.optionId}
                    type="button"
                    onClick={() => handleSelect(route)}
                    className={cn(
                      'group relative flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors',
                      isSelected
                        ? 'border-node-amber/25 bg-node-panel-soft'
                        : 'border-transparent bg-node-panel hover:border-node-panel-inner hover:bg-node-panel-inner',
                    )}
                  >
                    {isSelected && (
                      <span className="absolute bottom-3 left-0 top-3 w-1 rounded-r-full bg-node-amber" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-node-foreground">
                        {route.keyLabel ?? route.label}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-node-muted">
                        {route.providerLabel}
                        {route.maskedKey ? ` · ${route.maskedKey}` : ''}
                      </span>
                    </span>
                    {isSelected && (
                      <Check className="size-4 shrink-0 text-lime-400" />
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {lockedRoutes.length > 0 && (
            <div
              className={cn(
                'border-node-panel-inner pt-2',
                savedRoutes.length > 0 && 'mt-2 border-t',
              )}
            >
              <p className="px-2 py-1 text-2xs font-semibold text-node-muted">
                {addKeyLabel}
              </p>
              <div className="space-y-1">
                {lockedRoutes.map((route) => (
                  <button
                    key={route.optionId}
                    type="button"
                    onClick={() => handleSelectLocked(route)}
                    className="group flex min-h-11 w-full items-center gap-3 rounded-xl border border-node-panel-inner bg-node-panel-soft px-3 py-2 text-left transition-colors hover:border-node-amber/35 hover:bg-node-panel-inner"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-node-panel-inner text-node-foreground transition-colors group-hover:text-node-amber">
                      <Plus className="size-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-node-foreground">
                        {route.label}
                      </span>
                      <span className="block truncate text-2xs text-node-muted">
                        {route.providerLabel}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
