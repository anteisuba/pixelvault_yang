'use client'

import { useCallback, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

import type { CharacterCardRecord, LoraAssetRecord } from '@/types'
import { Plus, Sparkles } from '@/components/icons'
import {
  MEDIA_TILE_CLASS,
  MEDIA_TILE_PILL_CLASS,
  MediaTileCaption,
  MediaTileShade,
} from '@/components/ui/media-tile'
import { Spinner } from '@/components/ui/spinner'
import {
  LoraPickerDialog,
  type LoraPickCollect,
} from '@/components/business/studio/lora/library/LoraPickerDialog'
import { useCharacterLoras } from '@/hooks/cards/use-character-loras'
import { lookLabel } from '@/lib/character-looks'
import { proxyCivitaiImageUrl } from '@/lib/civitai-image-url'
import { buildLibraryFavoriteRequest } from '@/lib/lora-source-snapshot'
import { cn } from '@/lib/utils'

/** 她页的挑选框不在 LoRA 台上：没有台上底模，格子上不判「装不上」。 */
const NO_STAGE = { base: null, baseLabel: null } as const

/**
 * 电脑详情「LoRA」页签（角色大项目第 ⑧ 步，样件 v4）：库那种 3:4 格子，第一格虚线
 *「添加 LoRA」弹工作台同一个居中挑选框（owner 10-30），键写「加给她 N 个」；悬停出「卸下」。
 * 先做最简（owner 10-30）：新加的都算全部造型通用，⛔ 在这里改挂哪套；⛔ 筛选、⛔ 训练入口。
 * 别的角色也收着同一把时只动她自己那一条（整组替换，带上其他人原样）。
 */
export function CharacterLoraGrid({ card }: { card: CharacterCardRecord }) {
  const t = useTranslations('CharacterRoster')
  const tLooks = useTranslations('CharacterLooks')
  const { groups, isLoading, setLoraCharacters } = useCharacterLoras()
  const [picking, setPicking] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const loras = useMemo(
    () =>
      groups.find((group) => group.characterCardId === card.id)?.loras ?? [],
    [card.id, groups],
  )

  /** 这把 LoRA 现在的主人们（换掉 / 加上她之前的那份）。 */
  const ownersOf = useCallback(
    (loraUrl: string) =>
      groups.flatMap((group) => {
        const link = group.loras.find((lora) => lora.loraUrl === loraUrl)
        return link
          ? [{ characterCardId: group.characterCardId, lookId: link.lookId }]
          : []
      }),
    [groups],
  )

  const collect = useMemo<LoraPickCollect>(
    () => ({
      mounted: loras,
      onConfirm: async (assets: LoraAssetRecord[]) => {
        for (const asset of assets) {
          const owners = ownersOf(asset.loraUrl).filter(
            (owner) => owner.characterCardId !== card.id,
          )
          const ok = await setLoraCharacters(
            buildLibraryFavoriteRequest(asset),
            [...owners, { characterCardId: card.id, lookId: null }],
          )
          if (!ok) return false
        }
        return true
      },
    }),
    [card.id, loras, ownersOf, setLoraCharacters],
  )

  const unload = async (lora: LoraAssetRecord) => {
    if (removing) return
    setRemoving(lora.id)
    await setLoraCharacters(
      buildLibraryFavoriteRequest(lora),
      ownersOf(lora.loraUrl).filter(
        (owner) => owner.characterCardId !== card.id,
      ),
    )
    setRemoving(null)
  }

  if (isLoading && groups.length === 0) return <Spinner />

  return (
    <>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
        <li>
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="flex aspect-3/4 w-full flex-col items-center justify-center gap-1.5 rounded-12 border border-dashed border-border text-xs text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground"
          >
            <Plus className="size-4.5" aria-hidden />
            {t('addLora')}
          </button>
        </li>
        {loras.map((lora) => {
          const look = lora.lookId
            ? card.looks.find((item) => item.id === lora.lookId)
            : undefined
          return (
            <li key={lora.id} className="min-w-0">
              <div className={cn(MEDIA_TILE_CLASS, 'aspect-3/4')}>
                {lora.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={proxyCivitaiImageUrl(lora.coverImageUrl)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    className="absolute inset-0 size-full object-cover"
                  />
                ) : (
                  <span className="absolute inset-0 grid place-items-center text-muted-foreground">
                    <Sparkles className="size-6" aria-hidden />
                  </span>
                )}
                <MediaTileShade />
                <div className="absolute inset-x-2 bottom-2 flex translate-y-1 justify-center opacity-0 transition duration-fast ease-standard group-focus-within/tile:translate-y-0 group-focus-within/tile:opacity-100 group-hover/tile:translate-y-0 group-hover/tile:opacity-100 pointer-coarse:translate-y-0 pointer-coarse:opacity-100 motion-reduce:transition-none">
                  <button
                    type="button"
                    disabled={removing !== null}
                    onClick={() => void unload(lora)}
                    aria-label={t('unloadLoraLabel', { name: lora.name })}
                    className={MEDIA_TILE_PILL_CLASS}
                  >
                    {t('unloadLora')}
                  </button>
                </div>
              </div>
              <MediaTileCaption
                name={lora.name}
                meta={[
                  lora.baseModelFamily,
                  look
                    ? lookLabel(look, card.looks, tLooks)
                    : tLooks('allLooks'),
                ].join(' · ')}
              />
            </li>
          )
        })}
      </ul>
      <LoraPickerDialog
        open={picking}
        onOpenChange={setPicking}
        stage={NO_STAGE}
        collect={collect}
      />
    </>
  )
}
