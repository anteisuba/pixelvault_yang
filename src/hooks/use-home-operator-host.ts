'use client'

import { useCallback, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import type { StudioOperatorHost } from '@/contexts/studio-operator-host'
import type { AssistantOperatorSnapshot } from '@/types/assistant-operator'
import type { StudioOperatorResultItem } from '@/types/studio-assistant-operator'
import { useStudioOperatorFace } from '@/hooks/use-studio-operator-face'
import { revertAssistantAssetWriteAPI } from '@/lib/api-client/assistant-operator'
import type { StudioOperatorApplyContext } from '@/lib/studio-operator-apply'

/**
 * 操作员面板在**首页**（`/studio`、`/studio/c/编号`，第 9f 步方向 E）上的宿主：还没开台。
 *
 * ⭐ 快照只有一个空提示词框（协议要这一格）；服务端认 `home` 这张脸：没有表单可改、不出图，
 *   改库 / 设置 / 记忆照常（到哪儿都能用），要干活就开台（第 9e 步）。
 * ⚠ 表单那几只手到不了（服务端不会在首页发表单改动），写成空函数只是满足契约形状，
 *   与角色页、画布宿主同一做法。
 * ⚠ 开合在首页没有意义（中间那一栏就是对话本身），`open` 恒真。
 */

const NO_RESULTS: readonly StudioOperatorResultItem[] = []
const NO_REFERENCES: StudioOperatorHost['referenceImages'] = []

function buildHomeSnapshot(): AssistantOperatorSnapshot {
  return { prompt: '', availableModels: [] }
}

export function useHomeOperatorHost(): StudioOperatorHost {
  const t = useTranslations('StudioOperator')
  const [, setOpen] = useState(true)

  const apply = useMemo((): StudioOperatorApplyContext => {
    const noForm = (): void => {}
    return {
      getState: () => ({ prompt: '', advancedParams: {} }),
      dispatch: noForm,
      resolveOptionId: () => null,
      addReference: noForm,
      removeReference: noForm,
      addAudioReference: noForm,
      removeAudioReference: noForm,
      setSound: noForm,
      mountUserUrl: noForm,
      unmountUserUrl: noForm,
      setPrimed: noForm,
      /** 新内核改库的撤销（第 4b 步）：原值交回服务端。 */
      revertAssetWrite: async (input) => {
        const result = await revertAssistantAssetWriteAPI(input)
        return result !== null && result.skipped === 0
      },
    }
  }, [])

  const contextLine = useCallback(() => t('face.home.context'), [t])
  const face = useStudioOperatorFace(
    ASSISTANT_PROTOCOL_DOMAIN_IDS.home,
    contextLine,
  )

  return useMemo(
    (): StudioOperatorHost => ({
      domain: ASSISTANT_PROTOCOL_DOMAIN_IDS.home,
      workspace: 'home',
      face,
      buildSnapshot: buildHomeSnapshot,
      apply,
      results: NO_RESULTS,
      referenceImages: NO_REFERENCES,
      open: true,
      setOpen,
      collapseOnOutsidePointer: false,
    }),
    [apply, face],
  )
}
