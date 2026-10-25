'use client'

import { useCallback, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  VOICE_ROOM_CHAT_FILES_MAX,
  VOICE_ROOM_CHAT_IMAGES_MAX,
} from '@/constants/voiceroom'
import { resolveGenerationDisplayName } from '@/lib/generation-name'
import type { GenerationRecord } from '@/types'
import type { StudioOperatorAttachment } from '@/types/studio-assistant-operator'
import type {
  VoiceLineFile,
  VoiceLineImage,
  VoiceRoomChatAttached,
} from '@/types/voiceroom'
import { useStudioOperatorUpload } from '@/hooks/use-studio-operator-upload'

/**
 * 配音间输入框 ＋ 挂上的东西（用户 10-25「＋ 和助手输入框一样只管放东西」）：上传图片 / 音频 / 视频、
 * 从素材挑图，发出去就清空。
 *
 * ⭐ 上传就是助手输入框那一套（`useStudioOperatorUpload`：分派、压缩、直传 R2、进度、失败原因），
 *   传完就是素材库里的一件，和从素材挑的分不出来；⛔ 另写一套上传。
 * ⚠ 图最多 `VOICE_ROOM_CHAT_IMAGES_MAX` 张、文件最多 `VOICE_ROOM_CHAT_FILES_MAX` 个，多的不挂、说一声。
 *   3D 模型她看不了，传上来也不挂。
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

const NOTHING: Required<VoiceRoomChatAttached> = { images: [], files: [] }

export function useVoiceRoomAttachments(scopeKey: string | null) {
  const tRoom = useTranslations('VoiceRoom')
  const [attached, setAttached] =
    useState<Required<VoiceRoomChatAttached>>(NOTHING)

  /** 现挂着的：上传是一件一件回来的，要在同一拍里判超没超（⛔ 读渲染时那份旧值）。 */
  const attachedRef = useRef(attached)
  const commit = useCallback((next: Required<VoiceRoomChatAttached>) => {
    attachedRef.current = next
    setAttached(next)
  }, [])

  const addImages = useCallback(
    (next: readonly VoiceLineImage[]) => {
      const { images, files } = attachedRef.current
      const merged = [
        ...images,
        ...next.filter((image) => images.every((item) => item.id !== image.id)),
      ]
      if (merged.length > VOICE_ROOM_CHAT_IMAGES_MAX)
        toast.error(tRoom('imagesMax', { max: VOICE_ROOM_CHAT_IMAGES_MAX }))
      commit({ images: merged.slice(0, VOICE_ROOM_CHAT_IMAGES_MAX), files })
    },
    [commit, tRoom],
  )

  const addFile = useCallback(
    (file: VoiceLineFile) => {
      const { images, files } = attachedRef.current
      if (files.some((item) => item.id === file.id)) return
      if (files.length >= VOICE_ROOM_CHAT_FILES_MAX) {
        toast.error(tRoom('filesMax', { max: VOICE_ROOM_CHAT_FILES_MAX }))
        return
      }
      commit({ images, files: [...files, file] })
    },
    [commit, tRoom],
  )

  const onUploaded = useCallback(
    (attachment: StudioOperatorAttachment) => {
      if (attachment.kind === 'image')
        addImages([
          {
            id: attachment.id,
            url: attachment.url,
            label: attachment.label.slice(0, 200),
            ...(typeof attachment.seq === 'number'
              ? { seq: attachment.seq }
              : {}),
          },
        ])
      else if (attachment.kind === 'audio' || attachment.kind === 'video')
        addFile({
          id: attachment.id,
          url: attachment.url,
          kind: attachment.kind,
          label: attachment.label.slice(0, 200),
        })
    },
    [addFile, addImages],
  )

  const { uploads, uploadFiles, retryUpload, dismissUpload } =
    useStudioOperatorUpload({ scopeKey, onUploaded })

  const remove = useCallback(
    (id: string) => {
      const { images, files } = attachedRef.current
      commit({
        images: images.filter((image) => image.id !== id),
        files: files.filter((file) => file.id !== id),
      })
    },
    [commit],
  )
  const clear = useCallback(() => commit(NOTHING), [commit])

  return {
    images: attached.images,
    files: attached.files,
    uploads,
    uploading: uploads.some((upload) => upload.status === 'uploading'),
    addImages,
    uploadFiles,
    retryUpload,
    dismissUpload,
    remove,
    clear,
  }
}
