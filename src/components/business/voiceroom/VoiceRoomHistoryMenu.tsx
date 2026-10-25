'use client'

import { useCallback, useMemo, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'

import { ChevronDown, MessageSquarePlus } from '@/components/icons'
import { VOICE_ROOM_NAME_MAX_LENGTH } from '@/constants/voiceroom'
import { StudioOperatorSessionRow } from '@/components/business/studio/assistant-operator/StudioOperatorSessionRow'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { roomsWithSameCast, voiceRoomCastKey } from '@/lib/voiceroom-cast'
import type { VoiceRoomDetail, VoiceRoomRecord } from '@/types/voiceroom'

const MS_PER_DAY = 86_400_000

interface VoiceRoomHistoryMenuProps {
  detail: VoiceRoomDetail
  rooms: readonly VoiceRoomRecord[]
  switching: boolean
  onOpen: (roomId: string) => void
  onRename: (roomId: string, name: string | null) => Promise<void>
  onDelete: (roomId: string) => Promise<void>
  /** 照这一组人新开一段。 */
  onNew: () => void
}

/**
 * 配音间的标题 ▾（用户 10-25 定 A）：点开 = 和这一组人的几段历史 + 底部「新话题」，
 * 行上就地改名、两段确认删除 —— 与助手标题 ▾ 同一套行（`StudioOperatorSessionRow`）。
 *
 * ⛔ 没有房间列 / 对话列表：先在最上面那格选人，再在这里选和她的哪一段。
 * ⚠ 只列**同一组人**（`voiceRoomCastKey`）：班底改了，这一段就归到新那一组下面。
 */
export function VoiceRoomHistoryMenu({
  detail,
  rooms,
  switching,
  onOpen,
  onRename,
  onDelete,
  onNew,
}: VoiceRoomHistoryMenuProps) {
  const t = useTranslations('VoiceRoom')
  const tOperator = useTranslations('StudioOperator')
  const format = useFormatter()
  const [open, setOpen] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const cancelConfirm = useCallback(() => setConfirmId(null), [])

  const siblings = useMemo(() => {
    const listed = roomsWithSameCast(rooms, voiceRoomCastKey(detail.cast))
    // 刚开的这一段可能还没进列表：自己总在。
    return listed.some((room) => room.id === detail.id)
      ? listed
      : [detail, ...listed]
  }, [rooms, detail])

  const dateLabel = (iso: string): string => {
    const date = new Date(iso)
    const midnight = (value: Date) =>
      new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
    const days = Math.round(
      (midnight(new Date()) - midnight(date)) / MS_PER_DAY,
    )
    if (days <= 0) return tOperator('history.today')
    if (days === 1) return tOperator('history.yesterday')
    return format.dateTime(date, { month: '2-digit', day: '2-digit' })
  }

  return (
    <DropdownMenu
      modal={false}
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setConfirmId(null)
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="vr-bar-title vr-bar-history"
          data-unnamed={!detail.name}
          data-swapping={switching}
          data-testid="voiceroom-history-menu"
          aria-label={t('history')}
        >
          <span className="vr-bar-history-name">
            {detail.name ?? t('untitledRoom')}
          </span>
          <ChevronDown aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-[60svh] w-75 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl p-1.25"
      >
        {siblings.map((room) => (
          <StudioOperatorSessionRow
            key={room.id}
            session={{ id: room.id, title: room.name }}
            titleMaxLength={VOICE_ROOM_NAME_MAX_LENGTH}
            domainLabel={null}
            dateLabel={dateLabel(room.updatedAt)}
            current={room.id === detail.id}
            selectDisabled={deletingId === room.id}
            deleteDisabled={deletingId !== null}
            renaming={renamingId === room.id}
            deleting={deletingId === room.id}
            confirming={confirmId === room.id}
            onSelect={() => {
              if (room.id !== detail.id) onOpen(room.id)
            }}
            onRename={(name) => {
              setRenamingId(room.id)
              void onRename(room.id, name.trim() || null).finally(() =>
                setRenamingId(null),
              )
            }}
            onRequestDelete={() => setConfirmId(room.id)}
            onCancelDelete={cancelConfirm}
            onConfirmDelete={() => {
              setDeletingId(room.id)
              void onDelete(room.id).finally(() => {
                setDeletingId(null)
                setConfirmId(null)
              })
            }}
          />
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem data-testid="voiceroom-new-topic" onSelect={onNew}>
          <MessageSquarePlus className="size-4" aria-hidden />
          {t('newTopic')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
