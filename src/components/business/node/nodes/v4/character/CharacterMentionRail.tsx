'use client'

/**
 * 参考轨上的 **@她**（画布用角色 ④ 第 2 片，owner 09-28「挂在参考轨上」）。
 *
 * 一位一格，与轨上的参考图同一种长相（48 缩略 + 下面一行名字）：缩略是她的主图，
 * 角标是这一镜带几张（近黑实底，与参考图的序号角标区分开）。点开 = 勾图面板，与工作台
 * 「角色」弹层同一个格子（`CharacterImagePickGrid`）。
 * ⚠ 她从这一排消失的唯一方式是正文里删掉 `@她` —— 这里不给「移除」。
 */

import { useState } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import type { CharacterImagePick } from '@/types'
import { CharacterImagePickGrid } from '@/components/business/cards/CharacterImagePickGrid'
import {
  characterMainImage,
  type NodeCharacterMention,
} from '@/lib/node-character-mentions'
import { cn } from '@/lib/utils'

import { ChipPopover } from '../chrome'
import { useNodeV4Canvas } from '../NodeV4Context'

const THUMB_PX = 48

export function CharacterMentionRail({
  nodeId,
  mentions,
  capacity,
  usedImages,
  disabled = false,
}: {
  nodeId: string
  mentions: readonly NodeCharacterMention[]
  /** 这张卡的模型一次能收几张参考图（`null` = 上游没公布上限，不卡）。 */
  capacity: number | null
  /** 轨上已经挂了几张参考图（不含角色）。 */
  usedImages: number
  disabled?: boolean
}) {
  const t = useTranslations('StudioNode.v4.characterMention')
  const canvas = useNodeV4Canvas()
  const [openId, setOpenId] = useState<string | null>(null)
  if (mentions.length === 0) return null

  const pickedTotal = mentions.reduce(
    (total, mention) => total + mention.picks.length,
    0,
  )
  const remaining =
    capacity === null
      ? Infinity
      : Math.max(0, capacity - usedImages - pickedTotal)

  const setPicks = (characterId: string, picks: CharacterImagePick[]) =>
    void canvas.onApplyOp({
      op: NODE_ASSISTANT_OP_V4_IDS.setCharacterPicks,
      target: nodeId,
      characterId,
      picks: picks.length > 0 ? picks : null,
    })

  return (
    <div
      data-character-mention-rail
      onDoubleClick={(event) => event.stopPropagation()}
      className="nodrag nopan nowheel flex shrink-0 items-start gap-2 py-1"
    >
      {mentions.map(({ card, picks }) => {
        const thumb = characterMainImage(card)
        return (
          <div
            key={card.id}
            className="flex w-12 shrink-0 flex-col items-center gap-0.5"
          >
            <ChipPopover
              open={openId === card.id}
              onOpenChange={(open) => setOpenId(open ? card.id : null)}
              width={360}
              ariaLabel={t('pickerLabel', { name: card.name })}
              trigger={
                <button
                  type="button"
                  disabled={disabled}
                  data-character-mention={card.id}
                  aria-label={t('chipLabel', {
                    name: card.name,
                    count: picks.length,
                  })}
                  className={cn(
                    'nodrag nopan relative size-12 shrink-0 rounded-node-thumb bg-surface-fill',
                    'transition-colors duration-fast ease-standard hover:bg-surface-fill-hover',
                    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    'disabled:pointer-events-none disabled:opacity-60',
                  )}
                >
                  {thumb ? (
                    <Image
                      src={thumb}
                      alt=""
                      width={THUMB_PX}
                      height={THUMB_PX}
                      unoptimized
                      className="size-full rounded-node-thumb object-cover"
                    />
                  ) : null}
                  <span
                    aria-hidden
                    className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-3xs font-semibold text-background tabular-nums"
                  >
                    {picks.length}
                  </span>
                </button>
              }
            >
              <div className="flex flex-col gap-2 pt-1">
                <div className="flex items-center gap-2 px-2">
                  <span className="truncate text-sm font-medium">
                    {card.name}
                  </span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {t('count', { count: picks.length })}
                  </span>
                </div>
                {capacity === null ? null : (
                  <p className="px-2 text-xs text-muted-foreground">
                    {t('limit', {
                      max: capacity,
                      used: usedImages + pickedTotal,
                    })}
                  </p>
                )}
                <CharacterImagePickGrid
                  card={card}
                  picks={picks}
                  remaining={remaining}
                  onChange={(next) => setPicks(card.id, next)}
                />
              </div>
            </ChipPopover>
            <span
              title={card.name}
              className="block w-full truncate text-center text-2xs leading-4 text-muted-foreground"
            >
              {card.name}
            </span>
          </div>
        )
      })}
    </div>
  )
}
