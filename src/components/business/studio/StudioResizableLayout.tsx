'use client'

import { memo } from 'react'

// ── Studio Flow Layout ──────────────────────────────────────────────
// Single scroll flow: Canvas → Dock → Gallery.
// Scrolling down naturally pushes Canvas & Dock out of view.

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
    <div className="flex-1 min-h-0 overflow-y-auto studio-scroll-area">
      {/* Canvas preview */}
      <div className="px-4 pt-3 pb-1 sm:px-6">{canvas}</div>

      {/* Dock — normal flow, textarea expands downward */}
      <div>{dock}</div>

      {/* Gallery feed — full-width masonry */}
      <div className="px-4 pb-4 sm:px-6">{gallery}</div>
    </div>
  )
})
