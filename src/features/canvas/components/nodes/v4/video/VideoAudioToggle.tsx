'use client'

/**
 * 画布视频卡提示词栏上的**声音开关**（D2 ④ 定案点 6，画板 `DesignD2Spec` 的
 * 「画布提示词栏 · 结果」那一帧：模型 chip · 规格 chip · 竖线 · 声音图标 · 竖线 ·
 * 生成）。
 *
 * ⚠ 它**不进 chip、也不进规格弹层的「更多」**：chip 答的是「下一版长什么样」，
 * 而出不出声是这一枪的开关 —— 一个 18px 的图标就把当前状态说完了，折进弹层反而
 * 要点两下才知道。
 *
 * ⚠ 模型这条端点发不出 `generateAudio` 时**整颗不渲染**（判据在
 * `videoSupportsGeneratedAudio`）：画一颗按下去什么都不会发生的开关比没有更糟。
 * 与弹层里「不支持的档灰显划线」不是一回事 —— 那是可解释的缺档，这是这条线路
 * 根本没有这个字段。
 */

import { useTranslations } from 'next-intl'

import { SpeakerHigh, SpeakerSlash } from '@/components/icons'
import { cn } from '@/lib/utils'

export interface VideoAudioToggleProps {
  readonly value: boolean
  onChange(next: boolean): void
  readonly disabled?: boolean
}

export function VideoAudioToggle({
  value,
  onChange,
  disabled = false,
}: VideoAudioToggleProps) {
  const t = useTranslations('StudioNode.v4.video')
  const Icon = value ? SpeakerHigh : SpeakerSlash

  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={value ? t('frame.audioOn') : t('frame.audioOff')}
      title={value ? t('frame.audioOn') : t('frame.audioOff')}
      data-video-audio-toggle
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={cn(
        'nodrag nopan flex size-7 shrink-0 items-center justify-center rounded-full transition-colors duration-fast ease-standard',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
        'disabled:pointer-events-none disabled:opacity-50',
        value
          ? 'text-foreground hover:bg-surface-fill'
          : 'text-muted-foreground hover:bg-surface-fill hover:text-foreground',
      )}
    >
      <Icon aria-hidden className="size-4.5" />
    </button>
  )
}
