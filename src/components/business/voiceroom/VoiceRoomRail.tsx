'use client'

import { useTranslations } from 'next-intl'

import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { VoiceRoomRecord } from '@/types/voiceroom'

import { VoiceAvatar } from './VoiceAvatar'

/** 左列：一场戏一个房间。班底缩略头像堆 + 最近动过的时间。 */

interface VoiceRoomRailProps {
  rooms: VoiceRoomRecord[]
  activeRoomId: string | null
  onOpen: (roomId: string) => void
  onCreate: () => void
  onDelete: (roomId: string) => void
}

/** 「刚刚 / 3 分钟前 / 昨天」这类相对时间，只到天。 */
function useRelativeTime() {
  const t = useTranslations('VoiceRoom')
  return (iso: string) => {
    const diffMs = Date.now() - new Date(iso).getTime()
    const minutes = Math.floor(diffMs / 60_000)
    if (minutes < 1) return t('justNow')
    if (minutes < 60) return t('minutesAgo', { count: minutes })
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return t('hoursAgo', { count: hours })
    const days = Math.floor(hours / 24)
    if (days === 1) return t('yesterday')
    return t('daysAgo', { count: days })
  }
}

export function VoiceRoomRail({
  rooms,
  activeRoomId,
  onOpen,
  onCreate,
  onDelete,
}: VoiceRoomRailProps) {
  const t = useTranslations('VoiceRoom')
  const relative = useRelativeTime()

  return (
    <div className="vr-rail">
      <button type="button" className="vr-rail-new" onClick={onCreate}>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M5 0v10M0 5h10" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        {t('newRoom')}
      </button>

      <div className="vr-rooms">
        {rooms.map((room) => (
          <div className="vr-room-row" key={room.id}>
            <button
              type="button"
              className="vr-room-item"
              data-active={room.id === activeRoomId}
              onClick={() => onOpen(room.id)}
            >
              <span className="vr-room-name" data-unnamed={!room.name}>
                {room.name ?? t('untitledRoom')}
              </span>
              <span className="vr-room-sub">
                <span className="vr-stack">
                  {room.cast.slice(0, 4).map((member) => (
                    <VoiceAvatar
                      key={member.id}
                      id={member.id}
                      name={member.name}
                      kind={member.kind}
                      size="xs"
                    />
                  ))}
                </span>
                <span className="vr-when">
                  {room.cast.length === 0
                    ? t('emptyRoomTag')
                    : relative(room.updatedAt)}
                </span>
              </span>
            </button>

            {/*
             * ⚠ 台词跟着房间一起没（schema 上是 Cascade），所以文案里必须说出
             * 这件事——「删除房间」听起来像只是收拾一个空壳。生成物**不删**，
             * 那是用户资产，仍然躺在素材库里。
             */}
            <ConfirmDialog
              title={t('deleteRoomTitle')}
              description={t('deleteRoomHint', {
                name: room.name ?? t('untitledRoom'),
              })}
              cancelLabel={t('cancel')}
              confirmLabel={t('deleteRoom')}
              onConfirm={() => onDelete(room.id)}
              trigger={
                <button
                  type="button"
                  className="vr-room-del"
                  aria-label={t('deleteRoom')}
                  title={t('deleteRoom')}
                >
                  <svg width="9" height="9" viewBox="0 0 9 9" aria-hidden>
                    <path
                      d="M0.5 0.5l8 8M8.5 0.5l-8 8"
                      stroke="currentColor"
                      strokeWidth="1.3"
                    />
                  </svg>
                </button>
              }
            />
          </div>
        ))}
      </div>

      <p className="vr-rail-foot">{t('railFoot')}</p>
    </div>
  )
}
