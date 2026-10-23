'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import { Check } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { Spinner } from '@/components/ui/spinner'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { VoiceAvatar } from '@/components/business/node/voice-library/VoiceAvatar'
import { ImagePickerPopoverBody } from '@/components/business/studio-shared/ImagePickerPopoverBody'
import { characterCoverUrl } from '@/lib/card-bus'
import { cn } from '@/lib/utils'
import type { CharacterCardRecord, VoiceCardRecord } from '@/types'

/** 音色库页的三个弹窗：改名 · 换头像 · 绑到角色。 */

const NAME_MAX_LENGTH = 100

export function VoiceRenameDialog({
  card,
  onOpenChange,
  onSave,
}: {
  readonly card: VoiceCardRecord | null
  onOpenChange(open: boolean): void
  onSave(card: VoiceCardRecord, name: string): Promise<boolean>
}) {
  const t = useTranslations('VoicesPage')
  return (
    <ResponsiveDialog open={card !== null} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-sm">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t('rename')}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="sr-only">
            {t('rename')}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        {card ? (
          <RenameForm
            key={card.id}
            card={card}
            onCancel={() => onOpenChange(false)}
            onSave={onSave}
          />
        ) : null}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}

function RenameForm({
  card,
  onCancel,
  onSave,
}: {
  readonly card: VoiceCardRecord
  onCancel(): void
  onSave(card: VoiceCardRecord, name: string): Promise<boolean>
}) {
  const t = useTranslations('VoicesPage')
  const [name, setName] = useState(card.name)
  const [saving, setSaving] = useState(false)
  const trimmed = name.trim()

  const submit = async () => {
    if (!trimmed || trimmed === card.name) {
      onCancel()
      return
    }
    setSaving(true)
    const ok = await onSave(card, trimmed)
    setSaving(false)
    if (ok) onCancel()
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <Input
        autoFocus
        value={name}
        maxLength={NAME_MAX_LENGTH}
        aria-label={t('rename')}
        onChange={(event) => setName(event.target.value)}
      />
      <ResponsiveDialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={!trimmed || saving}>
          {saving ? <Spinner size="sm" /> : null}
          {t('save')}
        </Button>
      </ResponsiveDialogFooter>
    </form>
  )
}

/**
 * 换头像：拖图 / 点击上传 / 最近素材 / 打开素材库 —— 与参考图那颗弹层同一份
 * `ImagePickerPopoverBody`，只换落点（写音色卡的 `coverImage`）。
 */
export function VoiceCoverDialog({
  card,
  onOpenChange,
  onPickUrl,
  onUpload,
}: {
  readonly card: VoiceCardRecord | null
  onOpenChange(open: boolean): void
  onPickUrl(card: VoiceCardRecord, url: string): Promise<boolean>
  onUpload(card: VoiceCardRecord, file: File): Promise<boolean>
}) {
  const t = useTranslations('VoicesPage')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [libraryCard, setLibraryCard] = useState<VoiceCardRecord | null>(null)

  const upload = (file: File | undefined) => {
    if (!card || !file) return
    onOpenChange(false)
    void onUpload(card, file)
  }

  return (
    <>
      <ResponsiveDialog open={card !== null} onOpenChange={onOpenChange}>
        <ResponsiveDialogContent className="sm:max-w-md">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{t('changeCover')}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription className="sr-only">
              {t('changeCover')}
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              upload(file)
            }}
          />
          <ImagePickerPopoverBody
            dropHint={t('coverDropHint')}
            recentLabel={t('coverRecent')}
            recentEmptyLabel={t('coverRecentEmpty')}
            openLibraryLabel={t('coverOpenLibrary')}
            onPickFile={() => fileInputRef.current?.click()}
            onDropFile={upload}
            onPickAsset={(generation) => {
              if (!card) return
              onOpenChange(false)
              void onPickUrl(card, generation.url)
            }}
            onOpenLibrary={() => {
              // 先关这一层再开整屏选择器，两层焦点陷阱不打架（同参考图那颗弹层）。
              setLibraryCard(card)
              onOpenChange(false)
            }}
          />
        </ResponsiveDialogContent>
      </ResponsiveDialog>
      <AssetSelectorDialog
        open={libraryCard !== null}
        onOpenChange={(open) => {
          if (!open) setLibraryCard(null)
        }}
        onSelect={(generation) => {
          if (libraryCard) void onPickUrl(libraryCard, generation.url)
          setLibraryCard(null)
        }}
        title={t('changeCover')}
        description={t('changeCover')}
        mediaType="image"
      />
    </>
  )
}

/**
 * 绑到角色：列出所有角色，勾上 = 她用这副嗓子。一个角色只有一副嗓子，所以勾上一个
 * 正用着别的嗓子的角色，就是把她挪过来（行里写着她现在用的是谁）。
 */
export function VoiceBindDialog({
  card,
  characters,
  voiceName,
  pendingId,
  onOpenChange,
  onToggle,
}: {
  readonly card: VoiceCardRecord | null
  readonly characters: readonly CharacterCardRecord[]
  /** 角色现在用的那副嗓子叫什么（不是这一张时显示在行里）。 */
  voiceName(voiceCardId: string): string | null
  readonly pendingId: string | null
  onOpenChange(open: boolean): void
  onToggle(card: VoiceCardRecord, characterId: string, bound: boolean): void
}) {
  const t = useTranslations('VoicesPage')
  return (
    <ResponsiveDialog open={card !== null} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{t('bind')}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="sr-only">
            {t('bind')}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        {card && characters.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('bindEmpty')}
          </p>
        ) : null}
        {card && characters.length > 0 ? (
          <ul className="-mx-2 flex max-h-96 flex-col overflow-y-auto">
            {characters.map((character) => {
              const bound = character.voiceCardId === card.id
              const other =
                !bound && character.voiceCardId
                  ? voiceName(character.voiceCardId)
                  : null
              const pending = pendingId === character.id
              return (
                <li key={character.id}>
                  <button
                    type="button"
                    aria-pressed={bound}
                    disabled={pending}
                    onClick={() => onToggle(card, character.id, !bound)}
                    className={cn(
                      'flex min-h-11 w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors duration-fast hover:bg-accent',
                      'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    )}
                  >
                    <VoiceAvatar
                      cover={characterCoverUrl(character)}
                      fallback="letter"
                      name={character.name}
                      size="library"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">
                        {character.name}
                      </span>
                      {other ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {t('bindCurrent', { name: other })}
                        </span>
                      ) : null}
                    </span>
                    {pending ? (
                      <Spinner size="sm" />
                    ) : bound ? (
                      <Check className="size-4 text-foreground" />
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
