'use client'

/**
 * 计划卡待定项一格里的**图示**（§9 / §2.24 / §3.4）。
 *
 * ── 三条分支，按序，⛔ 没有第四条 ─────────────────────────────────
 *  ① `assetUrl` 有值 → 画缩略图（「选哪张参考图」这一类：缩略图**就是**选项本身）；
 *  ② `visual` 命中词表 → 画预置图示（lucide / 自绘线描 / 渐变色块）；
 *  ③ 都没有 → 什么都不画，由调用方渲染成纯文字 chip（与有图示的格子等高）。
 * ⛔ **不猜、不留空图位、不回退到「随便一个图标」**：一个能被误读的图标比没有图标
 * 坏得多（§3.4 最后一行的原话）。词表外的 id 在**服务端**就已经被剥掉了，这里
 * 再判一次是因为历史条目也会走这颗组件。
 *
 * ⚠ 一格 34px（`--plan-visual-size`），线描统一 18px / 1.5px 描边、`currentColor` ——
 * 于是选中态只要给外层 `text-primary`，图示自己就跟着变色，⛔ 不必再传一个 prop。
 */

import Image from 'next/image'
import {
  CloudFog,
  CloudRain,
  CloudSnow,
  CloudSun,
  Frame,
  Moon,
  MoveHorizontal,
  Sun,
  Sunrise,
  Sunset,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react'

import {
  ASSISTANT_PLAN_SWATCH_MIX,
  ASSISTANT_PLAN_VISUAL_KINDS,
  getAssistantPlanVisual,
} from '@/constants/assistant-plan-visuals'
import { cn } from '@/lib/utils'
import type { AssistantOperatorPlanOption } from '@/types/assistant-operator'

/**
 * 词表里那 12 个 lucide 名 → 组件。
 *
 * ⚠ **逐个具名 import**，⛔ 不 `import * as icons from 'lucide-react'` 再按名取：
 * 后者会把整个图标库拖进这一块的 chunk（本仓 1000+ 图标）。
 * ⚠ 表里没有的名字返回 `null` 而不是兜一个默认图标 —— 词表与这张表对不上时，
 * 该出现的是「纯文字」，不是一个错的图标。
 */
const LUCIDE_BY_NAME: Record<string, LucideIcon> = {
  Sun,
  Sunset,
  Moon,
  Sunrise,
  CloudSun,
  CloudRain,
  CloudSnow,
  CloudFog,
  ZoomIn,
  ZoomOut,
  MoveHorizontal,
  Frame,
}

/** 自绘线描的画布尺度 —— 与 lucide 的 24×24 对齐，两种画法混排时线宽才一致。 */
const DRAW_VIEWBOX = 24

/**
 * 比例线框：在 24×24 里画一个居中、按 `w:h` 收边的矩形。
 *
 * ⚠ 一支画法喂五项（§9）：五个手写的 `d` 迟早会有一个算错，而算错的表现是
 * 「16:9 那格看起来像 4:3」—— 没有人会去量它。
 */
function ratioRect(w: number, h: number) {
  const max = 18
  const scale = Math.min(max / w, max / h)
  const width = w * scale
  const height = h * scale
  return {
    x: (DRAW_VIEWBOX - width) / 2,
    y: (DRAW_VIEWBOX - height) / 2,
    width,
    height,
  }
}

interface PlanOptionVisualProps {
  option: AssistantOperatorPlanOption
  /** 图示的无障碍名（调用方从 `planVisual.*` 取好的那一句）。 */
  label: string
  className?: string
}

export function PlanOptionVisual({
  option,
  label,
  className,
}: PlanOptionVisualProps) {
  const box = cn(
    'flex size-8.5 shrink-0 items-center justify-center overflow-hidden rounded-md',
    className,
  )

  // ① 缩略图优先 —— 这一类选项里，那张图就是选项本身。
  if (option.assetUrl) {
    return (
      <span
        data-testid="plan-option-visual"
        data-visual-kind="asset"
        className={cn(box, 'border border-border bg-muted')}
      >
        <Image
          src={option.assetUrl}
          alt={option.label}
          width={34}
          height={34}
          className="size-full object-cover"
          unoptimized
        />
      </span>
    )
  }

  const visual = getAssistantPlanVisual(option.visual)
  // ③ 词表外 / 没给 —— ⛔ 什么都不画，调用方去渲染纯文字 chip。
  if (!visual) return null

  if (visual.kind === ASSISTANT_PLAN_VISUAL_KINDS.swatch && visual.swatch) {
    const [from, to] = visual.swatch
    return (
      <span
        data-testid="plan-option-visual"
        data-visual-kind="swatch"
        data-visual-id={visual.id}
        role="img"
        aria-label={label}
        className={cn(box, 'border border-border')}
        style={{
          // ⛔ 一个 hex 都没有：两端都是脊柱 token 混到卡底上，明暗主题各自成立。
          backgroundImage: `linear-gradient(135deg, color-mix(in oklab, var(${from}) ${ASSISTANT_PLAN_SWATCH_MIX.from}%, var(--card)), color-mix(in oklab, var(${to}) ${ASSISTANT_PLAN_SWATCH_MIX.to}%, var(--card)))`,
        }}
      />
    )
  }

  const LucideGlyph = visual.lucide ? LUCIDE_BY_NAME[visual.lucide] : undefined
  if (LucideGlyph) {
    return (
      <span
        data-testid="plan-option-visual"
        data-visual-kind="lucide"
        data-visual-id={visual.id}
        role="img"
        aria-label={label}
        className={box}
      >
        <LucideGlyph className="size-4.5 stroke-[1.5]" aria-hidden />
      </span>
    )
  }

  const rect = visual.ratio ? ratioRect(visual.ratio[0], visual.ratio[1]) : null
  if (!rect && !visual.paths?.length) return null

  return (
    <span
      data-testid="plan-option-visual"
      data-visual-kind={rect ? 'ratio' : 'draw'}
      data-visual-id={visual.id}
      role="img"
      aria-label={label}
      className={box}
    >
      <svg
        viewBox={`0 0 ${DRAW_VIEWBOX} ${DRAW_VIEWBOX}`}
        className="size-4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {rect ? (
          <rect
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            rx={1.5}
          />
        ) : (
          visual.paths?.map((d) => <path key={d} d={d} />)
        )}
      </svg>
    </span>
  )
}
