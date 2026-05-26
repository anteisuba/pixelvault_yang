'use client'

import { useState, type ComponentType } from 'react'
import {
  Hand,
  MousePointer2,
  Redo2,
  Scissors,
  Undo2,
  Waypoints,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  NODE_STUDIO_CANVAS,
  NODE_STUDIO_PLACEHOLDER_TOAST,
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

export function CanvasBottomDock() {
  const t = useTranslations('StudioNode')
  const [activeMode, setActiveMode] = useState<NodeStudioToolMode>('pointer')

  const showPlaceholderToast = () => {
    toast.info(t('toasts.notImplemented'), {
      duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
      position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
    })
  }

  const selectMode = (mode: NodeStudioToolMode) => {
    setActiveMode(mode)
    showPlaceholderToast()
  }

  return (
    <TooltipProvider delayDuration={250}>
      {/* Hidden below md: every tool here is a placeholder that just toasts
          "not implemented", and the dock collides with the Assistant bottom-
          sheet + AppSidebar floating buttons on phone-portrait. md+ restores
          the centered toolbar where it has room to breathe. */}
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
                    onClick={() => selectMode(mode)}
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

        <span className="min-w-12 rounded-xl bg-node-panel-soft px-2 py-1 text-center text-xs font-semibold text-node-foreground">
          {t('bottomDock.zoomLevel', {
            percent: NODE_STUDIO_CANVAS.defaultZoomPercent,
          })}
        </span>

        <div className="h-6 w-px bg-node-panel-inner" aria-hidden />

        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t('bottomDock.undo')}
                onClick={showPlaceholderToast}
                className="rounded-2xl text-node-subtle hover:bg-node-panel-inner hover:text-node-foreground"
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
                onClick={showPlaceholderToast}
                className="rounded-2xl text-node-subtle hover:bg-node-panel-inner hover:text-node-foreground"
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
