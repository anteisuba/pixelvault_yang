'use client'

import { memo } from 'react'

import { STUDIO_MOBILE_STAGE_CLASS } from '@/constants/studio-mobile'
import { cn } from '@/lib/utils'

interface StudioWorkbenchLayoutProps {
  /**
   * 左侧常驻参数栏。**`null` = 这一屏没有参数栏**（移动端画布优先形态），
   * 那一列整个不进 DOM —— 不是 CSS 隐藏：`StudioPromptArea` 里那颗
   * `useStudioGenerateAction` 带着 `REQUEST_GENERATE` 的执行端副作用，
   * 与底部 composer 同时挂载会让一次请求发两遍。
   */
  params: React.ReactNode
  stage: React.ReactNode
  /**
   * 固定在视口底部的移动端 composer。非空时舞台按 composer 高度 + 键盘安全区
   * 留出底部内边距（`.studio-mobile-stage`，几何在 globals.css）。
   */
  composer?: React.ReactNode
}

/**
 * 工作台布局 —— **横向**：左侧常驻参数栏 + 右侧结果区。
 *
 * 图片 / 视频 / 音频**三个模态共用这一套**（切片 A，owner 2026-08-23）。此前
 * 只有图片走它，视频 / 音频还留在 `StudioFlowLayout`（纵向 canvas + 底部 dock）
 * 上；那条路已整条退役，不留兼容层。栏位差异归 `StudioPromptArea` 按
 * `outputType` 自己分，这一层对模态无感知。
 *
 * 分工沿用画布 07-31 那条已验证的分界线：
 * **参数回答「下一版长什么样」，动作回答「我现在要做什么」。**
 * 所以左栏只放参数（提示词 / 模型 / 规格 / 生成），不放动作条 —— 结果区上方
 * 不再有横带，每张图自己报状态（生成中 / 失败可单张重试），进度不另设读数。
 *
 * ⚠ 助手不在这里：它是 `StudioAssistantDock` 的 fixed 浮层，覆盖而不挤压
 * （owner 2026-08-14 拍板）。这套布局对它无感知。
 */
export const StudioWorkbenchLayout = memo(function StudioWorkbenchLayout({
  params,
  stage,
  composer,
}: StudioWorkbenchLayoutProps) {
  return (
    // 移动端退回纵向（参数在上、结果在下）：288px 的常驻栏在手机上会把结果区
    // 压到没有。断点用 lg（1024）与 `useIsMobile` 对齐 —— 平板 768–1023 那段
    // 若用 md 会出现「列位按 768 预留但内容到 1024 才渲染」的空沟。
    // ⚠ `lg:flex-none` 不是装饰：本组件是 `.studio-layout-v2`（column flex，
    // `min-height:100svh` 无上限）的子项，只写 `flex-1` 会把 flex-basis 定成 0，
    // **`h-svh` 就被忽略**，高度反过来由内容决定 —— 于是外壳跟着内容一起长，
    // 下面那条 `overflow-y-auto` 永远触发不了，滚的是整页。
    // 2026-08-23 真机实测：编辑态下这一层量到 1976px（视口 911）。
    <div className="flex min-h-0 flex-1 flex-col lg:h-svh lg:flex-none lg:flex-row">
      {params ? (
        <div className="studio-param-panel flex shrink-0 flex-col gap-3 border-b border-border/60 p-3 lg:w-72 lg:overflow-y-auto lg:border-r lg:border-b-0 lg:p-4">
          {params}
        </div>
      ) : null}
      {/* ⚠ 结果区要把高度传给 StudioCanvas，否则空态的 `grow + justify-center`
          没有可撑的高度就贴顶。globals.css 里
          `.studio-workbench-stage:has(.studio-empty-state)` 负责把
          `.studio-canvas` 撑成满高的 flex 列。 */}
      <div
        className={cn(
          'studio-workbench-stage studio-scroll-area flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-3 lg:p-6',
          composer && STUDIO_MOBILE_STAGE_CLASS,
        )}
      >
        {stage}
      </div>
      {composer}
    </div>
  )
})
