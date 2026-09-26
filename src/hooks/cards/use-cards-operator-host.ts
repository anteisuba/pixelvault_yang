'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import type { StudioOperatorHost } from '@/contexts/studio-operator-host'
import type { CharacterCardRecord } from '@/types'
import type { StudioOperatorResultItem } from '@/types/studio-assistant-operator'
import { useStudioOperatorFace } from '@/hooks/use-studio-operator-face'
import { buildCardsOperatorSnapshot } from '@/lib/cards-operator-snapshot'
import type { StudioOperatorApplyContext } from '@/lib/studio-operator-apply'

/**
 * 操作员面板在**角色页**（`/cards`）这个宿主上的实现 —— 卡片助手，第五张脸
 * （owner 09-26）。
 *
 * ⭐ C1 只读：快照 = 这页上有谁 + 打开着的那一位的整份设定（`buildCardsOperatorSnapshot`）。
 *   写设定（C2）、挂图（C3）以专属工具进表，那时再给这里接上落笔的手。
 * ⚠ 表单那几只手在角色页上无处可去 —— 它们**到不了**（域工具表里没有表单旋钮），
 *   写成空函数只是为了满足契约形状（与画布宿主同一做法）。
 * ⚠ 点页面别处**不收**助手（`collapseOnOutsidePointer: false`）：卡片助手的用法就是
 *   边聊边翻角色，收放法则的前提「面板外面是表单」在这里不成立。
 */

const NO_RESULTS: readonly StudioOperatorResultItem[] = []
const NO_REFERENCES: StudioOperatorHost['referenceImages'] = []

export interface UseCardsOperatorHostInput {
  /** 页上的全部角色（变体摊平后）。 */
  cards: readonly CharacterCardRecord[]
  /** 此刻打开着的那一位；`null` = 在总览。 */
  openId: string | null
}

export function useCardsOperatorHost({
  cards,
  openId,
}: UseCardsOperatorHostInput): StudioOperatorHost {
  const t = useTranslations('StudioOperator')
  const locale = useLocale()
  const [open, setOpen] = useState(false)

  /** ⚠ 快照必须现读（事件循环跨很多次 render）：最新一份放在 ref 里（写在 effect 里，本仓 latest-ref 的既有写法）。 */
  const latest = useRef({ cards, openId, locale })
  useEffect(() => {
    latest.current = { cards, openId, locale }
  }, [cards, locale, openId])
  const buildSnapshot = useCallback(() => {
    const now = latest.current
    return buildCardsOperatorSnapshot(now.cards, now.openId, now.locale)
  }, [])

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
    }
  }, [])

  /** 规格行那一句：打开着谁就说谁，否则说这页有几位。 */
  const openName = openId
    ? (cards.find((card) => card.id === openId)?.name ?? null)
    : null
  const count = cards.length
  const contextLine = useCallback(
    () =>
      openName
        ? t('face.cards.contextOpen', { name: openName })
        : t('face.cards.context', { count }),
    [count, openName, t],
  )
  const face = useStudioOperatorFace(
    ASSISTANT_PROTOCOL_DOMAIN_IDS.cards,
    contextLine,
  )

  return useMemo(
    (): StudioOperatorHost => ({
      domain: ASSISTANT_PROTOCOL_DOMAIN_IDS.cards,
      face,
      buildSnapshot,
      apply,
      results: NO_RESULTS,
      referenceImages: NO_REFERENCES,
      referenceLimit: 0,
      open,
      setOpen,
      collapseOnOutsidePointer: false,
    }),
    [apply, buildSnapshot, face, open],
  )
}
