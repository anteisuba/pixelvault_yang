'use client'

import { memo } from 'react'
import Image from 'next/image'

import {
  ASSISTANT_AVATAR_CHOICE_IDS,
  normalizeAvatarPreset,
} from '@/constants/assistant-persona'
import { cn } from '@/lib/utils'
import type { AssistantPersona } from '@/types/assistant-persona'

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

/**
 * 头像选的是「角色」但她没有图（没有主图的角色）→ 画她名字的首字母，⛔ 退成品牌图标：那张图标
 * 是个粉发猫耳女孩，看上去就是另一个人（11-18：没图的角色顶栏 / 空态都顶着 Aemeath 的脸）。
 * 别的情况（预设、上传、还没拉到）= `null`，照旧画图标。
 */
export function assistantGlyphLetterName(
  persona:
    | Pick<AssistantPersona, 'avatarChoice' | 'avatarUrl' | 'character'>
    | null
    | undefined,
): string | null {
  if (!persona || persona.avatarUrl) return null
  if (persona.avatarChoice !== ASSISTANT_AVATAR_CHOICE_IDS.character)
    return null
  return persona.character?.name?.trim() || null
}

interface AssistantAvatarGlyphProps {
  presetId: string | null | undefined
  /** 给了 = 画这个名字的首字母（没图的角色，见 `assistantGlyphLetterName`）。 */
  letterName?: string | null
  className?: string
}

export const AssistantAvatarGlyph = memo(function AssistantAvatarGlyph({
  presetId,
  letterName,
  className,
}: AssistantAvatarGlyphProps) {
  const preset = normalizeAvatarPreset(presetId)

  if (letterName) {
    return (
      <span
        data-testid="assistant-avatar-glyph"
        data-letter=""
        aria-hidden
        className={cn(
          'grid size-full place-items-center bg-muted text-xs font-medium text-foreground',
          className,
        )}
      >
        {timelineInitials(letterName)}
      </span>
    )
  }

  return (
    <Image
      data-testid="assistant-avatar-glyph"
      data-preset={preset}
      src="/icon.png"
      alt=""
      width={192}
      height={192}
      unoptimized
      // 对话收起 / 展开时头像在两个位置之间换着挂：懒加载会让新挂的那一颗空一拍（用户 10-25：
      // 「收起来头像会刷新一下」），同一张图 ⛔ 懒加载、同步解码。
      loading="eager"
      decoding="sync"
      className={cn('size-full object-cover', className)}
    />
  )
})
