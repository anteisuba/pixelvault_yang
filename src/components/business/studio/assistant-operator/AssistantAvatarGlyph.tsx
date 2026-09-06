'use client'

import { memo } from 'react'

import {
  ASSISTANT_AVATAR_INK_IDS,
  ASSISTANT_AVATAR_PRESETS,
  type AssistantAvatarInk,
  type AssistantAvatarPresetId,
  type AssistantAvatarShape,
} from '@/constants/assistant-persona'
import { cn } from '@/lib/utils'

/**
 * 一款预设 AI 头像（§8.2）。
 *
 * 几何住 `constants/assistant-persona.ts`，这颗组件只负责把它画成 SVG ——
 * ⛔ 不 `dangerouslySetInnerHTML`，⛔ 不引静态图片文件。
 * 颜色只有那张封闭表里的四个，全部落到 `currentColor` / `--primary` / `--muted`
 * 上（脊柱外的颜色在类型上就写不出来）。
 *
 * ⚠ 自定义头像（`avatarUrl`）**不走这颗** —— 那是一张真的图片，由调用方直接画。
 */

const FILL_CLASS: Record<AssistantAvatarInk, string> = {
  [ASSISTANT_AVATAR_INK_IDS.primary]: 'fill-primary',
  [ASSISTANT_AVATAR_INK_IDS.onPrimary]: 'fill-primary-foreground',
  [ASSISTANT_AVATAR_INK_IDS.current]: 'fill-current',
  [ASSISTANT_AVATAR_INK_IDS.muted]: 'fill-muted',
}

const STROKE_CLASS: Record<AssistantAvatarInk, string> = {
  [ASSISTANT_AVATAR_INK_IDS.primary]: 'stroke-primary',
  [ASSISTANT_AVATAR_INK_IDS.onPrimary]: 'stroke-primary-foreground',
  [ASSISTANT_AVATAR_INK_IDS.current]: 'stroke-current',
  [ASSISTANT_AVATAR_INK_IDS.muted]: 'stroke-muted',
}

interface AssistantAvatarGlyphProps {
  presetId: AssistantAvatarPresetId
  /**
   * 字母款要画的首字母。⚠ 空字符串时字母款只剩底色 —— 调用方负责兜底
   * （助手没名字时用域名首字母，见 §8.2）。
   */
  initial?: string
  className?: string
}

function renderShape(shape: AssistantAvatarShape, index: number) {
  switch (shape.kind) {
    case 'circle':
      return (
        <circle
          key={index}
          cx={shape.cx}
          cy={shape.cy}
          r={shape.r}
          className={FILL_CLASS[shape.fill]}
        />
      )
    case 'ring':
      return (
        <circle
          key={index}
          cx={shape.cx}
          cy={shape.cy}
          r={shape.r}
          fill="none"
          strokeWidth={shape.strokeWidth}
          className={STROKE_CLASS[shape.stroke]}
        />
      )
    case 'rect':
      return (
        <rect
          key={index}
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          rx={shape.rx}
          className={FILL_CLASS[shape.fill]}
        />
      )
    case 'path':
      return <path key={index} d={shape.d} className={FILL_CLASS[shape.fill]} />
    case 'stroke':
      return (
        <path
          key={index}
          d={shape.d}
          fill="none"
          strokeWidth={shape.strokeWidth}
          strokeLinecap="round"
          className={STROKE_CLASS[shape.stroke]}
        />
      )
    case 'initial':
      return null
  }
}

export const AssistantAvatarGlyph = memo(function AssistantAvatarGlyph({
  presetId,
  initial,
  className,
}: AssistantAvatarGlyphProps) {
  const preset = ASSISTANT_AVATAR_PRESETS[presetId]
  const letterShape = preset.shapes.find((shape) => shape.kind === 'initial')
  const letter = initial?.trim().slice(0, 1).toUpperCase() ?? ''

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={cn('size-full', className)}
    >
      {preset.shapes.map(renderShape)}
      {letterShape && letter ? (
        <text
          x="12"
          y="12"
          textAnchor="middle"
          dominantBaseline="central"
          /**
           * ⚠ 字号写在 SVG 用户坐标里（viewBox 是 24×24），⛔ 不用 Tailwind 的
           * 字号工具类：那些是 rem，会跟着根字号漂，而这里要的是「占这个格子的
           * 一半高」这条几何关系。
           */
          fontSize="11"
          fontWeight="600"
          className={FILL_CLASS[letterShape.fill]}
        >
          {letter}
        </text>
      ) : null}
    </svg>
  )
})
