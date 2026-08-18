'use client'

import { memo } from 'react'

interface StudioWorkbenchLayoutProps {
  params: React.ReactNode
  stage: React.ReactNode
}

/**
 * 工作台布局 —— **横向**：左侧常驻参数栏 + 右侧结果区。
 *
 * 与 `StudioFlowLayout`（纵向 canvas + 底部 dock）是并列的两种外壳，不是替代：
 * 图片模态走这套，视频 / 音频仍走 FlowLayout，直到它们各自的参数也设计完
 * （owner 2026-08-14：先只换图片模态，端到端打穿一条再说）。
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
}: StudioWorkbenchLayoutProps) {
  return (
    // 移动端退回纵向（参数在上、结果在下）：288px 的常驻栏在手机上会把结果区
    // 压到没有。断点用 lg（1024）与 `useIsMobile` 对齐 —— 平板 768–1023 那段
    // 若用 md 会出现「列位按 768 预留但内容到 1024 才渲染」的空沟。
    <div className="flex min-h-0 flex-1 flex-col lg:h-svh lg:flex-row">
      <div className="studio-param-panel flex shrink-0 flex-col gap-3 border-b border-border/60 p-3 lg:w-72 lg:overflow-y-auto lg:border-r lg:border-b-0 lg:p-4">
        {params}
      </div>
      {/* ⚠ 结果区要把高度传给 StudioCanvas，否则空态的 `grow + justify-center`
          没有可撑的高度就贴顶。旧骨架靠 globals.css 的
          `.studio-canvas-slot:has(.studio-empty-state)` 做这件事，那个类只在
          FlowLayout 里；这里直接让 `.studio-canvas` 成为撑满的 flex 列。 */}
      <div className="studio-workbench-stage studio-scroll-area flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-3 lg:p-6">
        {stage}
      </div>
    </div>
  )
})
