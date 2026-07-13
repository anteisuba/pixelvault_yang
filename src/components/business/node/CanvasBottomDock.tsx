'use client'

import type { ComponentType } from 'react'
import {
  Focus,
  Hand,
  MousePointer2,
  Redo2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useReactFlow, useViewport } from '@xyflow/react'

import {
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
  (typeof NODE_STUDIO_TOOL_MODES)[number],
  ComponentType<{ className?: string }>
> = {
  pointer: MousePointer2,
  hand: Hand,
}

interface CanvasBottomDockProps {
  activeMode: NodeStudioToolMode
  canUndo: boolean
  canRedo: boolean
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
  onModeChange,
  onUndo,
  onRedo,
}: CanvasBottomDockProps) {
  const t = useTranslations('StudioNode')
  const { fitView, zoomIn, zoomOut } = useReactFlow()
  const { zoom } = useViewport()
  const zoomPercent = Math.round(zoom * 100)

  return (
    <TooltipProvider delayDuration={250}>
      <div className="pointer-events-auto hidden w-fit items-center gap-1 rounded-xl border border-node-panel-inner bg-node-panel px-1.5 py-1.5 shadow-sm md:flex">
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

        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t('bottomDock.zoomOut')}
                onClick={() => void zoomOut({ duration: 160 })}
                className="rounded-lg text-node-muted hover:bg-node-panel-inner hover:text-node-foreground"
              >
                <ZoomOut className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {t('bottomDock.zoomOut')}
            </TooltipContent>
          </Tooltip>
          <button
            type="button"
            onClick={() => void fitView({ padding: 0.16, duration: 220 })}
            aria-label={t('bottomDock.fitView')}
            title={t('bottomDock.fitView')}
            className="min-w-12 rounded-lg px-1.5 py-1 text-center text-xs font-semibold tabular-nums text-node-foreground transition-colors hover:bg-node-panel-inner"
          >
            {t('bottomDock.zoomLevel', { percent: zoomPercent })}
          </button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t('bottomDock.zoomIn')}
                onClick={() => void zoomIn({ duration: 160 })}
                className="rounded-lg text-node-muted hover:bg-node-panel-inner hover:text-node-foreground"
              >
                <ZoomIn className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{t('bottomDock.zoomIn')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={t('bottomDock.fitView')}
                onClick={() => void fitView({ padding: 0.16, duration: 220 })}
                className="rounded-lg text-node-muted hover:bg-node-panel-inner hover:text-node-foreground"
              >
                <Focus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {t('bottomDock.fitView')}
            </TooltipContent>
          </Tooltip>
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
