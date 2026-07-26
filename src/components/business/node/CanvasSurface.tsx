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

function relativeLuminance(rgb: [number, number, number]): number {
  const [red, green, blue] = rgb.map((channel) => {
    const normalized = channel / 255
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

/**
 * S1（2026-07-26）卡边兜底。画布域皮肤把卡背钉死在 `--canvas-card-bg`（浅色档
 * `#FFFFFF`），靠「比底亮一档」浮起——域默认底 `#F1F1F1` 下卡对底 1.13:1，够读。
 * 但底色是**项目级用户设置**（预设含纯白 `#FFFFFF` 与纯黑 `#000000`，还有自由
 * 取色），用户把底调到贴近卡背时那 1.13 会塌到 1.00，卡整个消失。
 *
 * 所以卡边分两档：底色与卡背拉得开 → 用装饰性发丝边（`--canvas-card-line`）；
 * 拉不开 → 换成能读出边界的强边。判据是两者的相对亮度差，不是色相。
 * 与 `getCanvasGridDotColor` 同一个模式：呈现随用户底色自适应，不禁用功能。
 */
export function getCanvasCardLineColor(
  backgroundColor: string,
  isDarkScheme = false,
): string {
  const hairline = isDarkScheme
    ? 'rgba(255, 255, 255, 0.10)'
    : 'rgba(0, 0, 0, 0.08)'
  const strong = isDarkScheme
    ? 'rgba(255, 255, 255, 0.32)'
    : 'rgba(0, 0, 0, 0.28)'

  const rgb = parseHexColor(backgroundColor)
  if (!rgb) return hairline

  // 卡背亮度：浅色档 #FFFFFF = 1，深色档 #171717 ≈ 0.0074。
  const cardLuminance = isDarkScheme ? 0.0074 : 1
  const surfaceLuminance = relativeLuminance(rgb)
  const contrast =
    (Math.max(cardLuminance, surfaceLuminance) + 0.05) /
    (Math.min(cardLuminance, surfaceLuminance) + 0.05)

  // 1.12 ≈ 域默认底给出的 1.13，刚好在"读得出分层"的下沿；再低就必须加重边。
  return contrast >= 1.12 ? hairline : strong
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
    // S1：卡边随用户底色自适应，覆盖 canvas.css 里 .domain-canvas 的静态值。
    '--canvas-card-line': getCanvasCardLineColor(resolved.backgroundColor),
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

  // R3-4 §4.1 L0: 暖炭表面，画布覆盖层阶梯最底层。
  return (
    <div
      data-testid="canvas-surface"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-canvas-surface overflow-hidden"
      style={style}
    >
      {resolved.image ? (
        <CanvasWallpaper key={resolved.image.url} {...resolved.image} />
      ) : null}
    </div>
  )
}
