'use client'

import { memo, useMemo } from 'react'
import { useTranslations } from 'next-intl'

import { AUDIO_KINDS, type AudioKind } from '@/constants/audio-options'
import { getAvailableAudioModels } from '@/constants/models'
import { resolveAudioKind } from '@/constants/models/audio'
import { useStudioForm } from '@/contexts/studio-context'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const KIND_LABEL_KEYS: Record<AudioKind, string> = {
  speech: 'kindSpeech',
  sfx: 'kindSfx',
  music: 'kindMusic',
}

/**
 * Second-level audio kind switcher (speech / sfx / music). Only kinds with an
 * available model are shown, and it hides entirely until there are ≥2 — so it
 * appears the moment SFX ships and stays out of the way when there's nothing to
 * switch. Switching also re-selects a model of the new kind.
 */
export const StudioAudioKindSwitcher = memo(function StudioAudioKindSwitcher() {
  const { state, dispatch } = useStudioForm()
  const t = useTranslations('audioParams')

  const availableKinds = useMemo(() => {
    const kinds = new Set(
      getAvailableAudioModels().map((model) => resolveAudioKind(model)),
    )
    return AUDIO_KINDS.filter((kind) => kinds.has(kind))
  }, [])

  if (availableKinds.length < 2) return null

  const handleChange = (kind: string) => {
    if (!kind || kind === state.audioKind) return
    const firstModel = getAvailableAudioModels().find(
      (model) => resolveAudioKind(model) === kind,
    )
    dispatch({ type: 'SET_AUDIO_KIND', payload: kind })
    if (firstModel) {
      dispatch({ type: 'SET_OPTION_ID', payload: `workspace:${firstModel.id}` })
    }
  }

  return (
    <ToggleGroup
      type="single"
      value={state.audioKind}
      onValueChange={handleChange}
      aria-label={t('kindLabel')}
      className="h-9 shrink-0"
    >
      {availableKinds.map((kind) => (
        <ToggleGroupItem key={kind} value={kind}>
          {t(KIND_LABEL_KEYS[kind])}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
})
