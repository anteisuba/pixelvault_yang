'use client'

import { useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { Play } from '@/components/icons'
import { cn } from '@/lib/utils'

import { useInViewAutoplay } from '@/hooks/use-in-view-autoplay'

interface LoraSampleVideoProps {
  /** 压缩片段（`civitaiClipUrl`）。静帧由宿主照常画在下面。 */
  src: string
  /** 角标放哪个角：默认左下；手机网格卡左下是底模胶囊，放右上。 */
  badgeCorner?: 'bottom-left' | 'top-right'
  /**
   * 被别的东西整块盖住时传 false（库网格上面开着详情页）：盖住的视频视野判断
   * 看不出来，不关就会在后台播、还占着同屏名额。
   */
  active?: boolean
}

function formatDuration(seconds: number): string {
  const whole = Math.max(1, Math.round(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/**
 * 视频样例叠在静帧上的那一层（lora-library.md §3「视频样例」）：进视野就静音
 * 循环（`useInViewAutoplay`，同屏有上限），开播时静帧 200 交叉淡成视频，停了淡
 * 回静帧。左下一个 ▶ 角标，时长读到了再写上（片段 `preload="none"`，开播前不
 * 知道多长）。宿主必须是 `relative` 的封面块。
 */
export function LoraSampleVideo({
  src,
  badgeCorner = 'bottom-left',
  active = true,
}: LoraSampleVideoProps) {
  const t = useTranslations('LoraWorkbench.browse')
  const ref = useRef<HTMLVideoElement>(null)
  const reducedMotion = useReducedMotion()
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState<number | null>(null)
  useInViewAutoplay(ref, active && !reducedMotion)

  return (
    <>
      <video
        ref={ref}
        src={src}
        muted
        loop
        playsInline
        preload="none"
        aria-hidden
        onPlaying={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(event) => {
          const { duration: seconds } = event.currentTarget
          if (Number.isFinite(seconds)) setDuration(seconds)
        }}
        className={cn(
          'absolute inset-0 size-full object-cover transition-opacity duration-base ease-linear motion-reduce:transition-none',
          playing ? 'opacity-100' : 'opacity-0',
        )}
      />
      <span
        role="img"
        aria-label={t('videoSample')}
        className={cn(
          'absolute inline-flex h-5 items-center gap-1 rounded-full bg-black/55 px-1.75 font-mono text-2xs text-white backdrop-blur-sm',
          badgeCorner === 'top-right' ? 'right-1.5 top-1.5' : 'bottom-2 left-2',
        )}
      >
        <Play weight="fill" className="size-2.5" aria-hidden />
        {duration !== null ? formatDuration(duration) : null}
      </span>
    </>
  )
}
