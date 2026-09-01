'use client'

import { Skeleton } from '@/components/ui/skeleton'

/**
 * Suspense fallback for `<StudioNodeCanvas />` (StudioNodeWorkbench.tsx) —
 * `StudioNodeCanvas` reads `useSearchParams()`, which suspends this boundary
 * on every hard navigation/refresh. The fallback used to be `null`, so the
 * whole canvas start-up painted nothing for a stretch (owner-reported "先是
 * 空页面才出现项目页面", measured ~5.1s locally) while every other top-level
 * route already ships a `loading.tsx` skeleton — canvas was the one gap.
 * `studio/loading.tsx` (the *server* Suspense boundary for the route itself)
 * is unrelated and untouched — this is the client-side `useSearchParams()`
 * boundary one level in.
 *
 * ⚠ Scope trap (same one as the assistant-rail fix landed in this same
 * round): this renders BEFORE `canvas-stage` (CanvasWorkspaceLayout.tsx)
 * ever mounts, so there is no ambient `.domain-canvas` ancestor to inherit
 * `--canvas-*` from yet. The root below carries `.domain-canvas` itself —
 * otherwise `--canvas-bg` resolves to nothing, and `--canvas-surface` at
 * `:root` (canvas.css top-of-file block, `#14120f` — the pre-v0.2 dark
 * default `CanvasSurface.tsx` overrides at runtime once the real stage
 * mounts) has nothing shadowing it, painting a black flash instead of a
 * light one before the real stage takes over.
 *
 * Restrained on purpose (owner 2026-07-27): this lives a few seconds, not a
 * showcase — light surface + the same dot grid React Flow's own
 * `Background variant="dots"` renders + a few generic card-shaped
 * `Skeleton` blocks. No logo, no copy, no progress bar, no new colors
 * (reuses --canvas-bg / --canvas-dot / --canvas-dot-gap / --canvas-fill-
 * control, all already defined in canvas.css's `.domain-canvas` block —
 * canvas-skin.md §0.5 rule 6 "<2% chroma pixels" still
 * applies to this screen too, so the skeleton blocks stay neutral gray, not
 * accent-colored).
 */
export function CanvasStartupSkeleton() {
  return (
    <div
      data-testid="canvas-startup-skeleton"
      className="domain-canvas canvas-startup-skeleton absolute inset-0 overflow-hidden"
      style={{
        background: 'var(--canvas-bg)',
        backgroundImage:
          'radial-gradient(circle, var(--canvas-dot) 1px, transparent 1px)',
        backgroundSize: 'var(--canvas-dot-gap) var(--canvas-dot-gap)',
      }}
    >
      <div className="flex h-full items-center justify-center gap-8 p-12">
        <Skeleton className="canvas-startup-skeleton-block h-36 w-64 shrink-0 rounded-lg" />
        <Skeleton className="canvas-startup-skeleton-block h-36 w-64 shrink-0 rounded-lg" />
        <Skeleton className="canvas-startup-skeleton-block hidden h-36 w-64 shrink-0 rounded-lg lg:block" />
      </div>
    </div>
  )
}
