'use client'

import { useRef } from 'react'
import { useTranslations } from 'next-intl'

import { VOICE_ROOM_PREVIEW_RING_RADIUS } from '@/constants/voiceroom'

import { VoiceAvatar } from './VoiceAvatar'

/**
 * 选角面板里的一张音色卡 —— **大头像画廊卡，点脸即试听**。
 *
 * 样机 v4.5 的判断：一张卡上只该有一个「主要动作」。脸占了 128px 高的一整块，
 * 点它就是听；请进房间是脚下那颗按钮；收藏是右上角的星。三件事三个落点，不需要
 * 任何一个长成按钮的样子来互相竞争。
 *
 * 试听中的进度画成**环**而不是进度条：环套着脸，读起来是「这张脸正在说话」，
 * 而进度条会变成卡上第四件独立的东西。
 */

const RING_CIRCUMFERENCE = 2 * Math.PI * VOICE_ROOM_PREVIEW_RING_RADIUS

export interface VoiceCastCardProps {
  /** 头像取色用的稳定标识。 */
  id: string
  name: string
  cover?: string | null
  tags: string
  /** 入场接力的序号（20ms/张）。 */
  index: number
  playing: boolean
  /** 0–1；只有 `playing` 时才有意义。 */
  progress: number
  joined: boolean
  joining: boolean
  /** 班底满了：按钮变成说明而不是消失，让人知道为什么点不了。 */
  full: boolean
  /** null = 这副嗓子没有可试听的示例。 */
  onPreview: (() => void) | null
  /**
   * 请进房间。参数是**这张卡的大头像节点**——飞进托盘的起点要当场量，
   * 由卡片自己交出来，宿主不必去 DOM 里摸。
   */
  onJoin: (avatarNode: HTMLElement | null) => void
  /** null = 这一档不提供收藏（收藏 tab / 克隆 tab 自己就是结果）。 */
  favorite?: { on: boolean; pending: boolean; onToggle: () => void } | null
}

export function VoiceCastCard({
  id,
  name,
  cover,
  tags,
  index,
  playing,
  progress,
  joined,
  joining,
  full,
  onPreview,
  onJoin,
  favorite,
}: VoiceCastCardProps) {
  const t = useTranslations('VoiceRoom')
  const rootRef = useRef<HTMLDivElement | null>(null)

  return (
    <div
      ref={rootRef}
      className="vr-vc"
      data-playing={playing || undefined}
      style={{ '--vr-d': index } as React.CSSProperties}
    >
      {favorite ? (
        <button
          type="button"
          className="vr-star"
          data-on={favorite.on || undefined}
          disabled={favorite.pending}
          aria-label={favorite.on ? t('unfavorite') : t('favorite')}
          title={favorite.on ? t('unfavorite') : t('favorite')}
          onClick={favorite.onToggle}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 2.5l2.9 5.9 6.5.95-4.7 4.6 1.1 6.5-5.8-3.05-5.8 3.05 1.1-6.5-4.7-4.6 6.5-.95z" />
          </svg>
        </button>
      ) : null}

      <button
        type="button"
        className="vr-face"
        disabled={!onPreview}
        aria-label={playing ? t('pause') : t('preview')}
        onClick={() => onPreview?.()}
      >
        {/* 两圈错开半个周期的脉冲，让「正在响」这件事在余光里也看得见。 */}
        <span className="vr-pulse" aria-hidden />
        <span className="vr-pulse" aria-hidden />

        <VoiceAvatar id={id} name={name} cover={cover} size="l" />

        <svg className="vr-ring" viewBox="0 0 100 100" aria-hidden>
          <circle
            cx="50"
            cy="50"
            r={VOICE_ROOM_PREVIEW_RING_RADIUS}
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
            transform="rotate(-90 50 50)"
          />
        </svg>

        {onPreview ? (
          <span className="vr-glyph" aria-hidden>
            {playing ? (
              <svg width="8" height="10" viewBox="0 0 8 10">
                <path d="M0 0h2.5v10H0zM5.5 0H8v10H5.5z" fill="currentColor" />
              </svg>
            ) : (
              <svg width="9" height="10" viewBox="0 0 9 10">
                <path d="M0.5 0.5l8 4.5-8 4.5z" fill="currentColor" />
              </svg>
            )}
          </span>
        ) : null}
      </button>

      <div className="vr-vc-meta">
        <span className="vr-vc-name" title={name}>
          {name}
        </span>
        {/* 试听中把标签换成跳动的三根条：同一行地皮，两种状态。 */}
        {playing ? (
          <span className="vr-vc-eq">
            <span className="vr-vc-bars" aria-hidden>
              <i />
              <i />
              <i />
            </span>
            {t('previewing')}
          </span>
        ) : (
          <span className="vr-vc-tags">{tags || t('noSample')}</span>
        )}
      </div>

      <button
        type="button"
        className="vr-vc-join"
        disabled={joined || joining || full}
        onClick={() =>
          onJoin(
            rootRef.current?.querySelector<HTMLElement>('.vr-avatar') ?? null,
          )
        }
      >
        {joined
          ? t('alreadyInCast')
          : joining
            ? t('joining')
            : full
              ? t('castFull')
              : t('joinRoom')}
      </button>
    </div>
  )
}

/** 扩载时先占位的骨架卡——脉动 1.4s，真卡到了用同一套 stagger 接管。 */
export function VoiceCastSkeleton({ index }: { index: number }) {
  return (
    <div
      className="vr-vc vr-vc-skel"
      aria-hidden
      style={{ '--vr-d': index } as React.CSSProperties}
    >
      <div className="vr-face">
        <span className="vr-skel-face" />
      </div>
      <div className="vr-vc-meta">
        <span className="vr-skel-line" data-w="60" />
        <span className="vr-skel-line" data-w="40" />
      </div>
      <div className="vr-skel-btn" />
    </div>
  )
}
