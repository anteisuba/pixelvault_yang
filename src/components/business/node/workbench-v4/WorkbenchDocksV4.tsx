'use client'

/**
 * v4 workbench 的**外壳组件挂载点**（第三期 · 画布）。
 *
 * ⚠ 2026-09-19（进度表 22「一张脸」）起这里**只剩审阅条**：画布的助手 dock
 * 随第二套引擎一起退场，右侧那一格由 `StudioOperatorDock` 直接占着
 * （宿主契约在 `contexts/studio-operator-host.tsx`，画布那份实现在
 * `hooks/node/use-canvas-operator-host.ts`）。
 * ⛔ 别在这里再摆一个助手插槽：面板自带收放、宽度记忆与移动端 Sheet，
 * 外面再包一层的表现是两层各管一半宽度（「拖到一半弹回去」）。
 */

import { ReviewModeBar } from '../ReviewModeBar'

/**
 * ⚠ S7 起桌面档的左栏不在这里 —— 44px 图标栏 + 264 浮起面板由
 * `shell/ShellSidePanels` 直接挂在 workbench 上（画板 `ChromePanels.dc.html`）。
 * ⚠ S12 起手机形态也不在这里 —— < 768 由 `NodeWorkbenchV4` 整棵换成
 * `mobile/CanvasMobileRail`（node-canvas-v2 §7.x），2026-08-26 的只读覆盖层
 * `CanvasMobileView` 随之删除，⛔ 不留兼容层。本文件只剩审阅条这一件摆放。
 */
export function WorkbenchDocksV4() {
  // 审阅模式条：组件自己判「在不在模式里」，不在就整个不渲染。
  return <ReviewModeBar />
}
