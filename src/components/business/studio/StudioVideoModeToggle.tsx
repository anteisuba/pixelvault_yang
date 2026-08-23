'use client'

import { memo } from 'react'
import { useTranslations } from 'next-intl'

import { useStudioVideoMode } from '@/hooks/use-studio-video-mode'
import { cn } from '@/lib/utils'

interface StudioVideoModeToggleProps {
  disabled?: boolean
}

/**
 * 视频「用途」分段控件 —— 把端点这一维从模型选择器里拆出来。
 *
 * ## 为什么需要它
 *
 * 每个视频型号有两个端点（关键帧 / 参考），但目录里 `MODEL_VARIANTS` 把它们映到
 * **同一个型号**，而选择器第三栏的行标签只印渠道名。结果是同一渠道出现两行同名
 * 条目：Seedance 2.0 Fast 第三栏有 6 行（3 渠道 × 2 端点），用户看到
 * 「fal / 火山 / BytePlus / fal / 火山 / BytePlus」，无从分辨。
 *
 * 画布早就解决了：用途是节点上的显式档位，选择器只管「型号 + 渠道」。这个组件把
 * 那个档位补给 Studio，第三栏随之降到 3 行。
 *
 * ## 为什么是分段而不是开关
 *
 * 一个标着「关键帧」的 on/off，"关" 读起来是「不要关键帧」而不是「改用参考图」——
 * 被关掉的那一档没有名字。分段里每一档都写着自己的名字，且第三档（多图参考）
 * 天然放得下，开关放不下。
 *
 * 状态与切档逻辑全在 `useStudioVideoMode`，这里只负责画 —— 见那边的判据注释。
 */
export const StudioVideoModeToggle = memo(function StudioVideoModeToggle({
  disabled = false,
}: StudioVideoModeToggleProps) {
  const tMode = useTranslations('StudioNode.videoComposer.sidecar.mode')
  const tBar = useTranslations('StudioToolbar')
  const { mode, modes, switchTo } = useStudioVideoMode()

  if (modes.length < 2) return null

  return (
    <div
      role="radiogroup"
      aria-label={tBar('videoMode')}
      className="flex h-9 items-center gap-0.5 rounded-lg border border-border/60 p-0.5"
    >
      {modes.map((option) => {
        const active = option === mode
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => switchTo(option)}
            className={cn(
              'h-8 rounded-md px-2.5 text-sm font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              'disabled:cursor-not-allowed disabled:opacity-50',
              active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tMode(option)}
          </button>
        )
      })}
    </div>
  )
})
