'use client'

/**
 * 操作员面板的**宿主契约**（P4-C）。
 *
 * ── 这个文件为什么在 P4-C 才出现 ───────────────────────────────────
 * P1–P4-B 期间操作员只有**一个**宿主（`/studio/image|video`），所以驱动 hook 直接
 * `useStudioForm()` / `useStudioData()` 是最省事也最诚实的写法。P4-C 要把它挂到
 * `/studio/lora` 上，而那条路由**故意不挂 `<StudioProvider>`**（`studio/lora/layout.tsx`
 * 顶部写着；装配台的底模 / 挂载栈 / 比例 / 参考图全是 `GenerateBranch` 的局部
 * state）。于是「面板从哪读表单、往哪写」必须变成一个参数。
 *
 * ⚠ 这**不是**预防性抽象：它是第二个宿主真的出现了才抽的，而且抽的正好是两个
 * 宿主之间唯一不同的那三样（域 / 快照 / 落笔的手），别的一律没动。
 *
 * ── ⛔ 为什么不是「给 LoRA 页也挂上 StudioProvider」 ───────────────────
 * `studio-context.tsx` 是 47 个文件的高危件，而它的表单模型里没有「挂载栈」
 * 「底模」这些概念 —— 挂上去等于往一个不适配的 reducer 里塞第二套语义，
 * 而装配台那边还得把 40 个局部 state 搬过去。代价与收益完全不成比例。
 *
 * ── ⛔ 为什么不是模块级 registry ──────────────────────────────────────
 * `registerOperatorRunner` 那个模块口是有理由的（就地确认条与面板分属两棵树，
 * 中间没有共同 Provider）。这里不一样：**面板与宿主永远在同一棵树里**
 * （工作台是 `StudioWorkspaceUI`，装配台是 `GenerateBranch`），context 直接够得着。
 * 模块单例反而会在两个页面之间留一份陈旧的手 —— 而那是没人会去查的失败。
 */

import { createContext, useContext, type ReactNode } from 'react'

import type { AssistantOperatorDomain } from '@/constants/assistant-operator'
import type { StudioOperatorApplyContext } from '@/lib/studio-operator-apply'
import type { AssistantOperatorSnapshot } from '@/types/assistant-operator'

export interface StudioOperatorHost {
  /**
   * 这个宿主此刻在哪个域。
   *
   * ⚠ 工作台会随模态在 `image` / `video` 之间变（切域机制见 `switchOperatorDomain`）；
   * 装配台恒 `lora`。⛔ 别在面板里按路由猜域 —— 域是宿主说了算的。
   */
  domain: AssistantOperatorDomain
  /**
   * 当前表单快照 —— `read_state` 的唯一数据源，服务端一个字段都不查库。
   *
   * ⚠ 必须是**每次调用现读**（不是渲染时算好的对象）：事件循环跨很多次 render，
   * 应用第 5 步时用的必须是此刻的表单，不是发消息那一刻的。
   */
  buildSnapshot(): AssistantOperatorSnapshot
  /** op 往哪落、撤销从哪撤 —— 应用与撤销共用同一份判据的两侧。 */
  apply: StudioOperatorApplyContext
  /**
   * 参考位上限（拍板 21：联网候选一行能选几张）。
   *
   * ⚠ 宿主自己兜底 `Infinity`：工作台那边是 `StudioDockPanelArea` 的 effect 跑到
   * 之前的中间态，装配台那边是「这个底模不吃参考图」（0）。
   */
  referenceLimit: number
  /**
   * 面板开合。
   *
   * ⚠ 归宿主管而不是面板自己存：工作台挂在 `panels.enhance` 上（与小屏抽屉那条路
   * 共用一个槽，两份状态不会漂），装配台是 `LoraWorkbench` 根上的 `assistantOpen`
   * （tab 行那颗按钮与移动端操作条按的都是它）。面板自己存一份的表现是「点标题栏
   * 的助手按钮没反应」。
   */
  open: boolean
  setOpen(open: boolean): void
}

const StudioOperatorHostContext = createContext<StudioOperatorHost | null>(null)

export function StudioOperatorHostProvider({
  host,
  children,
}: {
  host: StudioOperatorHost
  children: ReactNode
}) {
  return (
    <StudioOperatorHostContext.Provider value={host}>
      {children}
    </StudioOperatorHostContext.Provider>
  )
}

/**
 * ⚠ **抛而不是回落**：没有宿主时面板读不到表单也写不回去，静默降级的表现是
 * 「助手一切正常，就是什么都没改」—— 本仓最讨厌的那种失败。
 */
export function useStudioOperatorHost(): StudioOperatorHost {
  const host = useContext(StudioOperatorHostContext)
  if (!host) {
    throw new Error(
      'useStudioOperatorHost must be used within <StudioOperatorHostProvider>',
    )
  }
  return host
}
