'use client'

import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { MUSIC_DURATION_RANGE } from '@/constants/audio-options'
import { useStudioForm } from '@/contexts/studio-context'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import {
  StudioToolPopoverContent,
  StudioToolSurface,
  StudioToolSurfaceTrigger,
} from '@/components/business/studio-shared/primitives/tool-surface'

interface StudioMusicSpecPopoverProps {
  disabled?: boolean
}

/** `m:ss` —— 超过一分钟的时长读秒数没有直觉。 */
function formatMusicDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * StudioMusicSpecPopover —— 音乐档的「规格」：只有时长一档。
 *
 * ## 这一颗补的是一个「字段活着、门没开」
 *
 * ⚠ 适配器（`elevenlabs.adapter.ts`）早就读 `durationSeconds` 并换算成
 * `music_length_ms`，而 `StudioPromptArea` 只在**音效**那一支传它 ——
 * 于是今天所有音乐都是适配器兜底的 30 秒，用户没有任何办法改。
 * 与之配套的另一半是：音乐档此前连自己的栏位都没有，切过去显示的是语音那排丸
 * （音色 / 克隆 / 转脚本），见 Main 板 E7。
 *
 * ## 为什么是滑条不是药丸
 *
 * 区间 5–600 秒 · 步长 5 秒 = 120 档，铺成药丸是一面墙（与视频时长同一条判据：
 * 超过 4 档换滑条）。默认 30 秒与适配器的兜底同一个数，两处不各写各的。
 */
export function StudioMusicSpecPopover({
  disabled,
}: StudioMusicSpecPopoverProps) {
  const { state, dispatch } = useStudioForm()
  const t = useTranslations('StudioV2')
  const tAudio = useTranslations('audioParams')

  const open = state.panels.musicSpec
  const seconds = state.audioMusicDurationSeconds

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-2xs font-medium text-muted-foreground/70">
        {t('specLabel')}
      </span>
      <StudioToolSurface
        open={open}
        onOpenChange={(nextOpen) =>
          dispatch({
            type: nextOpen ? 'OPEN_PANEL' : 'CLOSE_PANEL',
            payload: 'musicSpec',
          })
        }
      >
        <StudioToolSurfaceTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={t('specLabel')}
            className={cn(
              'flex h-9 w-full items-center gap-2 rounded-lg border border-border/60 bg-background px-3 text-xs font-medium text-foreground',
              'transition-colors duration-fast ease-standard hover:border-primary/25',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
              'disabled:pointer-events-none disabled:opacity-50',
              open && 'border-primary/30 bg-muted/45',
            )}
          >
            <span className="truncate">{formatMusicDuration(seconds)}</span>
            <ChevronDown
              className={cn(
                'ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform duration-base ease-standard',
                open && 'rotate-180',
              )}
            />
          </button>
        </StudioToolSurfaceTrigger>
        <StudioToolPopoverContent
          size="small"
          className="w-64"
          side="bottom"
          align="start"
          label={t('specLabel')}
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-2xs font-medium text-muted-foreground/70">
                {tAudio('sfxDuration')}
              </span>
              <span className="font-mono text-2xs tabular-nums text-muted-foreground">
                {formatMusicDuration(seconds)}
              </span>
            </div>
            <Slider
              min={MUSIC_DURATION_RANGE.min}
              max={MUSIC_DURATION_RANGE.max}
              step={MUSIC_DURATION_RANGE.step}
              value={[seconds]}
              disabled={disabled}
              aria-label={tAudio('sfxDuration')}
              onValueChange={([value]) => {
                if (value !== undefined) {
                  dispatch({
                    type: 'SET_AUDIO_MUSIC_DURATION',
                    payload: value,
                  })
                }
              }}
            />
            <p className="text-2xs text-muted-foreground">
              {tAudio('musicDurationHint')}
            </p>
          </div>
        </StudioToolPopoverContent>
      </StudioToolSurface>
    </div>
  )
}
