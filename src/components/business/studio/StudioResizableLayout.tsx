'use client'

import { memo } from 'react'

// ── Studio Flow Layout ──────────────────────────────────────────────
// Canvas + Dock fill at least one viewport height (min-h-full + flex).
// Canvas expands (flex-1) to push Dock to the bottom.
// Gallery lives below the fold — scroll to reveal.

interface StudioFlowLayoutProps {
  canvas: React.ReactNode
  dock: React.ReactNode
  gallery: React.ReactNode
}

export const StudioFlowLayout = memo(function StudioFlowLayout({
  canvas,
  dock,
  gallery,
}: StudioFlowLayoutProps) {
  return (
    <div className="flex-1 flex flex-col studio-scroll-area">
      {/* Canvas + Dock: fills the initial viewport (minus navbar + topbar) */}
      <div className="min-h-[calc(100vh-6.5rem)] flex flex-col">
        {/* Canvas — flex-1 pushes dock to the bottom */}
        <div className="flex-1 px-4 pt-3 pb-1 sm:px-6">{canvas}</div>

        {/* Dock — sits at the bottom of the viewport */}
        <div className="shrink-0">{dock}</div>
      </div>

      {/* Gallery — natural page flow, scroll down to reveal */}
      <div className="px-4 pb-4 sm:px-6">{gallery}</div>
    </div>
  )
})
