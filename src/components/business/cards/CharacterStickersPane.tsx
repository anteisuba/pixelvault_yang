'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import { CHARACTER_STICKERS } from '@/constants/character-browse'
import type { CharacterStickerRecord } from '@/types/character-sticker'
import { Ban, Plus } from '@/components/icons'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  MEDIA_TILE_CLASS,
  MEDIA_TILE_PILL_CLASS,
  MediaTileShade,
} from '@/components/ui/media-tile'
import { Spinner } from '@/components/ui/spinner'
import type { useCharacterStickers } from '@/hooks/cards'
import { cn } from '@/lib/utils'

type Stickers = ReturnType<typeof useCharacterStickers>

/**
 * 电脑详情「表情包」页签（角色大项目第 ⑨ 步，owner 10-30 按推荐定）：
 * 「她的表情包 N / 30」→ 第一格虚线「喂给她」→ 每张底下写她那句「什么时候发」；
 * 悬停出白药丸「拉黑 / 恢复 · 删除」（⛔ 点图切换），删前确认。铺满整行，屏宽多放几张。
 * 喂的那张不额外调模型，那句话用默认的；同图 / 相似图在服务端只留一张（`placeSticker`）。
 */
export function CharacterStickersPane({ stickers }: { stickers: Stickers }) {
  const t = useTranslations('CharacterRoster.recent')
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const rows = stickers.stickers
  if (!rows)
    return (
      <div className="flex justify-center py-16">
        <Spinner className="text-muted-foreground" />
      </div>
    )

  const feed = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    const result = await stickers.upload(file)
    setUploading(false)
    if (!result.ok)
      toast.error(
        t(
          result.reason === 'tooLarge'
            ? 'uploadTooLarge'
            : result.reason === 'notAnImage'
              ? 'uploadNotImage'
              : 'uploadFailed',
        ),
      )
  }

  const toggle = (sticker: CharacterStickerRecord) =>
    void stickers.setBlocked(sticker.id, !sticker.isBlocked).then((ok) => {
      if (!ok) toast.error(t('saveFailed'))
    })

  return (
    <section aria-label={t('stickersTitle')} className="flex flex-col gap-3">
      <h3 className="flex items-baseline gap-2 text-sm font-semibold">
        {t('stickersTitle')}
        <span className="font-mono text-xs font-normal tabular-nums text-muted-foreground">
          {rows.length} / {CHARACTER_STICKERS.perCard}
        </span>
      </h3>
      <ul className="grid grid-cols-3 gap-x-3 gap-y-4 sm:grid-cols-5 lg:grid-cols-7 2xl:grid-cols-9">
        <li>
          <label
            className={cn(
              'flex aspect-square w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-12 border border-dashed border-border text-xs text-muted-foreground transition-colors duration-fast hover:bg-muted hover:text-foreground focus-within:shadow-focus',
              uploading && 'pointer-events-none opacity-45',
            )}
          >
            {uploading ? (
              <Spinner size="sm" />
            ) : (
              <Plus aria-hidden className="size-4.5" />
            )}
            {t('feedSticker')}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              onChange={(event) => {
                void feed(event.target.files?.[0])
                event.target.value = ''
              }}
            />
          </label>
        </li>
        {rows.map((sticker) => (
          <li key={sticker.id} className="min-w-0">
            <div className={cn(MEDIA_TILE_CLASS, 'aspect-square')}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sticker.url}
                alt=""
                loading="lazy"
                className={cn(
                  'absolute inset-0 size-full object-contain transition-opacity duration-fast',
                  sticker.isBlocked && 'opacity-35',
                )}
              />
              {sticker.isBlocked ? (
                <Ban
                  aria-hidden
                  className="absolute inset-0 m-auto size-9 text-foreground"
                />
              ) : null}
              <MediaTileShade />
              <div className="absolute inset-x-2 bottom-2 flex translate-y-1 flex-wrap justify-center gap-1 opacity-0 transition duration-fast ease-standard group-focus-within/tile:translate-y-0 group-focus-within/tile:opacity-100 group-hover/tile:translate-y-0 group-hover/tile:opacity-100 pointer-coarse:translate-y-0 pointer-coarse:opacity-100 motion-reduce:transition-none">
                <button
                  type="button"
                  aria-pressed={sticker.isBlocked}
                  aria-label={
                    sticker.isBlocked ? t('unblockSticker') : t('blockSticker')
                  }
                  onClick={() => toggle(sticker)}
                  className={cn(MEDIA_TILE_PILL_CLASS, 'h-6 px-2.5 text-2xs')}
                >
                  {sticker.isBlocked ? t('unblock') : t('block')}
                </button>
                <button
                  type="button"
                  aria-label={t('deleteSticker')}
                  onClick={() => setDeletingId(sticker.id)}
                  className={cn(MEDIA_TILE_PILL_CLASS, 'h-6 px-2.5 text-2xs')}
                >
                  {t('delete')}
                </button>
              </div>
            </div>
            <p className="mt-2 line-clamp-2 px-0.5 text-xs text-muted-foreground">
              {sticker.whenToUse}
            </p>
          </li>
        ))}
      </ul>
      {rows.length === 0 ? (
        <p className="text-2sm text-muted-foreground">{t('stickersEmpty')}</p>
      ) : null}
      <ConfirmDialog
        open={deletingId !== null}
        onOpenChange={(open) => {
          if (!open) setDeletingId(null)
        }}
        title={t('deleteStickerTitle')}
        description={t('deleteStickerBody')}
        cancelLabel={t('cancel')}
        confirmLabel={t('delete')}
        onConfirm={() => {
          const id = deletingId
          setDeletingId(null)
          if (id)
            void stickers.remove(id).then((ok) => {
              if (!ok) toast.error(t('deleteFailed'))
            })
        }}
      />
    </section>
  )
}
