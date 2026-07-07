'use client'

import { memo } from 'react'
import { useTranslations } from 'next-intl'

import {
  SFX_DURATION_RANGE,
  SFX_PROMPT_INFLUENCE_RANGE,
  SFX_VARIANT_COUNTS,
} from '@/constants/audio-options'
import { useStudioForm } from '@/contexts/studio-context'
import { ParamSlider } from '@/components/ui/param-slider'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

/**
 * Sound-effect parameter controls (audio mode, sfx kind): clip length, loop,
 * and prompt influence. Reads / writes the shared studio form state; the
 * prompt itself is the sound description entered in the main prompt area.
 */
export const StudioSfxParams = memo(function StudioSfxParams() {
  const { state, dispatch } = useStudioForm()
  const t = useTranslations('audioParams')

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <span className="text-2xs font-medium text-muted-foreground/70">
          {t('sfxVariants')}
        </span>
        <ToggleGroup
          type="single"
          value={String(state.audioSfxVariantCount)}
          onValueChange={(value) => {
            if (value) {
              dispatch({
                type: 'SET_AUDIO_SFX_VARIANT_COUNT',
                payload: Number(value),
              })
            }
          }}
          aria-label={t('sfxVariants')}
          className="!grid w-full grid-cols-3"
        >
          {SFX_VARIANT_COUNTS.map((count) => (
            <ToggleGroupItem
              key={count}
              value={String(count)}
              className="px-2 text-center"
            >
              {`×${count}`}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-2xs text-muted-foreground">{t('sfxVariantsHint')}</p>
      </div>
      <ParamSlider
        label={t('sfxDuration')}
        hint={t('sfxDurationHint')}
        value={state.audioSfxDurationSeconds}
        min={SFX_DURATION_RANGE.min}
        max={SFX_DURATION_RANGE.max}
        step={SFX_DURATION_RANGE.step}
        onChange={(value) =>
          dispatch({ type: 'SET_AUDIO_SFX_DURATION', payload: value })
        }
        formatValue={(value) => `${value}s`}
      />
      <ParamSlider
        label={t('sfxPromptInfluence')}
        hint={t('sfxPromptInfluenceHint')}
        value={state.audioSfxPromptInfluence}
        min={SFX_PROMPT_INFLUENCE_RANGE.min}
        max={SFX_PROMPT_INFLUENCE_RANGE.max}
        step={SFX_PROMPT_INFLUENCE_RANGE.step}
        onChange={(value) =>
          dispatch({ type: 'SET_AUDIO_SFX_PROMPT_INFLUENCE', payload: value })
        }
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-2xs font-medium text-muted-foreground/70">
          {t('sfxLoop')}
        </span>
        <Switch
          checked={state.audioSfxLoop}
          onCheckedChange={(checked) =>
            dispatch({ type: 'SET_AUDIO_SFX_LOOP', payload: checked })
          }
          aria-label={t('sfxLoop')}
        />
      </div>
    </div>
  )
})
