'use client'

import { memo } from 'react'

// ── Studio Flow Layout ──────────────────────────────────────────────
// Canvas + Dock fill at least one viewport height (min-h-full + flex).
// Canvas expands (flex-1) to push Dock to the bottom.
// Gallery is optional — Krea-aligned dock no longer renders an inline
// history strip because the new "素材" / Image chip popover already
// surfaces the user's archive on demand.

interface StudioFlowLayoutProps {
  canvas: React.ReactNode
  dock: React.ReactNode
  gallery?: React.ReactNode
}

export const StudioFlowLayout = memo(function StudioFlowLayout({
  canvas,
  dock,
  gallery,
}: StudioFlowLayoutProps) {
  return (
    <div className="flex-1 flex flex-col studio-scroll-area">
      {/* Canvas + Dock: fills the initial viewport. On md (tablet) the
          mobile header + tab bar exist, so reserve 6.5rem; on lg+ (desktop)
          SidebarInset drops all chrome padding and there is no top navbar,
          so fill the full viewport (min-h-svh) — otherwise the reserved band
          falls below the dock as dead space.
          Padding scales up at lg+ so 4K monitors don't run the canvas edge
          flush against the browser chrome. */}
      <div className="flex min-h-0 flex-col md:min-h-[calc(100svh-6.5rem)] lg:min-h-svh">
        {/* Canvas — image stays anchored at the top. On lg+ (desktop) the
            canvas is content-sized (lg:flex-none), so the dock is NOT pushed
            to the viewport bottom: it follows directly beneath the image,
            rising/falling as the image's height changes, and any vertical
            slack collapses below the dock. On md (tablet) the dock is sticky,
            so keep md:flex-1 to hold its bottom position there.
            空态例外：.studio-canvas-slot:has(.studio-empty-state)（globals.css）
            让槽位吃满剩余高度并把起手势内容垂直居中 —— 空态没有"跟随图片"
            的语义，canvas + dock 必须一屏放下。
            画布垂直间距的唯一负责人是这里 —— 空态/结果组件不再自带外边距。 */}
        <div className="studio-canvas-slot px-2 pt-2 pb-1 sm:px-6 sm:pt-4 md:flex-1 lg:flex-none lg:px-8 lg:pt-6">
          {canvas}
        </div>

        {/* Dock — sits at the bottom of the viewport */}
        <div className="shrink-0">{dock}</div>
      </div>

      {/* Gallery — optional natural-flow strip below the fold */}
      {gallery ? (
        <div className="px-2 pb-20 sm:px-6 sm:pb-4 lg:px-8">{gallery}</div>
      ) : null}
    </div>
  )
})
