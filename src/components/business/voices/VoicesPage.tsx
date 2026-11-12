'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog'
import { VoiceTrainer } from '@/components/business/voices/VoiceTrainer'
import { useVoicesPage } from '@/hooks/use-voices-page'
import { charactersOfVoice } from '@/lib/voice-avatar'
import type { VoiceCardRecord } from '@/types'

import {
  VoiceBindDialog,
  VoiceCoverDialog,
  VoiceRenameDialog,
} from './VoiceDialogs'
import { VoicesLibraryDesk } from './VoicesLibraryDesk'
import type { VoiceTileActions } from './VoiceTile'

/**
 * **音色库页** `/voices`（「声音」模块第 1 个 PR，owner 10-23）。
 *
 * 手机和桌面同一副库骨架 `VoicesLibraryDesk`（ui-spec §9，样件 E S22；手机上左栏收成切换条）。找新音色与克隆在配音间的选角弹窗里也照样能做
 * （owner 10-23：选角弹窗保持原样），这一页多出来的是管理：改名、换头像、绑到角色、删除。
 */

export function VoicesPage() {
  const t = useTranslations('VoicesPage')
  const page = useVoicesPage()
  const { library, characters } = page

  const [renaming, setRenaming] = useState<VoiceCardRecord | null>(null)
  const [covering, setCovering] = useState<VoiceCardRecord | null>(null)
  const [bindingId, setBindingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<VoiceCardRecord | null>(null)
  const [cloning, setCloning] = useState(false)

  // 绑定弹窗读最新的卡（绑完角色列表会刷新，卡本身不变，但留着 id 才不会读到旧对象）。
  const binding = useMemo(
    () => library.cards.find((card) => card.id === bindingId) ?? null,
    [bindingId, library.cards],
  )

  const cardActions = (card: VoiceCardRecord): VoiceTileActions => ({
    onRename: () => setRenaming(card),
    onChangeCover:
      charactersOfVoice(card.id, characters).length > 0
        ? null
        : () => setCovering(card),
    onBind: () => setBindingId(card.id),
    onDelete: () => setDeleting(card),
  })

  const dialogs = (
    <>
      <VoiceRenameDialog
        card={renaming}
        onOpenChange={(open) => {
          if (!open) setRenaming(null)
        }}
        onSave={page.rename}
      />
      <VoiceCoverDialog
        card={covering}
        onOpenChange={(open) => {
          if (!open) setCovering(null)
        }}
        onPickUrl={page.setCoverUrl}
        onUpload={page.uploadCover}
      />
      <VoiceBindDialog
        card={binding}
        characters={characters}
        voiceName={(id) =>
          library.cards.find((card) => card.id === id)?.name ?? null
        }
        pendingId={page.pendingId}
        onOpenChange={(open) => {
          if (!open) setBindingId(null)
        }}
        onToggle={(card, characterId, bound) =>
          void page.bindCharacter(card, characterId, bound)
        }
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={t('deleteTitle')}
        description={t('deleteConfirm', { name: deleting?.name ?? '' })}
        cancelLabel={t('cancel')}
        confirmLabel={t('delete')}
        onConfirm={() => {
          if (deleting) void page.remove(deleting)
          setDeleting(null)
        }}
      />
      {/* ⭐ 直接用工作台那个 `VoiceTrainer`（配音间的选角弹窗也挂它），不另写一套。 */}
      <ResponsiveDialog open={cloning} onOpenChange={setCloning}>
        <ResponsiveDialogContent className="sm:max-w-xl">
          <ResponsiveDialogTitle>{t('clone')}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription className="sr-only">
            {t('clone')}
          </ResponsiveDialogDescription>
          <VoiceTrainer
            onCreated={() => {
              void library.refreshCards()
              library.setTab('cloned')
              setCloning(false)
            }}
          />
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  )

  // 手机和桌面同一副库骨架（`VoicesLibraryDesk`，ui-spec §9）：手机上左栏收成顶上一条切换条
  //（2026-11-12 手机端，替掉「我的收藏 · 我的克隆 · 找音色」大字页签 + 白卡那一版）。
  return (
    <main className="flex h-page flex-col bg-background px-4 pt-3 text-foreground md:pr-5.5 md:pl-0">
      <h1 className="sr-only">{t('title')}</h1>
      <VoicesLibraryDesk
        page={page}
        onClone={() => setCloning(true)}
        cardActions={cardActions}
      />
      {dialogs}
    </main>
  )
}
