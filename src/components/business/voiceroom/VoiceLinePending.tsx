'use client'

import { useTranslations } from 'next-intl'

import { parseVoiceLineEmotion } from '@/lib/voice-line-emotion'
import type { VoiceRoomCastMember } from '@/types/voiceroom'

import { VoiceAvatar } from './VoiceAvatar'

/**
 * 「话已经发出去了，声音还在路上」的占位气泡。
 *
 * Fish 的语音是**同步生成**的，那个往返要好几秒。没有它，用户点完生成会盯着一个
 * 毫无变化的屏幕，直到声音突然出现。
 *
 * ⚠ 它**不进 `detail.lines`**：真台词回来时 id 由服务端给，混进列表会让 React 换
 * key 重新挂载、入场动画再播一遍，看着像闪了一下。占位是独立的一个元素，真气泡
 * 该有的入场它本来就该有。
 */

interface VoiceLinePendingProps {
  cast: VoiceRoomCastMember[]
  speakerId: string
  text: string
}

export function VoiceLinePending({
  cast,
  speakerId,
  text,
}: VoiceLinePendingProps) {
  const t = useTranslations('VoiceRoom')
  const speaker = cast.find((member) => member.id === speakerId)

  // ⚠ 括号在服务端剥离，占位这里也要剥一次——否则真气泡一回来，「（耳语）」
  // 三个字会凭空消失，看着像内容被改了。同一份规则，同一个函数。
  const { text: clean } = parseVoiceLineEmotion(text)

  return (
    <div className="vr-msg">
      <VoiceAvatar
        id={speakerId}
        name={speaker?.name ?? ''}
        cover={speaker?.coverImage}
        kind={speaker?.kind}
      />
      <div className="vr-msg-body">
        <span className="vr-who">{speaker?.name}</span>
        <span className="vr-bubble">{clean}</span>
        <span className="vr-speaking">
          <span className="vr-speaking-dots" aria-hidden>
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          {t('speaking')}
        </span>
      </div>
    </div>
  )
}
