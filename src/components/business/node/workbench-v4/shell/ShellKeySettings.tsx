'use client'

/**
 * 画布外壳里那条**「配置渠道与 key」**的去处（S7 §7 → D3 ④）。
 *
 * 曾经这里挂的是画布自己的第二个 key 抽屉（`ShellApiKeys`）。D3 ④ 把 key 管理
 * 整个收进 `/settings/keys`，抽屉删了，剩下的只是**一个函数**：谁要就
 * `useKeySettingsAction()?.()`。⛔ 不要再为画布造第二份 key 界面。
 *
 * 为什么还留一层 context 而不是让每张卡各自 `useOpenKeySettings()`：卡片是
 * 画布的叶子，直接在叶子里挂路由会把 `@/i18n/navigation` 拖进每一个卡片单测。
 * 外壳挂一份、叶子读一份，和它们读 `NodeV4Context` 是同一套规矩。
 *
 * `null` = 外壳没挂（`NodeWorkbenchV4` 之外渲染的卡，比如测试与 `dev/ui-states`）。
 * 消费方据此决定要不要给出那一行 —— 少一个入口比白屏好。
 *
 * 缺 key 时的**就地**配置仍由 `QuickSetupDialog` 负责（Hard Rule 8），
 * 与本入口的「通盘管理」不重叠。
 */

import { createContext, useContext } from 'react'

/**
 * ⛔ 这个文件**不许** import `@/i18n/navigation` / `use-open-key-settings`：
 * 每张卡都读它，把路由拖进来会让所有卡片单测连模块都加载不起来。
 * 真正的跳转在 `NodeWorkbenchV4` 那一层塞进来。
 */
export const KeySettingsContext = createContext<(() => void) | null>(null)

/** 谁要「配置渠道与 key」就调这个；外壳没挂时返回 `null`。 */
export function useKeySettingsAction(): (() => void) | null {
  return useContext(KeySettingsContext)
}
