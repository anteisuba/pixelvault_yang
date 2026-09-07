'use client'

import { useRef, useState } from 'react'
import { Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@/lib/utils'

/**
 * 卡上的视频表面（台账 B7）。
 *
 * 台账原话：「媒体窗是浏览器**原生 `<video>` 控件**（灰底 mute 图标、原生进度条、
 * ⋮ 菜单），与其它卡的语言完全不搭；且首帧未加载时是纯黑窗 + 一个转圈」。
 *
 * ⚠ 但这不是一个「要设计一套播放器」的活 —— 画布上**早就有**卡上该有的放法：
 * `VideoReferenceNode` 一直是无 `controls` + 自带播放/静音钮 + `preload="metadata"`。
 * 只是 `SeedanceNode` 与 `NodeMediaPreview` 没用它，各自写了一份带 `controls` 的。
 * 又是「没有共享件」那个老毛病（同 #14 的四份「生成中」）。这里把它抽出来。
 *
 * 两个细节都是有理由的，别顺手拿掉：
 *
 * · **`preload="metadata"`** —— 这才是「首帧未加载是纯黑窗」的真正解。没有它，
 *   浏览器可能一帧都不取，`poster` 又不一定有（`videoThumbnailUrl` 不是每条
 *   生成链路都会写），于是窗里就是纯黑。
 * · **不给 `controls`** —— 原生控件在 400px 宽的卡上又挤又是另一套语言；卡内是
 *   纯媒体（规格 §12.1），完整的播放/拖拽交给详情面板（⤢）。卡上只留「放一下
 *   看看」需要的两颗钮。
 */

export interface NodeVideoSurfaceProps {
  src: string
  /** 首帧图。没有也不要紧 —— `preload="metadata"` 会去取一帧。 */
  poster?: string
  /** `object-cover`（填满，会裁）还是 `object-contain`（完整，留边）。 */
  fit?: 'cover' | 'contain'
  /** 视频元数据到手时回报宽高比，调用方可据此调整窗形。 */
  onAspectRatio?: (ratio: number) => void
  /** 叠在表面上的额外元素（替换钮之类）。 */
  children?: React.ReactNode
  className?: string
}

export function NodeVideoSurface({
  src,
  poster,
  fit = 'contain',
  onAspectRatio,
  children,
  className,
}: NodeVideoSurfaceProps) {
  const t = useTranslations('StudioNode.videoReference')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(true)

  // 换片（src 变了）时把播放态归零 —— <video> 的内部状态不归 React 管，
  // 不重置的话上一条片子播到一半换片，按钮还显示「暂停」。
  //
  // ⚠ 用**渲染期比对**而不是 `useEffect(() => setIsPlaying(false), [src])`：
  // 后者会被 `react-hooks/set-state-in-effect` 判为 error（在 effect 里直接
  // setState 会多跑一轮渲染）。这是 React 官方给「prop 变了要顺带调整 state」
  // 的写法，同一轮渲染内就改完，不会闪一帧旧状态。
  // （`VideoReferenceNode` 里那份旧的仍是 effect 写法 —— 早于这条规则，没动。）
  const [prevSrc, setPrevSrc] = useState(src)
  if (src !== prevSrc) {
    setPrevSrc(src)
    setIsPlaying(false)
  }

  const togglePlay = () => {
    const el = videoRef.current
    if (!el) return
    if (el.paused) void el.play()
    else el.pause()
  }

  return (
    <>
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        muted={isMuted}
        playsInline
        preload="metadata"
        draggable={false}
        className={cn(
          'size-full',
          fit === 'cover' ? 'object-cover' : 'object-contain',
          className,
        )}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onLoadedMetadata={(event) => {
          const { videoWidth, videoHeight } = event.currentTarget
          if (videoWidth > 0 && videoHeight > 0) {
            onAspectRatio?.(videoWidth / videoHeight)
          }
        }}
      />

      {/* 播放/暂停 —— 居中，`nodrag` 免得点它变成拖卡；播放中淡出、hover 再现。 */}
      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? t('pause') : t('play')}
        title={isPlaying ? t('pause') : t('play')}
        className={cn(
          'nodrag absolute left-1/2 top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-node-canvas/70 text-node-foreground backdrop-blur transition-opacity',
          isPlaying && 'opacity-0 group-hover:opacity-100',
        )}
      >
        {isPlaying ? (
          <Pause className="size-5" />
        ) : (
          <Play className="ml-0.5 size-5" />
        )}
      </button>

      {/* 声音开关 —— 左下。默认静音：一屏可能同时有好几张视频卡。 */}
      <button
        type="button"
        onClick={() => setIsMuted((muted) => !muted)}
        aria-label={isMuted ? t('unmute') : t('mute')}
        title={isMuted ? t('unmute') : t('mute')}
        className="nodrag absolute bottom-2 left-2 z-canvas-selection flex size-8 items-center justify-center rounded-full bg-node-canvas/80 text-node-foreground backdrop-blur transition-colors hover:bg-node-canvas"
      >
        {isMuted ? (
          <VolumeX className="size-4" />
        ) : (
          <Volume2 className="size-4" />
        )}
      </button>

      {children}
    </>
  )
}
