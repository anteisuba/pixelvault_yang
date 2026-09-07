'use client'

import { memo } from 'react'

import { normalizeAvatarPreset } from '@/constants/assistant-persona'
import { BrandMark } from '@/components/ui/brand-mark'
import { cn } from '@/lib/utils'

/**
 * 预设 AI 头像 —— **两款**（owner 2026-09-07：「先找一下，只给一两张预设图」）。
 *
 *  ① `mark` = 项目品牌标，直接渲染 `components/ui/brand-mark.tsx`（Engineering
 *     Principle：复用大于重造）。⚠ 走 `currentColor`，所以设置弹层里选中那一格
 *     变 `text-primary` 时它跟着变。
 *  ② `monogram` = 首字母圆标，取字走 `timelineInitials`（与时间线上的用户头像
 *     **同一套**：CJK 取一字、拉丁取两字），⛔ 全仓只有那一份取字逻辑。
 *
 * ⚠ **未知 preset id 一律回落到默认款**（`normalizeAvatarPreset`）：库里还留着
 * 收窄前的 `spark` / `stamp` / `duotone` / `tide`，⛔ 不抛错、⛔ 不出空圈。
 *
 * ⚠ 自定义头像（`avatarUrl`）**不走这颗** —— 那是一张真的图片，由调用方直接画。
 */

/**
 * 首字母圆标的文字。
 *
 * ⚠ 取两位（`FL` 式），中日文取一个字 —— 同
 * `components/business/ProfileHeader.tsx` 的取法（§11.3）。
 * ⚠ `Array.from` 而不是 `slice(0,2)`：`slice` 按 UTF-16 码元切，emoji 或某些
 * CJK 扩展字会被劈成半个字符然后渲染成豆腐块。
 */
export function timelineInitials(name: string): string {
  const chars = Array.from(name.trim())
  if (chars.length === 0) return '?'
  // CJK 一个字已经够认人了，两个字反而挤不下 32px。
  const isCjk = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/.test(chars[0] ?? '')
  return chars
    .slice(0, isCjk ? 1 : 2)
    .join('')
    .toUpperCase()
}

interface AssistantAvatarGlyphProps {
  /** 词表外的值也收——回落到默认款，见上面那条。 */
  presetId: string | null | undefined
  /** 字母款画谁的首字母。空名字时调用方兜底（工作台名 / `?`）。 */
  name?: string
  className?: string
}

export const AssistantAvatarGlyph = memo(function AssistantAvatarGlyph({
  presetId,
  name,
  className,
}: AssistantAvatarGlyphProps) {
  const preset = normalizeAvatarPreset(presetId)
  const letters = timelineInitials(name ?? '')

  if (preset === 'mark') {
    return (
      <span
        data-testid="assistant-avatar-glyph"
        data-preset={preset}
        aria-hidden="true"
        className={cn('grid size-full place-items-center', className)}
      >
        {/* 45% × 55.5% 保住品牌标 1.5:1.85 的原比例（容器是正方形）。 */}
        <BrandMark
          color="currentColor"
          style={{ width: '45%', height: '55.5%' }}
        />
      </span>
    )
  }

  return (
    <svg
      data-testid="assistant-avatar-glyph"
      data-preset={preset}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className={cn('size-full', className)}
    >
      <circle cx="12" cy="12" r="12" className="fill-muted" />
      <text
        x="12"
        y="12"
        textAnchor="middle"
        dominantBaseline="central"
        /**
         * ⚠ 字号写在 SVG 用户坐标里（viewBox 是 24×24），⛔ 不用 Tailwind 的
         * 字号工具类：那些是 rem，会跟着根字号漂，而这里要的是「占这个格子的
         * 一半高」这条几何关系。两个字母时收一档，⛔ 别让它顶到圆边。
         */
        fontSize={letters.length > 1 ? '9' : '11'}
        fontWeight="600"
        className="fill-muted-foreground font-mono"
      >
        {letters}
      </text>
    </svg>
  )
})
