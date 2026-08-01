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
  /**
   * 包 6 片 2：审阅模式开着。落在 stage 上（`.domain-canvas` 的作用域根），
   * canvas.css 的「非待审弱化」规则用它当总开关 —— 弱化必须能覆盖整张画布的节点，
   * 所以开关只能挂在它们共同的祖先上。
   */
  reviewMode?: boolean
}

/**
 * The single owner of canvas/assistant geometry. The assistant floats as an
 * overlay at every breakpoint now (2026-07-27, assistant-shell.md §1 推翻
 * 节: "覆盖，不挤压") — desktop gets a four-side-inset floating card, mobile
 * keeps the full-bleed bottom sheet. `.stage` is never resized by the
 * assistant's open/closed state; only the rail's own box changes.
 */
export function CanvasWorkspaceLayout({
  assistantMode,
  stageRef,
  assistant,
  children,
  stageStyle,
  reviewMode,
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
        data-review-mode={reviewMode ? 'true' : undefined}
        style={stageStyle}
        className={cn(
          // S0：画布域皮肤 v0.2 的作用域根。
          'domain-canvas',
          styles.stage,
          '@container relative isolate min-h-0 min-w-0 overflow-hidden bg-[var(--canvas-surface,var(--node-canvas))]',
        )}
      >
        {children}
      </div>
      {/* v0.2（2026-07-27，owner 纠正+门禁复核）：助手 rail 现在也挂
          .domain-canvas —— 原注释「只包 stage，不包助手 rail」的前提是助手
          dock 仍是深色面板，圈进来才会让它的原生控件被 color-scheme:light
          带偏。owner 拍板画布助手表面显式改白后，那个前提不再成立：这条
          scope 类本身只定义 --canvas-* 变量 + color-scheme（不带任何直接
          background/color），对 rail 零副作用，只是让
          StudioNodeAssistantDock.tsx 消费得到 --canvas-*（同 CastDock 那一
          套），并让它的原生滚动条/表单控件正确按浅色渲染。真机验证过：
          aside[role=complementary] 的 backgroundColor 翻成 --canvas-card-bg
          （见任务报告），LoRA/Studio 两个 dock 不挂这个 rail、不受影响。 */}
      {/* 浮动卡改造（2026-07-27，施工基准 assistant-shell.md §1 推翻节）：
          desktop 档从「grid 里的第二列」改成 position:absolute 浮层——
          absolute 从 mobile 起就有（下面 inset-0），这里只在 lg: 把它从
          贴边满铺（inset-0）收成四边留白的卡：top/right/bottom 各 16px
          （Tailwind 标准刻度 `4` = 1rem，非 arbitrary value），left 留 auto
          让宽度（.module.css 的 --canvas-assistant-width，随
          data-assistant-mode 变）决定卡的左边界。.stage 不读这个变量、也
          不再被 grid 列挤——不管助手开合，它的宽高恒为 .workspace 的
          100%，节点屏幕坐标因此不会因为助手开合而改变（验收用
          getBoundingClientRect 前后比对，见任务报告）。
          z-index：不新增 lg: 覆盖，让 mobile 起就有的 z-20（下面）原样延续
          到桌面——globals.css 明确写了 --z-index-canvas-* 那套 0–60 阶梯是
          "domain-scoped，不外泄通用页"，L0-L6 全部落在 .stage 自己的
          isolate 边界**内部**才有意义（该文件 §L0-L6 注释原话），rail 是
          .stage 的外部兄弟，不该借它的号码。真正起作用的是 CSS 规则本身：
          .stage 是 position:relative 且 z-index:auto，rail 只要有任意
          显式 z-index（这里复用已有的 20）就稳赢 auto，与 .stage 内部盖到
          第几层无关——.stage 的 isolate 把内部 z-canvas-chrome(40) 等封在
          自己的层叠上下文里出不来，从外面看 .stage 整体只算一层。 */}
      <div
        data-testid="canvas-assistant-rail"
        className={cn(
          'domain-canvas pointer-events-none absolute inset-0 z-20 min-h-0 min-w-0',
          'lg:pointer-events-auto lg:left-auto lg:top-4 lg:right-4 lg:bottom-4',
          styles.rail,
        )}
      >
        {assistant}
      </div>
    </div>
  )
}
