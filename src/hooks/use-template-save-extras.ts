'use client'

import { useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import type { RecipeCharacterLink } from '@/types'
import {
  getCharacterCardAPI,
  updateCharacterLookAPI,
} from '@/lib/api-client/cards'
import { addCharacterStickerFromGenerationAPI } from '@/lib/api-client/character-stickers'
import { appendSlotSources } from '@/features/cards/hooks'

/**
 * 存成模板框里的「也放进她的图片 / 表情包」（owner 11-01）：模板存好之后再做，
 * 各自失败各自提示，⛔ 不连累已经存好的模板。
 */
export function useTemplateSaveExtras() {
  const t = useTranslations('SaveTemplate')
  return useCallback(
    async ({
      link,
      image,
      images,
      stickers,
    }: {
      link: RecipeCharacterLink | null
      image: { url: string; generationId: string } | null
      images: boolean
      stickers: boolean
    }) => {
      if (!link || !image) return
      if (images) {
        // 现拉一遍：造型可能是刚在框里新建的，别处手上的列表还没有它。
        const card = await getCharacterCardAPI(link.cardId)
        const look = card.success
          ? card.data?.looks.find((item) => item.id === link.lookId)
          : undefined
        const ok = look
          ? (
              await updateCharacterLookAPI(link.lookId, {
                referenceSlots: appendSlotSources(look.referenceSlots, [
                  { ...image, origin: 'generation' },
                ]),
              })
            ).success
          : false
        if (!ok) toast.error(t('alsoImagesFailed'))
      }
      if (stickers) {
        const result = await addCharacterStickerFromGenerationAPI(
          link.cardId,
          image.generationId,
        )
        if (!result.success) toast.error(t('alsoStickersFailed'))
      }
    },
    [t],
  )
}
