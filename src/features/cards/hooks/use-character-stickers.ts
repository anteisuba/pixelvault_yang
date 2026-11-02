'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import {
  deleteCharacterStickerAPI,
  listCharacterStickersAPI,
  updateCharacterStickerAPI,
  uploadCharacterStickerAPI,
} from '@/lib/api-client'
import { deferEffectTask } from '@/lib/defer-effect-task'
import type { CharacterStickerRecord } from '@/types/character-sticker'

/** 上传失败的原因：太大（413）/ 不是图（400）/ 别的。 */
export type StickerUploadResult =
  | { ok: true }
  | { ok: false; reason: 'tooLarge' | 'notAnImage' | 'failed' }

/**
 * **她的表情包**（4d，角色页右栏）：列、拉黑 / 恢复（先改界面，没存上就改回去）、删、上传一张。
 * `cardId` 换了调用方用 key 重置。
 */
export function useCharacterStickers(cardId: string) {
  const [stickers, setStickers] = useState<CharacterStickerRecord[] | null>(
    null,
  )
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  useEffect(
    () =>
      deferEffectTask(() => {
        void listCharacterStickersAPI(cardId).then((result) => {
          if (aliveRef.current && result.success) setStickers(result.data)
        })
      }),
    [cardId],
  )

  const setBlocked = useCallback(
    async (stickerId: string, isBlocked: boolean): Promise<boolean> => {
      const flip = (blocked: boolean) =>
        setStickers((current) =>
          current
            ? current.map((row) =>
                row.id === stickerId ? { ...row, isBlocked: blocked } : row,
              )
            : current,
        )
      flip(isBlocked)
      const result = await updateCharacterStickerAPI(stickerId, { isBlocked })
      if (!result.success && aliveRef.current) flip(!isBlocked)
      return result.success
    },
    [],
  )

  const remove = useCallback(async (stickerId: string): Promise<boolean> => {
    const result = await deleteCharacterStickerAPI(stickerId)
    if (result.success && aliveRef.current)
      setStickers((current) =>
        current ? current.filter((row) => row.id !== stickerId) : current,
      )
    return result.success
  }, [])

  const upload = useCallback(
    async (file: File): Promise<StickerUploadResult> => {
      const result = await uploadCharacterStickerAPI(cardId, file)
      if (!result.success)
        return {
          ok: false,
          reason:
            result.status === 413
              ? 'tooLarge'
              : result.status === 400
                ? 'notAnImage'
                : 'failed',
        }
      // 满 30 张时服务端会删掉最旧、没发过的那张：重新取一份，⛔ 自己猜删了哪张。
      const fresh = await listCharacterStickersAPI(cardId)
      if (aliveRef.current)
        setStickers((current) =>
          fresh.success ? fresh.data : [result.data, ...(current ?? [])],
        )
      return { ok: true }
    },
    [cardId],
  )

  return { stickers, setBlocked, remove, upload }
}
