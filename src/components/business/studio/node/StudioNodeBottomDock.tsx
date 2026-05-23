'use client'

import { useReactFlow, useStore } from '@xyflow/react'
import {
  Hand,
  MousePointer2,
  Plus,
  Redo2,
  Scissors,
  Spline,
  Undo2,
  Minus,
  type LucideIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type StudioNodeToolMode = 'pointer' | 'hand' | 'connect' | 'cut'

interface StudioNodeBottomDockProps {
  toolMode: StudioNodeToolMode
  onToolModeChange: (mode: StudioNodeToolMode) => void
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
  className?: string
}

export function StudioNodeBottomDock({
  toolMode,
  onToolModeChange,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  className,
}: StudioNodeBottomDockProps) {
  const t = useTranslations('StudioNode.bottomDock')
  const { zoomIn, zoomOut } = useReactFlow()
  const zoom = useStore((state) => state.transform[2])
  const zoomPercent = Math.round(zoom * 100)

  const handleZoomIn = useCallback(() => {
    zoomIn({ duration: 200 })
  }, [zoomIn])

  const handleZoomOut = useCallback(() => {
    zoomOut({ duration: 200 })
  }, [zoomOut])

  return (
    <div
      className={cn(
        'pointer-events-auto absolute bottom-5 left-1/2 z-30 flex h-[50px] -translate-x-1/2 items-center gap-1 rounded-[22px] border border-white/[0.08] bg-[#181716] p-2 shadow-[0_20px_60px_rgba(0,0,0,0.5)]',
        className,
      )}
    >
      <DockButton
        icon={MousePointer2}
        label={t('pointer')}
        active={toolMode === 'pointer'}
        onClick={() => onToolModeChange('pointer')}
      />
      <DockButton
        icon={Hand}
        label={t('hand')}
        active={toolMode === 'hand'}
        onClick={() => onToolModeChange('hand')}
      />
      <DockButton
        icon={Spline}
        label={t('connect')}
        active={toolMode === 'connect'}
        onClick={() => onToolModeChange('connect')}
      />
      <DockButton
        icon={Scissors}
        label={t('cut')}
        active={toolMode === 'cut'}
        onClick={() => onToolModeChange('cut')}
      />
      <DockDivider />
      <DockButton icon={Minus} label={t('zoomOut')} onClick={handleZoomOut} />
      <DockChip
        label={t('zoomLevel', { percent: zoomPercent })}
        title={t('zoomLevel', { percent: zoomPercent })}
      />
      <DockButton icon={Plus} label={t('zoomIn')} onClick={handleZoomIn} />
      <DockDivider />
      <DockButton
        icon={Undo2}
        label={t('undo')}
        onClick={onUndo}
        disabled={!canUndo || !onUndo}
      />
      <DockButton
        icon={Redo2}
        label={t('redo')}
        onClick={onRedo}
        disabled={!canRedo || !onRedo}
      />
    </div>
  )
}

interface DockButtonProps {
  icon: LucideIcon
  label: string
  onClick?: () => void
  active?: boolean
  disabled?: boolean
}

function DockButton({
  icon: Icon,
  label,
  onClick,
  active,
  disabled,
}: DockButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'grid size-[34px] place-items-center rounded-xl transition-colors',
        active
          ? 'bg-[#f4f1ea] text-[#0d0c0b] hover:bg-white'
          : 'bg-[#22211f] text-foreground/85 hover:bg-[#2d2b28] hover:text-foreground',
        disabled && 'cursor-not-allowed opacity-40 hover:bg-[#22211f]',
      )}
    >
      <Icon className="size-4" />
    </button>
  )
}

function DockChip({ label, title }: { label: ReactNode; title: string }) {
  return (
    <span
      title={title}
      className="grid h-[34px] min-w-[52px] place-items-center rounded-xl bg-[#22211f] px-2 font-mono text-[11px] font-semibold tabular-nums text-foreground/85"
    >
      {label}
    </span>
  )
}

function DockDivider() {
  return <span aria-hidden className="mx-0.5 h-5 w-px bg-white/[0.06]" />
}
