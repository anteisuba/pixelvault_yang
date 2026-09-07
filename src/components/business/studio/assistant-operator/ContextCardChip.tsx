'use client'

import { memo } from 'react'
import Image from 'next/image'

import { CONTEXT_CARD_IMAGE_ROLE_IDS } from '@/constants/context-cards'
import {
  studioChipActiveClass,
  studioToolTriggerClass,
} from '@/components/business/studio-shared/primitives/tool-surface'
import { cn } from '@/lib/utils'
import type { ContextCardKindId } from '@/constants/context-cards'
import type { ContextCardImage } from '@/types/context-cards'

/**
 * 上下文卡的 **chip 形态**（第三期 K1）——`@` 之后落在提示词栏里的那一颗。
 *
 * ⚠ **与素材 chip 同尺寸**：它就住在同一排里（`studioToolTriggerClass` —— 移动
 * 44px / 桌面 36px 的同一颗），⛔ 别为「卡」另发明一个高度，那会让那一排参差不齐。
 * ⚠ 头像取**设定图**（`sheet`）而不是第一张图：设定图是这张卡的身份证据，
 * 用一张随手挂的气氛参考当脸是把「这是谁」这件事讲错了。一张图都没有时退回首字母。
 * ⛔ 不用状态色：一张卡不是成功也不是警告。选中态复用素材 chip 的那一档。
 */

interface ContextCardChipProps {
  cardId: string
  name: string
  kind: ContextCardKindId
  images?: readonly ContextCardImage[]
  /** 选中态（已经挂进这一轮）。 */
  active?: boolean
  onSelect?(cardId: string): void
  /** 给了就画一颗摘除钮（chip 在提示词栏里时用）。 */
  onRemove?(cardId: string): void
  removeLabel?: string
  className?: string
}

/** 一张卡的脸：设定图 > 特写 > 任意一张 > 无。 */
export function pickContextCardFace(
  images: readonly ContextCardImage[] = [],
): ContextCardImage | null {
  return (
    images.find((image) => image.role === CONTEXT_CARD_IMAGE_ROLE_IDS.sheet) ??
    images.find(
      (image) => image.role === CONTEXT_CARD_IMAGE_ROLE_IDS.closeup,
    ) ??
    images[0] ??
    null
  )
}

/** ⚠ 用 `Array.from` 取首字符：emoji 与中文都是一个「字」，⛔ 不用 `[0]`。 */
function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '?'
}

export const ContextCardChip = memo(function ContextCardChip({
  cardId,
  name,
  kind,
  images,
  active = false,
  onSelect,
  onRemove,
  removeLabel,
  className,
}: ContextCardChipProps) {
  const face = pickContextCardFace(images)

  return (
    <span
      className={cn(
        studioToolTriggerClass,
        active && studioChipActiveClass,
        'cursor-default gap-1.5 pl-1.5',
        onSelect && 'cursor-pointer',
        className,
      )}
      data-kind={kind}
      data-testid="context-card-chip"
      onClick={onSelect ? () => onSelect(cardId) : undefined}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={
        onSelect
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect(cardId)
              }
            }
          : undefined
      }
    >
      <span className="grid size-6 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-muted text-2sm font-semibold text-muted-foreground">
        {face ? (
          <Image
            src={face.url}
            alt=""
            width={48}
            height={48}
            unoptimized
            className="size-full object-cover"
          />
        ) : (
          initialOf(name)
        )}
      </span>
      <span className="truncate">{name}</span>
      {onRemove ? (
        <button
          type="button"
          aria-label={removeLabel ?? name}
          className="ml-0.5 shrink-0 rounded-full px-1 text-muted-foreground transition-colors hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation()
            onRemove(cardId)
          }}
        >
          ×
        </button>
      ) : null}
    </span>
  )
})
