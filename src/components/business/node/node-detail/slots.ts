import type { ComponentType, ReactNode } from 'react'

import type { NodeDetailBodyProps } from './registry'

/**
 * 各族往七槽里填的内容。
 *
 * ⚠ **空槽有两个不同的值，不能混用**（契约 §2 + 账本 §7.5）：
 *
 * - `undefined` = **组级不适用**，这一族根本没有这件事 → 整栏不渲染、不占高度。
 *   例：角色族无生成能力 → `desk: undefined`；镜头文本无媒体 → `stage: undefined`。
 * - **带空态文案的元素** = **空但有位**，这一族有这件事、只是现在是空的。
 *   例：视频族还没合进片盒 → `relations: <RelationsStrip empty="还没有合进任何片盒" />`。
 *
 * 这条区分不是洁癖。原型阶段 `rRelations()` 对散图族写了 `return ''`，把关系带
 * **整族抹掉**，而其余四族都留了一行空态 —— 同一条规则在新族与旧族上分岔，
 * 且正好打破了已拍板的「关系带必须全族有位」。类型上把两者分开，是第一道闸；
 * 第二道是 S8 的穷举 registry 与每族一条 DOM 断言。
 *
 * 所以 `relations` 与 `evidence` 在类型上**必填** —— 它们是契约明写「不得整族缺席」的两槽。
 * 想让它们不渲染，只能显式写 `undefined`，那是一个需要被看见的决定，不是手滑。
 */
export interface NodeDetailSlots {
  /** 槽 2 · 主体台。钉在身份条下方，不随滚动。`undefined` = 本族无媒体/无档案。 */
  stage?: ReactNode
  /** 槽 3 · 编排台。`undefined` = 本族无生成能力（如角色族）。 */
  desk?: ReactNode
  /** 槽 4 · 素材架。`undefined` = 本族不取材（如角色族，图集在主体台）。 */
  rack?: ReactNode
  /**
   * 槽 5 · 关系带。**必填** —— 契约「必须全族出现（可为空但要有位）」。
   * 为空时传带空态文案的元素，不要传 `undefined`。
   */
  relations: ReactNode | undefined
  /**
   * 槽 6 · 证据抽屉。**必填** —— 同上。
   * 「这次真正会送出什么」是本轮改版的核心诉求，默认视图里必须看得见。
   */
  evidence: ReactNode | undefined
  /** 槽 7 · 动作坞。`undefined` = 本族「编辑即保存」，没有提交动作。 */
  dock?: ReactNode
  /**
   * 不属于任何槽的浮层（Dialog / Popover / portal）。
   * 它们不参与 DOM 序，渲染在 Frame 末尾。
   * ⚠ 没有这个出口的话，各族的 `AssetSelectorDialog` / `QuickSetupDialog` /
   * 飞行令牌 portal 会被迫塞进某个槽，污染槽序。
   */
  overlays?: ReactNode
}

/**
 * 族的槽表提供者。
 *
 * ⚠ **必须是组件，不能是 hook，也不能靠 context 注册。** 三种形态都试算过：
 *
 * - **hook 形态**（`SLOT_HOOKS[type](props)` 由壳直接调用）：壳在同一个组件实例里
 *   按族换 hook 实现，用户从视频节点切到音色节点时 hook 数量与顺序变化，
 *   React 直接报 “Rendered more hooks than during the previous render”。
 *   这与刚修掉的焦点 bug 是同一类错误 —— 把随族变化的东西塞进壳自己的实例。
 * - **context 注册形态**（`useRegisterSlot`）：注册发生在 effect 里 → 首帧四段全空、
 *   DOM 顺序变成 effect 执行顺序、jsdom 里同步断言拿不到内容。
 *   直接毁掉「DOM 序恒为 2→3→4→5→6→7」这条可验条款。
 * - **组件 + children 渲染函数**（本形态）：组件类型变化时 React 自动卸载重挂，
 *   Rules of Hooks 天然安全；槽内容在自己的实例里算完，同步交给壳。
 *
 * ⚠ 实现必须直接 `return <>{children(slots)}</>`，**不得在外面包任何 DOM 元素** ——
 * 包一层 div 会把壳的四段结构打断，槽就不再是壳的直接子节点。
 */
export type NodeDetailSlotProvider = ComponentType<
  NodeDetailBodyProps & {
    children: (slots: NodeDetailSlots) => ReactNode
  }
>
