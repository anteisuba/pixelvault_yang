'use client'

import type { ComponentType } from 'react'
import {
  Hand,
  MousePointer2,
  Redo2,
  Scissors,
  Undo2,
  Waypoints,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  NODE_STUDIO_CANVAS,
  NODE_STUDIO_TOOL_MODES,
  type NodeStudioToolMode,
} from '@/constants/node-studio'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const TOOL_MODE_ICONS: Record<
  NodeStudioToolMode,
  ComponentType<{ className?: string }>
> = {
  pointer: MousePointer2,
  hand: Hand,
  connect: Waypoints,
  cut: Scissors,
}

interface CanvasBottomDockProps {
  activeMode: NodeStudioToolMode
  canUndo: boolean
  canRedo: boolean
  onModeChange(mode: NodeStudioToolMode): void
  onUndo(): void
  onRedo(): void
}

export function CanvasBottomDock({
  activeMode,
  canUndo,
  canRedo,
  onModeChange,
  onUndo,
  onRedo,
}: CanvasBottomDockProps) {
  const t = useTranslations('StudioNode')

  return (
    <TooltipProvider delayDuration={250}>
      <div className="pointer-events-auto absolute bottom-4 left-1/2 hidden -translate-x-1/2 items-center gap-2 rounded-3xl border border-node-panel-inner/70 bg-node-panel/95 p-2 shadow-node-panel backdrop-blur-xl md:bottom-6 md:flex">
        <div className="flex items-center gap-1">
          {NODE_STUDIO_TOOL_MODES.map((mode) => {
            const Icon = TOOL_MODE_ICONS[mode]
            const selected = activeMode === mode
            return (
              <Tooltip key={mode}>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={t(`bottomDock.${mode}`)}
                    aria-pressed={selected}
                    onClick={() => onModeChange(mode)}
                    className={cn(
                      'rounded-2xl text-node-muted hover:bg-node-panel-inner hover:text-node-foreground',
                      selected &&
                        'bg-node-foreground text-node-canvas hover:bg-node-foreground hover:text-node-canvas',
                    )}
                  >
                    <Icon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {t(`bottomDock.${mode}`)}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>

        <div className="h-6 w-px bg-node-panel-inner" aria-hidden />

        <div className="flex min-w-32 flex-col rounded-xl bg-node-panel-soft px-2 py-1 text-center">
          <span className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
            {t('bottomDock.modeLabel', {
              percent: NODE_STUDIO_CANVAS.defaultZoomPercent,
            })}
          </span>
          <span className="text-xs font-semibold text-node-foreground">
            {t(`bottomDock.modeStatus.${activeMode}`)}
          </span>
        </div>

        <div className="h-6 w-px bg-node-panel-inner" aria-hidden />

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t('bottomDock.undo')}
                onClick={onUndo}
                disabled={!canUndo}
                className="rounded-2xl text-node-subtle hover:bg-node-panel-inner hover:text-node-foreground disabled:opacity-40"
              >
                <Undo2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{t('bottomDock.undo')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t('bottomDock.redo')}
                onClick={onRedo}
                disabled={!canRedo}
                className="rounded-2xl text-node-subtle hover:bg-node-panel-inner hover:text-node-foreground disabled:opacity-40"
              >
                <Redo2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{t('bottomDock.redo')}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  )
}
