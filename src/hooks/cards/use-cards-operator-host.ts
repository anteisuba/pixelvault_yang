'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import { STUDIO_OPERATOR_WORKBENCH_COLUMN_ANCHOR } from '@/constants/studio-assistant-operator'
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
 * ⭐ 快照 = 这页上有谁 + 打开着的那一位的整份设定（`buildCardsOperatorSnapshot`）。
 * ⭐ 落笔的手只有一只（C2）：`apply.cards.applyProfile` —— 设定提议卡上用户点「收下
 *   勾选的」时写进角色。服务端从不写角色（提议卡那一帧之前一行库都没写）。
 * ⚠ 表单那几只手在角色页上无处可去 —— 它们**到不了**（域工具表里没有表单旋钮），
 *   写成空函数只是为了满足契约形状（与画布宿主同一做法）。
 * ⚠ 点页面别处**不收**助手（`collapseOnOutsidePointer: false`）：卡片助手的用法就是
 *   边聊边翻角色，收放法则的前提「面板外面是表单」在这里不成立。
 * ⚠ 锚点是布局 A（头像留在地台那一行、面板并排让位）：页面上那一行右端给头像留了位。
 */

const NO_RESULTS: readonly StudioOperatorResultItem[] = []
const NO_REFERENCES: StudioOperatorHost['referenceImages'] = []

export interface UseCardsOperatorHostInput {
  /** 页上的全部角色（变体摊平后）。 */
  cards: readonly CharacterCardRecord[]
  /** 此刻打开着的那一位；`null` = 在总览。 */
  openId: string | null
  /**
   * 把设定提议卡上勾中的几格写进角色（C2）—— 角色页自己的更新，返回是否写成。
   * ⚠ 只改勾中的那几格，其余设定原样保留。
   */
  applyProfile: NonNullable<StudioOperatorApplyContext['cards']>['applyProfile']
}

export function useCardsOperatorHost({
  cards,
  openId,
  applyProfile,
}: UseCardsOperatorHostInput): StudioOperatorHost {
  const t = useTranslations('StudioOperator')
  const locale = useLocale()
  const [open, setOpen] = useState(false)

  /** ⚠ 快照必须现读（事件循环跨很多次 render）：最新一份放在 ref 里（写在 effect 里，本仓 latest-ref 的既有写法）。 */
  const latest = useRef({ cards, openId, locale, applyProfile })
  useEffect(() => {
    latest.current = { cards, openId, locale, applyProfile }
  }, [applyProfile, cards, locale, openId])
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
      /** C2：设定提议卡「收下勾选的」那只手（现读最新的那一份）。 */
      cards: {
        applyProfile: (characterId, fields) =>
          latest.current.applyProfile(characterId, fields),
      },
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
      /**
       * 布局 A「分栏并排」（owner 09-27，与图片台同一套）：头像留在地台那一行右端，
       * 面板顶边对齐白卡、从右侧滑进来，页面让位（`CardsPageContent` 绑让位量）。
       */
      anchor: STUDIO_OPERATOR_WORKBENCH_COLUMN_ANCHOR,
    }),
    [apply, buildSnapshot, face, open],
  )
}
