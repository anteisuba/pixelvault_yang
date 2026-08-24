'use client'

import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  SFX_DURATION_RANGE,
  SFX_PROMPT_INFLUENCE_RANGE,
  SFX_VARIANT_COUNTS,
} from '@/constants/audio-options'
import { useStudioForm } from '@/contexts/studio-context'
import { ParamSlider } from '@/components/ui/param-slider'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import {
  StudioToolPopoverContent,
  StudioToolSurface,
  StudioToolSurfaceTrigger,
  studioChipActiveClass,
  studioSegButtonClass,
  studioSegInactiveClass,
} from '@/components/business/studio-shared/primitives/tool-surface'

interface StudioSfxSpecPopoverProps {
  disabled?: boolean
}

/**
 * StudioSfxSpecPopover —— 音效档的「规格」单一触发器：变体数 · 时长 ·
 * 提示词贴合度 · 无缝循环，触发器上写全（`×4 · 5.0s · 循环`）。
 *
 * 与图片的 `StudioSpecPopover`、视频的 `StudioVideoSpecPopover` 是**同一个形态**
 * （参数栏三种披露里的形态 2）：三个模态的「规格」长得一样、位置一样、收起时
 * 都把当前值写全，换模态只换栏位内容不换骨架。
 *
 * ⚠ 它替掉的 `StudioSfxParamsPopover` 是一颗写着「设置」的工具条丸 —— 收起时
 * 一个值都不印，要点开才知道这次会出几条、多长。「设置」也不是一个名词：
 * 参数区回答的是「下一版长什么样」，那正是「规格」。
 *
 * ⚠ 变体数是音效档**唯一**有矩阵的地方（`generate()` 里只有 `audio.variantCount`
 * 会分叉成多条），所以它属于规格轴，和图片的「每模型几张」同一个位置。
 */
export function StudioSfxSpecPopover({ disabled }: StudioSfxSpecPopoverProps) {
  const { state, dispatch } = useStudioForm()
  const t = useTranslations('StudioV2')
  const tAudio = useTranslations('audioParams')

  const open = state.panels.sfxParams

  const summary = [
    `×${state.audioSfxVariantCount}`,
    `${state.audioSfxDurationSeconds}s`,
    state.audioSfxLoop ? tAudio('sfxLoop') : null,
  ]
    .filter(Boolean)
    .join(' · ')

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
            payload: 'sfxParams',
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
            <span className="truncate">{summary}</span>
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
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-2xs font-medium text-muted-foreground/70">
                {tAudio('sfxVariants')}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {SFX_VARIANT_COUNTS.map((count) => (
                  <button
                    key={count}
                    type="button"
                    role="radio"
                    aria-checked={state.audioSfxVariantCount === count}
                    onClick={() =>
                      dispatch({
                        type: 'SET_AUDIO_SFX_VARIANT_COUNT',
                        payload: count,
                      })
                    }
                    className={cn(
                      studioSegButtonClass,
                      state.audioSfxVariantCount === count
                        ? studioChipActiveClass
                        : studioSegInactiveClass,
                    )}
                  >
                    {`×${count}`}
                  </button>
                ))}
              </div>
              <p className="text-2xs text-muted-foreground">
                {tAudio('sfxVariantsHint')}
              </p>
            </div>

            <ParamSlider
              label={tAudio('sfxDuration')}
              value={state.audioSfxDurationSeconds}
              min={SFX_DURATION_RANGE.min}
              max={SFX_DURATION_RANGE.max}
              step={SFX_DURATION_RANGE.step}
              disabled={disabled}
              onChange={(value) =>
                dispatch({ type: 'SET_AUDIO_SFX_DURATION', payload: value })
              }
              formatValue={(value) => `${value}s`}
            />

            <ParamSlider
              label={tAudio('sfxPromptInfluence')}
              value={state.audioSfxPromptInfluence}
              min={SFX_PROMPT_INFLUENCE_RANGE.min}
              max={SFX_PROMPT_INFLUENCE_RANGE.max}
              step={SFX_PROMPT_INFLUENCE_RANGE.step}
              disabled={disabled}
              onChange={(value) =>
                dispatch({
                  type: 'SET_AUDIO_SFX_PROMPT_INFLUENCE',
                  payload: value,
                })
              }
            />

            <div className="flex items-center justify-between gap-3">
              <span className="text-2xs font-medium text-muted-foreground/70">
                {tAudio('sfxLoop')}
              </span>
              <Switch
                checked={state.audioSfxLoop}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  dispatch({ type: 'SET_AUDIO_SFX_LOOP', payload: checked })
                }
                aria-label={tAudio('sfxLoop')}
              />
            </div>
          </div>
        </StudioToolPopoverContent>
      </StudioToolSurface>
    </div>
  )
}
