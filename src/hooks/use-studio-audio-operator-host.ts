'use client'

import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef } from 'react'

import { PROJECT_RULE_KIND_IDS } from '@/constants/assistant-operator'
import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import {
  DEFAULT_AUDIO_KIND,
  isAudioKind,
  type AudioKind,
} from '@/constants/audio-options'
import { getModelMessageKey, isBuiltInModel } from '@/constants/models'
import { STUDIO_OPERATOR_WORKBENCH_COLUMN_ANCHOR } from '@/constants/studio-assistant-operator'
import { useStudioForm } from '@/contexts/studio-context'
import type { StudioOperatorHost } from '@/contexts/studio-operator-host'
import { useAudioModelOptionsFor } from '@/hooks/use-audio-model-options'
import { useStudioOperatorFace } from '@/hooks/use-studio-operator-face'
import { setOperatorPrimed } from '@/hooks/use-studio-operator-store'
import { revertAssistantAssetWriteAPI } from '@/lib/api-client/assistant-operator'
import { deleteAssistantMemoryAPI } from '@/lib/api-client/assistant-memories'
import { deleteProjectRuleAPI } from '@/lib/api-client/assistant-persona'
import { setOperatorGenerationLabel } from '@/lib/studio-operator-label'
import type { StudioOperatorApplyContext } from '@/lib/studio-operator-apply'
import {
  audioPatchActions,
  buildAudioOperatorSnapshot,
} from '@/lib/studio-operator-audio-snapshot'
import type { StudioModelOption } from '@/types/model-option'
import type { StudioOperatorResultItem } from '@/types/studio-assistant-operator'

/**
 * 操作员面板在**配音台**（`/studio/audio`）上的宿主（第 9b 步，owner 10-23）。
 *
 * ⭐ 快照 = 要念的字 + 当前模型 + 配音那一块（`buildAudioOperatorSnapshot`）；落笔 = `set_audio`
 *   一格一个 action（`audioPatchActions`）与提示词那只手（`dispatch`）。
 * ⭐ 扳机与人手点生成键同一条路（`REQUEST_GENERATE`）；配音台一律出确认卡，⛔ 不跟自动生成开关。
 * ⚠ 参考图、出声开关、挂链接这几只手配音台上没有，写成空函数只为满足契约形状（同角色页宿主）。
 * ⚠ 结果行卡先不给（`results` 空）：结果在舞台上听，面板上的结果卡是为图做的。
 */

const NO_RESULTS: readonly StudioOperatorResultItem[] = []
const NO_REFERENCES: StudioOperatorHost['referenceImages'] = []

export function useStudioAudioOperatorHost(): StudioOperatorHost {
  const { state, dispatch } = useStudioForm()
  const selectedOptionId = state.selectedOptionId ?? null
  const speech = useAudioModelOptionsFor('speech', selectedOptionId)
  const sfx = useAudioModelOptionsFor('sfx', selectedOptionId)
  const music = useAudioModelOptionsFor('music', selectedOptionId)
  const kind: AudioKind = isAudioKind(state.audioKind)
    ? state.audioKind
    : DEFAULT_AUDIO_KIND
  const selectedModel = { speech, sfx, music }[kind].selectedModel

  const t = useTranslations('StudioOperator')
  const tModels = useTranslations('Models')
  const tAudio = useTranslations('audioParams')
  const labelOf = useCallback(
    (option: StudioModelOption) =>
      isBuiltInModel(option.modelId)
        ? tModels(`${getModelMessageKey(option.modelId)}.label`)
        : (option.displayLabel ?? option.modelId),
    [tModels],
  )

  const latest = useRef({ state, speech, sfx, music, selectedModel, labelOf })
  useEffect(() => {
    latest.current = { state, speech, sfx, music, selectedModel, labelOf }
  }, [labelOf, music, selectedModel, sfx, speech, state])

  const buildSnapshot = useCallback(() => {
    const now = latest.current
    return buildAudioOperatorSnapshot({
      form: now.state,
      modelsByKind: {
        speech: now.speech.modelOptions,
        sfx: now.sfx.modelOptions,
        music: now.music.modelOptions,
      },
      selectedModel: now.selectedModel,
      labelOf: now.labelOf,
    })
  }, [])

  const apply = useMemo((): StudioOperatorApplyContext => {
    const noForm = (): void => {}
    return {
      getState: () => latest.current.state,
      dispatch,
      resolveOptionId: () => null,
      addReference: noForm,
      removeReference: noForm,
      addAudioReference: noForm,
      removeAudioReference: noForm,
      setSound: noForm,
      mountUserUrl: noForm,
      unmountUserUrl: noForm,
      setPrimed: setOperatorPrimed,
      setAudio: (patch) => {
        for (const action of audioPatchActions(patch)) dispatch(action)
      },
      triggerGeneration: (_request, owner) =>
        dispatch({ type: 'REQUEST_GENERATE', owner }),
      setGenerationLabel: setOperatorGenerationLabel,
      deleteProjectRule: async ({ ruleId, kind: ruleKind }) => {
        const result = await (ruleKind === PROJECT_RULE_KIND_IDS.note
          ? deleteAssistantMemoryAPI(ruleId)
          : deleteProjectRuleAPI(ruleId))
        return result.success
      },
      revertAssetWrite: async (input) => {
        const result = await revertAssistantAssetWriteAPI(input)
        return result !== null && result.skipped === 0
      },
    }
  }, [dispatch])

  const open = state.panels.enhance
  const setOpen = useCallback(
    (next: boolean) =>
      dispatch({
        type: next ? 'OPEN_PANEL' : 'CLOSE_PANEL',
        payload: 'enhance',
      }),
    [dispatch],
  )

  /** 规格行那一句：「{模型} · {档}」。 */
  const modelLabel = selectedModel ? labelOf(selectedModel) : null
  const contextLine = useCallback(
    () =>
      t('face.audio.context', {
        model: modelLabel ?? t('face.noModel'),
        kind: tAudio(
          kind === 'sfx'
            ? 'kindSfx'
            : kind === 'music'
              ? 'kindMusic'
              : 'kindSpeech',
        ),
      }),
    [kind, modelLabel, t, tAudio],
  )
  const face = useStudioOperatorFace(
    ASSISTANT_PROTOCOL_DOMAIN_IDS.audio,
    contextLine,
  )

  return useMemo(
    (): StudioOperatorHost => ({
      domain: ASSISTANT_PROTOCOL_DOMAIN_IDS.audio,
      workspace: 'audio',
      face,
      buildSnapshot,
      apply,
      results: NO_RESULTS,
      referenceImages: NO_REFERENCES,
      open,
      setOpen,
      collapseOnOutsidePointer: false,
      anchor: STUDIO_OPERATOR_WORKBENCH_COLUMN_ANCHOR,
    }),
    [apply, buildSnapshot, face, open, setOpen],
  )
}
