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
  assistantExpanded: boolean
  onModeChange(mode: NodeStudioToolMode): void
  onUndo(): void
  onRedo(): void
}

/**
 * The tool pill itself — no self-positioning. S5b B0 merges this into the
 * same bottom row as the Cast dock handle ("紧贴工具条右侧同底座"), so the
 * shared `absolute bottom-*` + assistant-dock inset math now lives ONCE in
 * `StudioNodeWorkbench`'s wrapper instead of being duplicated in every dock
 * that sits on that row.
 */
export function CanvasBottomDock({
  activeMode,
  canUndo,
  canRedo,
  assistantExpanded,
  onModeChange,
  onUndo,
  onRedo,
}: CanvasBottomDockProps) {
  const t = useTranslations('StudioNode')

  return (
    <TooltipProvider delayDuration={250}>
      <div className="pointer-events-auto hidden w-fit items-center gap-1.5 rounded-2xl border border-node-panel-inner/70 bg-node-panel/95 px-1.5 py-1.5 shadow-node-panel backdrop-blur-xl md:flex">
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
                      'rounded-xl text-node-muted hover:bg-node-panel-inner hover:text-node-foreground',
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

        <div
          className={cn(
            'flex min-w-28 flex-col rounded-xl bg-node-panel-soft px-2 py-0.5 text-center',
            assistantExpanded && 'hidden xl:flex',
          )}
        >
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
                className="rounded-xl text-node-subtle hover:bg-node-panel-inner hover:text-node-foreground disabled:opacity-40"
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
                className="rounded-xl text-node-subtle hover:bg-node-panel-inner hover:text-node-foreground disabled:opacity-40"
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
