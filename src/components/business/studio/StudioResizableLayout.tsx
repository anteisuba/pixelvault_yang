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
      {/* Canvas + Dock: fills the initial viewport (minus navbar + topbar).
          Padding scales up at lg+ so 4K monitors don't run the canvas edge
          flush against the browser chrome. */}
      <div className="min-h-[calc(100vh-6.5rem)] flex flex-col">
        {/* Canvas — flex-1 pushes dock to the bottom */}
        <div className="flex-1 px-2 pt-2 pb-1 sm:px-6 sm:pt-3 lg:px-8">
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
