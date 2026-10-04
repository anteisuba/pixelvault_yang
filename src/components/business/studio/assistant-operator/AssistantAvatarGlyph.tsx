'use client'

import { memo } from 'react'
import Image from 'next/image'

import { normalizeAvatarPreset } from '@/constants/assistant-persona'
import { cn } from '@/lib/utils'

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
  presetId: string | null | undefined
  className?: string
}

export const AssistantAvatarGlyph = memo(function AssistantAvatarGlyph({
  presetId,
  className,
}: AssistantAvatarGlyphProps) {
  const preset = normalizeAvatarPreset(presetId)

  return (
    <Image
      data-testid="assistant-avatar-glyph"
      data-preset={preset}
      src="/icon.png"
      alt=""
      width={192}
      height={192}
      unoptimized
      className={cn('size-full object-cover', className)}
    />
  )
})
