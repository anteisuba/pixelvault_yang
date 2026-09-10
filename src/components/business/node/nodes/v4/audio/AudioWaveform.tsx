'use client'

/**
 * 矮卡与快速听里的**波形**（画板 `AudioStates` / `AudioQuickListen` 的 `.wv`）。
 *
 * 一排等宽细柱：已播过的那一段用前景色画满，其余用弱一档的 `muted-foreground`。
 * 柱高由 `buildAudioWaveformBars` 按地址**确定性**生成 —— ⛔ 不在渲染里摇随机数
 * （那会让同一段声音每重渲一次就换一条波形）。
 *
 * ⚠ 这是**装饰波**不是真实频谱（真频谱要解码整段音频）。定位与 legacy 声纹一样，
 * 但形态换成了画板的柱状：柱子能逐根变色，播放头因此不需要另画一条线。
 */

import { cn } from '@/lib/utils'

import { AUDIO_CARD, buildAudioWaveformBars } from './audio-node-model'

export interface AudioWaveformProps {
  /** 波形的种子（用这一版的地址；空态给节点 id）。 */
  readonly seed: string
  /** 播放进度 0–1。 */
  readonly progress?: number
  readonly barCount?: number
  readonly height?: number
  readonly className?: string
}

export function AudioWaveform({
  seed,
  progress = 0,
  barCount = AUDIO_CARD.barCount,
  height = AUDIO_CARD.waveformHeight,
  className,
}: AudioWaveformProps) {
  const bars = buildAudioWaveformBars(seed, barCount)
  const clamped = Math.min(
    1,
    Math.max(0, Number.isFinite(progress) ? progress : 0),
  )
  const playedCount = Math.round(clamped * bars.length)

  return (
    <div
      aria-hidden
      data-audio-waveform
      data-played={playedCount}
      className={cn('flex items-center gap-0.5', className)}
      style={{ height }}
    >
      {bars.map((ratio, index) => (
        <i
          key={index}
          data-played={index < playedCount ? 'true' : 'false'}
          className={cn(
            'block w-0.75 shrink-0 rounded-full',
            index < playedCount ? 'bg-foreground' : 'bg-muted-foreground/55',
          )}
          style={{ height: Math.round(ratio * height) }}
        />
      ))}
    </div>
  )
}
