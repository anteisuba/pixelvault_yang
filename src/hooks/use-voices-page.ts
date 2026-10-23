'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { PROFILE } from '@/constants/config'
import { useCharacterLibrary } from '@/hooks/cards/use-character-library'
import { useVoiceLibrary } from '@/hooks/use-voice-library'
import { useVoiceSamplePreview } from '@/hooks/use-voice-sample-preview'
import {
  deleteVoiceCardAPI,
  updateCharacterCardAPI,
  updateVoiceCardAPI,
  uploadVoiceCardCoverAPI,
} from '@/lib/api-client'
import { readImageFileAsBase64 } from '@/lib/image-input'
import type { VoiceCardRecord } from '@/types'

/**
 * 音色库页 `/voices` 的状态（「声音」模块第 1 个 PR，owner 10-23）。
 *
 * ⭐ 取数、收藏、收藏↔克隆分流全走 `useVoiceLibrary` 内核（与画布、配音间同一份），
 *   这里只加这一页独有的管理动作：改名、换头像、绑到角色、删除。
 * ⭐ 角色读 `useCharacterLibrary`（全页一份的只读库）；绑 / 松开写角色卡的
 *   `voiceCardId`，写完让那份库重拉 —— 一个角色只有一副嗓子，绑到这里就从原来那副上挪走。
 */
export function useVoicesPage() {
  const t = useTranslations('VoicesPage')
  const library = useVoiceLibrary({ initialTab: 'favorites' })
  const characters = useCharacterLibrary()
  const preview = useVoiceSamplePreview()
  /** 正在写的那张音色卡 / 那个角色（按钮上转圈）。 */
  const [pendingId, setPendingId] = useState<string | null>(null)

  const run = useCallback(
    async (id: string, task: () => Promise<boolean>, failKey: string) => {
      setPendingId(id)
      const ok = await task().catch(() => false)
      setPendingId(null)
      if (!ok) toast.error(t(failKey))
      return ok
    },
    [t],
  )

  const rename = useCallback(
    (card: VoiceCardRecord, name: string) =>
      run(
        card.id,
        async () => {
          const result = await updateVoiceCardAPI(card.id, { name })
          if (result.success) await library.refreshCards()
          return result.success
        },
        'saveFailed',
      ),
    [library, run],
  )

  const setCoverUrl = useCallback(
    (card: VoiceCardRecord, url: string) =>
      run(
        card.id,
        async () => {
          const result = await updateVoiceCardAPI(card.id, { coverImage: url })
          if (result.success) await library.refreshCards()
          return result.success
        },
        'uploadFailed',
      ),
    [library, run],
  )

  const uploadCover = useCallback(
    async (card: VoiceCardRecord, file: File) => {
      const read = await readImageFileAsBase64(file, {
        maxFileSize: PROFILE.AVATAR_MAX_SIZE_BYTES,
        acceptedTypes: PROFILE.SUPPORTED_IMAGE_TYPES,
      })
      if (!read.ok) {
        toast.error(t(read.reason === 'size' ? 'imageTooLarge' : 'imageType'))
        return false
      }
      return run(
        card.id,
        async () => {
          const result = await uploadVoiceCardCoverAPI(card.id, read.base64)
          if (result.success) await library.refreshCards()
          return result.success
        },
        'uploadFailed',
      )
    },
    [library, run, t],
  )

  /** 绑上 / 松开：`bound = true` 让这个角色用这副嗓子，`false` 让她不再用。 */
  const bindCharacter = useCallback(
    (card: VoiceCardRecord, characterId: string, bound: boolean) =>
      run(
        characterId,
        async () => {
          const result = await updateCharacterCardAPI(characterId, {
            voiceCardId: bound ? card.id : null,
          })
          if (result.success) await characters.refresh()
          return result.success
        },
        'saveFailed',
      ),
    [characters, run],
  )

  const remove = useCallback(
    (card: VoiceCardRecord) =>
      run(
        card.id,
        async () => {
          if (preview.playingId === card.id) preview.stop()
          const result = await deleteVoiceCardAPI(card.id)
          if (result.success) {
            await Promise.all([library.refreshCards(), characters.refresh()])
          }
          return result.success
        },
        'deleteFailed',
      ),
    [characters, library, preview, run],
  )

  return {
    library,
    characters: characters.cards,
    preview,
    pendingId,
    rename,
    setCoverUrl,
    uploadCover,
    bindCharacter,
    remove,
  }
}

export type UseVoicesPageReturn = ReturnType<typeof useVoicesPage>
