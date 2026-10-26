'use client'

import { useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'

import { useChatBubbleReveal } from '@/hooks/use-chat-bubble-reveal'
import { parseVoiceLineEmotion } from '@/lib/voice-line-emotion'
import { chatBubbles, withoutPictureHandles } from '@/lib/voiceroom-chat-prompt'
import type { VoiceRoomCastMember } from '@/types/voiceroom'

import { VoiceAvatar } from './VoiceAvatar'
import { VoiceLineText } from './VoiceLineText'

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
  /**
   * 聊天：她还在写（owner 10-23「先一个字一个字打出来」）。写着的时候没有「正在开口」，
   * 末尾一根光标；写完换成真台词，那时才轮到声音。
   */
  typing?: boolean
  /** 聊天：写完了（真台词已回来），剩下的气泡按节奏出完就 `onRevealed`。 */
  done?: boolean
  onRevealed?: () => void
}

export function VoiceLinePending({
  cast,
  speakerId,
  text,
  typing = false,
  done = false,
  onRevealed,
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
      <div className="vr-msg-body" aria-live={typing ? 'polite' : undefined}>
        <span className="vr-who">{speaker?.name}</span>
        {typing ? (
          <TypingBubbles text={text} done={done} onRevealed={onRevealed} />
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  )
}

/**
 * 她正在写（10-26「更像真人」F）：一行一个气泡，正在写的那个一个字一个字长、末尾一根光标；
 * 下一个还没露面时摆一个「正在输入」的三点气泡。
 */
function TypingBubbles({
  text,
  done,
  onRevealed,
}: {
  text: string
  done: boolean
  onRevealed?: () => void
}) {
  const bubbles = chatBubbles(withoutPictureHandles(text))
  const shown = useChatBubbleReveal(bubbles, done, onRevealed)
  const endRef = useRef<HTMLSpanElement | null>(null)
  // 新气泡 / 三点露面不改字数，聊天流那边的「滚到底」看不见：这里自己往下带一下。
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [shown])
  const visible = bubbles.slice(0, shown)
  // 前一个写完、下一个还没开头（刚换行）也算在路上。
  const waiting =
    shown < bubbles.length ||
    (!done && visible.length > 0 && /\n\s*$/.test(text))

  if (visible.length === 0)
    return (
      <span className="vr-bubble vr-typing">
        <VoiceLineText text="" />
      </span>
    )
  return (
    <>
      {visible.map((bubble, index) => (
        <span
          key={index}
          className={
            index === visible.length - 1 && !done && !waiting
              ? 'vr-bubble vr-typing'
              : 'vr-bubble'
          }
        >
          <VoiceLineText text={bubble} />
        </span>
      ))}
      {waiting ? (
        <span className="vr-bubble vr-bubble-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      ) : null}
      <span ref={endRef} aria-hidden />
    </>
  )
}
