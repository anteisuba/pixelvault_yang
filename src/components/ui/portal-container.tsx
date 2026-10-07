'use client'

import * as React from 'react'

/**
 * 浮层（Popover / DropdownMenu / Tooltip）传送的落点。缺席 = `document.body`。
 *
 * 剪辑台的暗场只套在台面那一层（助手面板在外面保持浅色），而浮层默认传送到 body、
 * 落在 `.dark` 之外。台面把落点指到自己里面一个带 `.dark` 的节点，台面里复用的画布
 * 件（提示词栏的参数 / 模型 chip、参考轨菜单、`@` 候选……）弹出来就跟着走暗档，
 * ⛔ 不用逐个组件加 `dark`。
 */
const PortalContainerContext = React.createContext<HTMLElement | null>(null)

export const PortalContainerProvider = PortalContainerContext.Provider

export function usePortalContainer(): HTMLElement | undefined {
  return React.useContext(PortalContainerContext) ?? undefined
}
