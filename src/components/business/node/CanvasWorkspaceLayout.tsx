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
          // S0：画布域皮肤 v0.2 的作用域根。**只包 stage，不包助手 rail** ——
          // .domain-canvas 声明 color-scheme:light（画布域是浅色档，而 app 全局
          // 是 <html class="dark">），若把仍为深色面板的助手 dock 也圈进来，它的
          // 原生滚动条/输入控件会按浅色渲染（memory reference-dark-color-scheme
          // 的反向）。S0 阶段本作用域零消费者，画面不变。
          'domain-canvas',
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
