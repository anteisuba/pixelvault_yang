'use client'

import { useCallback, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { CLIENT_UPLOAD_MAX_BYTES } from '@/constants/uploads'
import { VOICE_ROOM_CHAT_IMAGES_MAX } from '@/constants/voiceroom'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { uploadImageFileAPI } from '@/lib/api-client/generation'
import { resolveGenerationDisplayName } from '@/lib/generation-name'
import { prepareImageUpload } from '@/lib/prepare-image-upload'
import type { GenerationRecord } from '@/types'
import type { VoiceLineImage } from '@/types/voiceroom'

/**
 * 配音间输入框 ＋ 挂上的图（用户 10-25「＋ 和助手输入框一样只管放东西」）：上传 / 从素材挑，发出去就清空。
 *
 * ⭐ 上传走助手同一条直传 R2 的路（`uploadImageFileAPI`，⛔ base64 进消息体），传完就是素材库里的一件，
 *   和从素材挑的分不出来；文案借助手附件那几句（同一件事，⛔ 另写一套）。
 * ⚠ 最多 `VOICE_ROOM_CHAT_IMAGES_MAX` 张，多的不挂、说一声。
 */

export function imageOfGeneration(
  generation: GenerationRecord,
): VoiceLineImage {
  return {
    id: generation.id,
    url: generation.url,
    label: resolveGenerationDisplayName(generation).slice(0, 200),
    ...(typeof generation.seq === 'number' ? { seq: generation.seq } : {}),
  }
}

export function useVoiceRoomImages() {
  const t = useTranslations('StudioOperator')
  const tErrors = useTranslations('Errors')
  const tRoom = useTranslations('VoiceRoom')
  const [images, setImages] = useState<VoiceLineImage[]>([])
  const [uploading, setUploading] = useState(0)

  /** 现挂着的几张：`add` 要在同一拍里判超没超（上传是一张一张回来的，⛔ 读渲染时那份旧值）。 */
  const imagesRef = useRef<VoiceLineImage[]>([])
  const commit = useCallback((next: VoiceLineImage[]) => {
    imagesRef.current = next
    setImages(next)
  }, [])

  const add = useCallback(
    (next: readonly VoiceLineImage[]) => {
      const current = imagesRef.current
      const merged = [
        ...current,
        ...next.filter((image) =>
          current.every((item) => item.id !== image.id),
        ),
      ]
      if (merged.length > VOICE_ROOM_CHAT_IMAGES_MAX)
        toast.error(tRoom('imagesMax', { max: VOICE_ROOM_CHAT_IMAGES_MAX }))
      commit(merged.slice(0, VOICE_ROOM_CHAT_IMAGES_MAX))
    },
    [commit, tRoom],
  )

  const upload = useCallback(
    async (files: readonly File[]) => {
      const maxMb = String(CLIENT_UPLOAD_MAX_BYTES / 1024 / 1024)
      setUploading((count) => count + files.length)
      for (const file of files) {
        try {
          const prepared = await prepareImageUpload(file, {
            maxBytes: CLIENT_UPLOAD_MAX_BYTES,
            messages: {
              compressing: t('attach.upload.compressing'),
              compressed: ({ from, to }) =>
                t('attach.upload.compressed', { from, to }),
              gifTooLarge: t('attach.upload.gifTooLarge', { maxMb }),
              tooLarge: t('attach.upload.tooLargeImage', { maxMb }),
            },
          })
          if (!prepared) continue
          const response = await uploadImageFileAPI(prepared)
          if (response.success && response.data)
            add([imageOfGeneration(response.data.generation)])
          else
            toast.error(
              getApiErrorMessage(tErrors, response, t('attach.upload.failed')),
            )
        } catch {
          toast.error(t('attach.upload.failed'))
        } finally {
          setUploading((count) => count - 1)
        }
      }
    },
    [add, t, tErrors],
  )

  const remove = useCallback(
    (id: string) =>
      commit(imagesRef.current.filter((image) => image.id !== id)),
    [commit],
  )
  const clear = useCallback(() => commit([]), [commit])

  return { images, uploading: uploading > 0, add, upload, remove, clear }
}
