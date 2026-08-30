'use client'

import { useState, type FormEvent } from 'react'
import { useTranslations } from 'next-intl'

import { VOICE_LINE_TEXT_MAX_LENGTH } from '@/constants/voiceroom'
import type {
  VoiceRoomCastMember,
  VoiceRoomDeliveryState,
} from '@/types/voiceroom'

import { VoiceAvatar } from './VoiceAvatar'
import { VoiceRoomDelivery } from './VoiceRoomDelivery'

/**
 * 输入行 —— 这一页的核心动作：**选中谁，打的字就是谁的台词**。
 *
 * 没有说话人下拉，头像本身就是选择器：一眼看得出班底有谁、现在轮到谁。
 */

interface VoiceRoomComposerProps {
  cast: VoiceRoomCastMember[]
  selectedId: string | null
  sending: boolean
  delivery: VoiceRoomDeliveryState
  onDeliveryChange: (patch: Partial<VoiceRoomDeliveryState>) => void
  onSelect: (speakerId: string) => void
  onOpenCasting: () => void
  onSubmit: (text: string) => Promise<boolean>
}

export function VoiceRoomComposer({
  cast,
  selectedId,
  sending,
  delivery,
  onDeliveryChange,
  onSelect,
  onOpenCasting,
  onSubmit,
}: VoiceRoomComposerProps) {
  const t = useTranslations('VoiceRoom')
  const [text, setText] = useState('')

  const selected = cast.find((member) => member.id === selectedId) ?? null
  const canSend = Boolean(selected) && text.trim().length > 0 && !sending

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canSend || !selected) return
    // 先清空再等结果：发出去的字留在框里，用户会以为没发出去。失败时错误条会说话。
    const pending = text.trim()
    setText('')
    const ok = await onSubmit(pending)
    if (!ok) setText(pending)
  }

  return (
    <form className="vr-composer" onSubmit={handleSubmit}>
      <div className="vr-picks">
        {cast.map((member) => (
          <button
            key={member.id}
            type="button"
            className="vr-pick"
            data-selected={member.id === selectedId}
            onClick={() => onSelect(member.id)}
            title={member.name}
            aria-label={member.name}
            aria-pressed={member.id === selectedId}
          >
            <VoiceAvatar
              id={member.id}
              name={member.name}
              cover={member.coverImage}
              kind={member.kind}
              size="s"
            />
          </button>
        ))}
        <button
          type="button"
          className="vr-pick vr-pick-add"
          onClick={onOpenCasting}
          title={t('addVoice')}
          aria-label={t('addVoice')}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path d="M5 0v10M0 5h10" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
      </div>

      <input
        className="vr-input"
        value={text}
        maxLength={VOICE_LINE_TEXT_MAX_LENGTH}
        onChange={(event) => setText(event.target.value)}
        placeholder={
          selected
            ? t('linePlaceholder', { name: selected.name })
            : t('pickSpeakerFirst')
        }
        disabled={!selected || sending}
        aria-label={t('lineInputLabel')}
      />

      <VoiceRoomDelivery
        delivery={delivery}
        onChange={onDeliveryChange}
        disabled={sending}
      />

      <button type="submit" className="vr-send" disabled={!canSend}>
        {sending ? t('sending') : t('generate')}
      </button>
    </form>
  )
}
