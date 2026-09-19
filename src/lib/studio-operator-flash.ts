/**
 * 助手回执的**第二只眼**：被改的那一格闪一次 outline（进度表 21 · D7 Q4）。
 *
 * ── 为什么工作台也要有 ────────────────────────────────────────────
 * 画布那一侧 2026-09-19 已经有了（`flashAssistantTouchedNode`），工作台与装配台
 * 上只有回执行没有闪 —— 面板里那行「已改 3 项：模型 · 提示词 · 参考图」说的是
 * **多少**，这一闪说的是**哪几个**，而工作台上那几颗旋钮分散在一整栏里，读完
 * 一行字再去栏里找是两件事。
 *
 * ── 三条与画布逐字同源的纪律 ──────────────────────────────────────
 * ① **命令式 classList**，⛔ 不进 React state：被改的那一格此刻正要重渲染，
 *    React 那一侧的 className 会在同一拍把 class 覆盖掉（表现是「有时闪有时不闪」）。
 * ② **先摘再挂 + 强制重排**：一轮里同一格被改两次时，不重启动画就只闪第一次
 *    （CSS 动画对「class 已经在了」不做任何事）。⛔ `void offsetWidth` 别删。
 * ③ **只动 `outline` 与 `opacity`**（⛔ 不动 transform / 尺寸）：被改的东西常在
 *    视线里，动尺寸会让整栏重排。时长与 reduced-motion 降级写在 `globals.css`。
 *
 * ⚠ 摘掉那一下走**定时器**而不是 `animationend`：工作台上有几格住在折叠的浮层里
 * （张数在规格 chip 的「更多」下面），元素 `display: none` 时动画根本不会开始，
 * 也就永远不会有 `animationend` —— class 于是挂着不走，下一次再改那一格就不闪了。
 * ⚠ 那一格此刻不在 DOM 里（浮层没展开 / 这个域没有这颗旋钮）时**静默跳过**：
 * 闪一个看不见的东西不是失败，面板里那行「已改 N 项」照样说得清。
 */

import { ASSISTANT_TOUCH_FLASH_MOTION } from '@/constants/motion'
import { STUDIO_PROMPT_TEXTAREA_ID } from '@/constants/studio'
import {
  STUDIO_OPERATOR_FIELD_IDS,
  type StudioOperatorField,
} from '@/constants/studio-assistant-operator'

/** 被闪的那一格挂的 class；真值（时长 / 曲线 / 降级）在 `globals.css`。 */
export const ASSISTANT_FIELD_TOUCH_CLASS = 'assistant-field-touched'

/** 界面上那一格自报家门用的属性 —— 组件里写 `data-assistant-field="prompt"`。 */
export const ASSISTANT_FIELD_ATTRIBUTE = 'data-assistant-field'

/**
 * 每一格手上那颗**还没到点的**摘除定时器。
 *
 * ⚠ 不记着它的下场很具体（单测抓到的）：同一格在一轮里被改两次时，第一次那颗
 * 定时器会在第二次闪到一半时把 class 摘掉 —— 表现是「第二次只闪了半下」。
 * ⚠ `WeakMap`：元素被 React 换掉之后这一格自己就走了，⛔ 不留一张会长的表。
 */
const pendingRemovals = new WeakMap<HTMLElement, number>()

function selectorOf(field: StudioOperatorField): string {
  const own = `[${ASSISTANT_FIELD_ATTRIBUTE}="${field}"]`
  /**
   * ⚠ 提示词框**借它自己那个 id**（三个宿主的输入框共用 `STUDIO_PROMPT_TEXTAREA_ID`，
   * 而且各有两三个分支形态）：给每个分支再挂一个属性，等于把同一件事写四遍，
   * 而那张 id 常量本来就是「全仓指认提示词框」的那一份。
   */
  return field === STUDIO_OPERATOR_FIELD_IDS.prompt
    ? `${own}, #${STUDIO_PROMPT_TEXTAREA_ID}`
    : own
}

/**
 * 让工作台 / 装配台上的一格闪一次。
 *
 * ⚠ 同一个 field 可能同时出现在两处（桌面参数栏与手机 composer 各画一份）——
 * **两处都闪**：当下只有一处在屏幕上，挑哪一处会挑错。
 */
export function flashAssistantTouchedField(field: StudioOperatorField): void {
  if (typeof document === 'undefined') return
  const targets = document.querySelectorAll<HTMLElement>(selectorOf(field))
  for (const target of targets) {
    const pending = pendingRemovals.get(target)
    if (pending !== undefined) window.clearTimeout(pending)
    target.classList.remove(ASSISTANT_FIELD_TOUCH_CLASS)
    void target.offsetWidth
    target.classList.add(ASSISTANT_FIELD_TOUCH_CLASS)
    pendingRemovals.set(
      target,
      window.setTimeout(() => {
        pendingRemovals.delete(target)
        target.classList.remove(ASSISTANT_FIELD_TOUCH_CLASS)
      }, ASSISTANT_TOUCH_FLASH_MOTION.durationMs),
    )
  }
}
