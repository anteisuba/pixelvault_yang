'use client'

import { useState, type ReactNode } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'

import { CHARACTER_CARD } from '@/constants/cards/character-card'
import type {
  CharacterCardRecord,
  CharacterLookRecord,
  GenerationRecord,
} from '@/types'
import { Plus } from '@/components/icons'
import {
  MEDIA_TILE_CLASS,
  MEDIA_TILE_PILL_CLASS,
  MediaTileShade,
} from '@/components/ui/media-tile'
import { AssetSelectorDialog } from '@/features/assets'
import {
  appendSlotImages,
  type CharacterLookDraft,
  makePrimary,
  removeSlot,
  replaceSlotImage,
} from '@/features/cards/hooks/use-character-card-editor'
import { useCharacterCardUsage } from '@/features/cards/hooks/use-character-card-usage'
import { defaultLook } from '@/lib/card-bus'
import { lookLabel } from '@/lib/character-looks'
import { cn } from '@/lib/utils'

type SaveLook = (
  look: CharacterLookRecord,
  patch: Partial<CharacterLookDraft>,
) => Promise<boolean>

/**
 * 电脑详情「图片」页签的两块（角色大项目第 ⑧ 步，样件 v4 方案 B）：
 * 「卡上的图」（主图 · 设成主图 / 换一张 / 移除 · 虚线加图）在上，「用她出过的」在下，
 * 出过的每张能「设成卡上的图」，已经在卡上的标「卡上」。
 * ⛔「找立绘」键（owner 10-30：没图就自己配或叫助手找）—— 一张都没有时只剩那格虚线加图。
 * ⭐ 不分造型（owner 11-01：造型只在「模板」页签管）：全部造型的图摆一起，有几套时每张
 *   角上标是哪一套；新加的图进默认造型。
 */
export function CharacterImageShelves({
  card,
  save,
}: {
  card: CharacterCardRecord
  save: SaveLook
}) {
  const t = useTranslations('CharacterRoster')
  const tLooks = useTranslations('CharacterLooks')
  /** 素材库选择器开着时在做什么：加几张，或换掉哪一套的某一格。 */
  const [picking, setPicking] = useState<
    | { kind: 'add' }
    | { kind: 'replace'; look: CharacterLookRecord; slotId: string }
    | null
  >(null)
  const usage = useCharacterCardUsage(card.id, true)
  const home = defaultLook(card)
  const several = card.looks.length > 1
  const tiles = card.looks.flatMap((look) =>
    look.referenceSlots.map((slot) => ({ look, slot })),
  )
  const remaining =
    CHARACTER_CARD.MAX_REFERENCE_SLOTS - home.referenceSlots.length
  const made = usage.generations
  const madeTotal = usage.total ?? made.length

  const putOnCard = (generation: GenerationRecord) =>
    void save(home, {
      slots: appendSlotImages(home.referenceSlots, [generation]),
    })

  return (
    <>
      <Shelf title={t('imagesCardTitle')} count={tiles.length}>
        <div className="flex flex-wrap gap-2.5">
          {tiles.map(({ look, slot }) => {
            const slots = look.referenceSlots
            return (
              <figure
                key={slot.id}
                className={cn(MEDIA_TILE_CLASS, 'h-40 w-30 shrink-0')}
              >
                <Image
                  src={slot.url}
                  alt=""
                  fill
                  sizes="120px"
                  className="object-cover"
                />
                <MediaTileShade />
                {slot.isPrimary || several ? (
                  <TileChip>
                    {[
                      several ? lookLabel(look, card.looks, tLooks) : null,
                      slot.isPrimary ? t('primary') : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </TileChip>
                ) : null}
                <TileActions>
                  {slot.isPrimary ? null : (
                    <TileAction
                      onClick={() =>
                        void save(look, { slots: makePrimary(slots, slot.id) })
                      }
                    >
                      {t('makePrimary')}
                    </TileAction>
                  )}
                  <TileAction
                    onClick={() =>
                      setPicking({ kind: 'replace', look, slotId: slot.id })
                    }
                  >
                    {t('replaceImage')}
                  </TileAction>
                  {slots.length > 1 ? (
                    <TileAction
                      onClick={() =>
                        void save(look, { slots: removeSlot(slots, slot.id) })
                      }
                    >
                      {t('removeImage')}
                    </TileAction>
                  ) : null}
                </TileActions>
              </figure>
            )
          })}
          {remaining > 0 ? (
            <button
              type="button"
              aria-label={t('addImage')}
              onClick={() => setPicking({ kind: 'add' })}
              className="grid h-40 w-30 shrink-0 place-items-center rounded-12 border border-dashed border-border text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground"
            >
              <Plus className="size-4.5" aria-hidden />
            </button>
          ) : null}
        </div>
      </Shelf>

      {made.length > 0 ? (
        <Shelf title={t('imagesMadeTitle')} count={madeTotal}>
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5 lg:grid-cols-8 2xl:grid-cols-10">
            {made.map((generation) => {
              const onCard = tiles.some(
                ({ slot }) => slot.url === generation.url,
              )
              return (
                <figure
                  key={generation.id}
                  className={cn(MEDIA_TILE_CLASS, 'aspect-3/4')}
                >
                  <Image
                    src={generation.thumbnailUrl ?? generation.url}
                    alt=""
                    fill
                    sizes="120px"
                    className="object-cover"
                  />
                  <MediaTileShade />
                  {onCard ? (
                    <TileChip>{t('onCard')}</TileChip>
                  ) : remaining > 0 ? (
                    <TileActions>
                      <TileAction onClick={() => putOnCard(generation)}>
                        {t('setOnCard')}
                      </TileAction>
                    </TileActions>
                  ) : null}
                </figure>
              )
            })}
          </div>
          {madeTotal > made.length ? (
            <p className="text-xs text-muted-foreground">
              {t('imagesMore', { count: madeTotal - made.length })}
            </p>
          ) : null}
        </Shelf>
      ) : null}

      <AssetSelectorDialog
        open={picking !== null}
        onOpenChange={(open) => {
          if (!open) setPicking(null)
        }}
        title={t('pickTitle')}
        description={t('addImageHint')}
        mediaType="image"
        multiSelect={picking?.kind === 'add'}
        maxSelection={remaining}
        onConfirmMany={(generations) =>
          void save(home, {
            slots: appendSlotImages(home.referenceSlots, generations),
          })
        }
        onSelect={(generation) => {
          if (picking?.kind === 'replace')
            void save(picking.look, {
              slots: replaceSlotImage(
                picking.look.referenceSlots,
                picking.slotId,
                generation,
              ),
            })
        }}
      />
    </>
  )
}

function Shelf({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="flex items-baseline gap-2 text-sm font-semibold">
        {title}
        <span className="font-mono text-xs font-normal tabular-nums text-muted-foreground">
          {count}
        </span>
      </h3>
      {children}
    </section>
  )
}

function TileChip({ children }: { children: string }) {
  return (
    <span className="pointer-events-none absolute left-2 top-2 inline-flex h-5.5 items-center rounded-full bg-media-chip px-2 text-2xs font-medium text-on-media-chip">
      {children}
    </span>
  )
}

/** 图上那排白药丸：悬停 / 键盘进来才出，触屏常显（同图格 `MediaTileActions`）。 */
function TileActions({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-x-2 bottom-2 flex translate-y-1 flex-wrap justify-center gap-1 opacity-0 transition duration-fast ease-standard group-focus-within/tile:translate-y-0 group-focus-within/tile:opacity-100 group-hover/tile:translate-y-0 group-hover/tile:opacity-100 pointer-coarse:translate-y-0 pointer-coarse:opacity-100 motion-reduce:transition-none">
      {children}
    </div>
  )
}

function TileAction({
  onClick,
  children,
}: {
  onClick(): void
  children: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(MEDIA_TILE_PILL_CLASS, 'h-6 px-2.5 text-2xs')}
    >
      {children}
    </button>
  )
}
