'use client'

/**
 * 四张脸的**文案与图标**那一半（D7b ③ · 画板 `DesignD7bFaces`，owner 2026-09-20）。
 *
 * ── 分工 ────────────────────────────────────────────────────────
 * 一张脸有三样：域图标 · 一句当前上下文 · 空态那句话（＋输入框占位词）。
 * 其中**只有「一句当前上下文」是宿主自己的**（它读的是那个宿主此刻的状态：模型 /
 * 比例 / 张数 / 底模 / 挂了几个 / 项目名 / 选中几个节点），其余是**按域查表**。
 * ⛔ 起手药丸已删（ui-spec §2「对话里不放建议按钮」，owner 11-04），连同常量表与
 *   三语 `face.pill.*` 词条 —— ⛔ 别补回来。
 *
 * ⭐ 所以这里抽的是「查表」那一半，四份宿主各自把自己的 `contextLine` 喂进来。
 * ⛔ 这**不是**把四张脸合并回一个组件里的分叉：表在 `constants/`，键按域取，加一个
 * 域编译期就红；而「谁是这个宿主」仍旧由宿主说了算（同 `domain` / `anchor` /
 * `collapseOnOutsidePointer` 那三条的判据）。抄四份静态文案的下场是它们会漂。
 */

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'

import {
  Clapperboard,
  Home,
  ImageIcon,
  Layers,
  UserRound,
  Waypoints,
  type LucideIcon,
} from '@/components/icons'
import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import type { AssistantOperatorDomain } from '@/constants/assistant-operator'
import type { StudioOperatorFace } from '@/contexts/studio-operator-host'

/**
 * 域标记左边那枚图标。
 *
 * ⚠ `Record<域, …>`：域表加一档而这里没跟上，编译期就红 —— 漏掉的表现是胶囊上
 * 一个空洞。⛔ 不给回落图标：回落会让漏配静默通过。
 */
const DOMAIN_ICONS: Readonly<Record<AssistantOperatorDomain, LucideIcon>> = {
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.image]: ImageIcon,
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.video]: Clapperboard,
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.lora]: Layers,
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.canvas]: Waypoints,
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.cards]: UserRound,
  [ASSISTANT_PROTOCOL_DOMAIN_IDS.home]: Home,
}

/**
 * 拼出这个宿主那张脸。
 *
 * @param domain 这个宿主此刻在哪个域（⚠ 工作台会随模态在 image / video 间变）。
 * @param contextLine 输入框上方那一句 —— **宿主自己算**，见 `StudioOperatorFace`。
 */
export function useStudioOperatorFace(
  domain: AssistantOperatorDomain,
  contextLine: () => string,
): StudioOperatorFace {
  const t = useTranslations('StudioOperator')
  return useMemo(
    () => ({
      domainIcon: DOMAIN_ICONS[domain],
      contextLine,
      emptyLine: t(`face.${domain}.empty`),
      inputPlaceholder: t(`face.${domain}.placeholder`),
    }),
    [contextLine, domain, t],
  )
}
