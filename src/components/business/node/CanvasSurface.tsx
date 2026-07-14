'use client'

import { useState, type CSSProperties } from 'react'

import { NODE_STUDIO_CANVAS_APPEARANCE_DEFAULT } from '@/constants/node-studio'
import type { CanvasAppearance } from '@/types/node-workflow'

interface CanvasSurfaceProps {
  appearance: CanvasAppearance | undefined
}

function parseHexColor(value: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value)
  if (!match) return null

  return [
    Number.parseInt(match[1], 16),
    Number.parseInt(match[2], 16),
    Number.parseInt(match[3], 16),
  ]
}

/** Keep the navigation grid legible on both light and dark custom surfaces. */
export function getCanvasGridDotColor(backgroundColor: string): string {
  const rgb = parseHexColor(backgroundColor)
  if (!rgb) return 'rgba(235, 229, 216, 0.18)'

  const [red, green, blue] = rgb.map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue

  return luminance > 0.42
    ? 'rgba(20, 18, 15, 0.2)'
    : 'rgba(235, 229, 216, 0.18)'
}

/**
 * CSS custom properties that must live on an ancestor of both the surface
 * layer and React Flow's Background, so the grid dots track the wallpaper
 * color instead of the global default charcoal.
 */
export function getCanvasAppearanceCssVars(
  appearance: CanvasAppearance | undefined,
): CSSProperties {
  const resolved = appearance ?? NODE_STUDIO_CANVAS_APPEARANCE_DEFAULT
  return {
    '--canvas-surface': resolved.backgroundColor,
    '--canvas-grid-dot': getCanvasGridDotColor(resolved.backgroundColor),
  } as CSSProperties
}

function CanvasWallpaper({
  url,
  fit,
  opacity,
}: NonNullable<CanvasAppearance['image']>) {
  const [failed, setFailed] = useState(false)

  if (failed) return null

  return (
    // The project asset URL is user-selected and can be remote, so Next Image
    // cannot know its host ahead of time. It is decorative and never captures
    // canvas input.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      aria-hidden="true"
      draggable={false}
      onError={() => setFailed(true)}
      className={
        fit === 'contain'
          ? 'absolute inset-0 size-full object-contain'
          : 'absolute inset-0 size-full object-cover'
      }
      style={{ opacity }}
    />
  )
}

/**
 * Viewport-fixed canvas material. It owns only color and wallpaper rendering;
 * React Flow remains responsible for pan, zoom, selection, nodes, and dots.
 *
 * Color tokens are also written so unit tests can assert them on this leaf.
 * Production should additionally hoist the same vars onto the stage ancestor
 * (see `getCanvasAppearanceCssVars`) so the Background grid inherits them.
 */
export function CanvasSurface({ appearance }: CanvasSurfaceProps) {
  const resolved = appearance ?? NODE_STUDIO_CANVAS_APPEARANCE_DEFAULT
  const style = {
    ...getCanvasAppearanceCssVars(appearance),
    backgroundColor: 'var(--canvas-surface)',
  } as CSSProperties

  return (
    <div
      data-testid="canvas-surface"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      style={style}
    >
      {resolved.image ? (
        <CanvasWallpaper key={resolved.image.url} {...resolved.image} />
      ) : null}
    </div>
  )
}
