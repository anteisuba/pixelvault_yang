'use client'

import { ChevronDown, Mic } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { AUDIO_PACE, AUDIO_STYLE } from '@/constants/voice-cards'
import { AUDIO_EXPRESSIVENESS } from '@/constants/audio-options'
import { useStudioForm } from '@/contexts/studio-context'
import { useStudioAudioParamsProps } from '@/hooks/use-studio-audio-params'
import { cn } from '@/lib/utils'
import {
  StudioToolPopoverContent,
  StudioToolSurface,
  StudioToolSurfaceTrigger,
} from '@/components/business/studio-shared/primitives/tool-surface'

import { StudioAudioParams } from './StudioAudioParams'

interface StudioAudioSpeechParamsProps {
  disabled?: boolean
}

/**
 * StudioAudioSpeechParams —— 语音档在参数栏里的那几栏（切片 D）。
 *
 * 三种披露各用一次，全部照 `ParamIdiom`：
 *
 * - **音色**（形态 3：行 + 居中面板）—— 音色库要试听、要搜，天然是面板类。
 *   多角色音色与参考音频也在那个面板里：它们回答的都是「谁来念」。
 * - **朗读**（形态 2：触发器 + 浮层）—— 朗读风格 / 表现力 / 语速 / 停顿位置，
 *   四组枚举，触发器上把当前值写全（`正常 · 自动 · 旁白`）。
 * - **高级**（形态 1：折叠行）—— 输出与模型参数，`StudioAudioParams` 那一段
 *   自带折叠，直接放进来即可，不再外套一层。
 *
 * ⚠ 这些参数原来长在**音色库弹层的侧栏**里 —— 也就是说要调语速得先打开音色库。
 * 「谁来念」和「怎么念」是两件事，后者属于每一条都会改的参数，该常驻在栏里。
 */
export function StudioAudioSpeechParams({
  disabled,
}: StudioAudioSpeechParamsProps) {
  const { state, dispatch } = useStudioForm()
  const audioParamsProps = useStudioAudioParamsProps()
  const t = useTranslations('audioParams')
  const tBar = useTranslations('StudioToolbar')

  const readingOpen = state.panels.audioReading

  /**
   * 触发器摘要 —— 语速 · 表现力 · 朗读风格。
   *
   * ⚠ 「默认」这一档不印：`AUDIO_STYLE.NONE` 的文案就是「默认」，把它写进摘要
   * 等于用一个词占住位置却什么也没说。同理表现力的 `auto` 印「自动」是有信息的
   * （它会跟着情绪走），所以保留。
   */
  const summary = [
    t(
      state.audioPace === AUDIO_PACE.SLOW
        ? 'paceSlow'
        : state.audioPace === AUDIO_PACE.FAST
          ? 'paceFast'
          : 'paceNormal',
    ),
    state.audioExpressiveness === AUDIO_EXPRESSIVENESS.AUTO
      ? t('expressivenessAuto')
      : state.audioExpressiveness === AUDIO_EXPRESSIVENESS.RESTRAINED
        ? t('expressivenessRestrained')
        : state.audioExpressiveness === AUDIO_EXPRESSIVENESS.DRAMATIC
          ? t('expressivenessDramatic')
          : t('expressivenessNatural'),
    state.audioEmotion === AUDIO_STYLE.NONE ? null : state.audioEmotion,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      {/* 音色 —— 形态 3。行不是丸：行装得下音色名，缺音色一眼看得出来。 */}
      <div className="flex flex-col gap-1.5">
        <span className="text-2xs font-medium text-muted-foreground/70">
          {tBar('voice')}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            dispatch({ type: 'OPEN_PANEL', payload: 'voiceSelector' })
          }
          className={cn(
            'flex h-9 w-full items-center gap-2 rounded-lg border border-border/60 bg-background px-3 text-xs font-medium text-foreground',
            'transition-colors duration-fast ease-standard hover:border-primary/25',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
            'disabled:pointer-events-none disabled:opacity-50',
          )}
        >
          <Mic className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {state.voiceId ? tBar('voiceSelected') : tBar('voice')}
          </span>
        </button>
      </div>

      {/* 朗读 —— 形态 2。收起时把这一组的当前值写全。 */}
      <div className="flex flex-col gap-1.5">
        <span className="text-2xs font-medium text-muted-foreground/70">
          {t('readingLabel')}
        </span>
        <StudioToolSurface
          open={readingOpen}
          onOpenChange={(nextOpen) =>
            dispatch({
              type: nextOpen ? 'OPEN_PANEL' : 'CLOSE_PANEL',
              payload: 'audioReading',
            })
          }
        >
          <StudioToolSurfaceTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label={t('readingLabel')}
              className={cn(
                'flex h-9 w-full items-center gap-2 rounded-lg border border-border/60 bg-background px-3 text-xs font-medium text-foreground',
                'transition-colors duration-fast ease-standard hover:border-primary/25',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
                'disabled:pointer-events-none disabled:opacity-50',
                readingOpen && 'border-primary/30 bg-muted/45',
              )}
            >
              <span className="truncate">{summary}</span>
              <ChevronDown
                className={cn(
                  'ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform duration-base ease-standard',
                  readingOpen && 'rotate-180',
                )}
              />
            </button>
          </StudioToolSurfaceTrigger>
          <StudioToolPopoverContent
            size="action"
            side="bottom"
            align="start"
            label={t('readingLabel')}
          >
            <div className="flex flex-col gap-4">
              <StudioAudioParams {...audioParamsProps} section="reading" />
              {/* 停顿位置也是「怎么念」—— 与语速表现力同一个浮层，不另开一条 */}
              <StudioAudioParams {...audioParamsProps} section="pause" />
            </div>
          </StudioToolPopoverContent>
        </StudioToolSurface>
      </div>

      {/* 高级 —— 形态 1。这一段自带折叠行（标签 + 摘要 + ⌄），不再外套一层。 */}
      <StudioAudioParams {...audioParamsProps} section="advanced" />
    </>
  )
}
