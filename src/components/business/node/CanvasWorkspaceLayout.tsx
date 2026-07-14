'use client'

import type { CSSProperties, ReactNode, RefObject } from 'react'

import { cn } from '@/lib/utils'

import styles from './CanvasWorkspaceLayout.module.css'

export type CanvasAssistantMode = 'closed' | 'chat' | 'script'

interface CanvasWorkspaceLayoutProps {
  assistantMode: CanvasAssistantMode
  stageRef: RefObject<HTMLDivElement | null>
  assistant: ReactNode
  children: ReactNode
  /**
   * Project canvas appearance tokens (`--canvas-surface`, `--canvas-grid-dot`)
   * and the solid stage fill. Must be on the stage so React Flow's Background
   * inherits the same surface the wallpaper layer paints.
   */
  stageStyle?: CSSProperties
}

/**
 * The single owner of canvas/assistant geometry. Desktop gets a real second
 * column; tablet and mobile keep the assistant as an overlay over the stage.
 */
export function CanvasWorkspaceLayout({
  assistantMode,
  stageRef,
  assistant,
  children,
  stageStyle,
}: CanvasWorkspaceLayoutProps) {
  return (
    <div
      data-testid="canvas-workspace-layout"
      data-assistant-mode={assistantMode}
      className={styles.workspace}
    >
      <div
        ref={stageRef}
        data-testid="canvas-stage"
        style={stageStyle}
        className={cn(
          styles.stage,
          '@container relative isolate min-h-0 min-w-0 overflow-hidden bg-[var(--canvas-surface,var(--node-canvas))]',
        )}
      >
        {children}
      </div>
      <div
        data-testid="canvas-assistant-rail"
        className="pointer-events-none absolute inset-0 z-20 min-h-0 min-w-0 lg:relative lg:inset-auto lg:z-auto lg:pointer-events-auto"
      >
        {assistant}
      </div>
    </div>
  )
}
