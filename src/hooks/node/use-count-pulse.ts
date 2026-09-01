'use client'

import { useState } from 'react'

/**
 * 回执脉冲的驱动源（owner 的原始诉求：「拖了必有回音」）——
 * 一个计数值每次**增加**时递增一个 key，
 * 供调用方把它喂给 framer-motion 元素的 `key` prop —— key 变化触发
 * 组件重新挂载，`initial`→`animate` 因此重放一次，实现「值变大就闪一下」
 * 而不用手写 keyframes 数组。数值不变或**减少**时 key 不动，不放回执
 * （减少通常是删除/撤销，不是「拖了新素材进来」那类值得庆祝的动作）。
 *
 * 用渲染期调整 state（VoiceNode.tsx 的 `playbackSourceUrl` 同款手法）而不是
 * `useEffect`：省一帧，也避免多一次 commit。
 *
 * 首次挂载不算「增加」——`useState(count)` 的初始值就是 `count` 本身，
 * 第一次渲染 `count === lastCount` 恒成立，key 停在 0。调用方用「key > 0」
 * 判断是否要跳过首帧的 `initial` 动画，避免卡片一挂载（存量数据 count 已经
 * > 0）就误放一次回执。
 *
 * 两个消费者：`IdentityCollectorCard`（画布卡 ▦N）与 `CastCard`（名册 rail
 * 卡 📷N）——同一个数值语义（「素材数变多了」），抽成共享 hook 而不是各写
 * 一份，避免下次改回执手感要改两处。
 */
export function useCountPulse(count: number): number {
  const [lastCount, setLastCount] = useState(count)
  const [pulseKey, setPulseKey] = useState(0)

  if (count !== lastCount) {
    const increased = count > lastCount
    setLastCount(count)
    if (increased) {
      setPulseKey((key) => key + 1)
    }
  }

  return pulseKey
}

/**
 * 脉冲的视觉配方——Hard Rule 1（不写魔法值）：两个消费者（`IdentityCollectorCard`
 * / `CastCard`）共用同一份数值，不各写一份 `1.2`/`0.2`/缓动数组。
 *
 * - 幅度 1.2 与 `constants/motion.ts` 的 `INGEST_MOTION.chipPopScale`
 *   同值——都是「一个 chip 因为有新东西进来而弹一下」的量级，但这是**独立**
 *   的判断（拖入之外，「从画布选择」也会经同一条计数变化触发这个脉冲，不是
 *   吞噬三拍 `use-cast-ingest.ts` 那套编排的一部分），所以不直接 import
 *   `INGEST_MOTION` 复用同一个字段，避免两套语义被绑死成同一个常量。
 * - 时长/缓动走**画布域**自己的三档时长（`canvas.css` `--canvas-dur-fast`
 *   150ms / `--canvas-dur-base` 250ms，非 `constants/motion.ts` 的
 *   120/200/320 全站档——两条曲线是有意分开的两套 canon，见该文件顶部
 *   注释）：`0.2s` 落在 150–250 区间中点，缓动用 `--canvas-ease-state`
 *   （`cubic-bezier(0.4, 0, 0.2, 1)`）的数组形式——这条曲线在 canvas.css
 *   里明确标注给「状态过渡」用，计数跳变正是一次状态过渡，不是入场/出场，
 *   所以不借 `--canvas-ease-in`。CSS 自定义属性没法直接喂给 framer-motion
 *   的 transition，这里手动转成同值的数组，和 `constants/motion.ts` 里
 *   `EASE_STANDARD_CSS`/`EASE_STANDARD` 两份并存同一原因。
 */
export const COUNT_PULSE_SCALE = 1.2
const COUNT_PULSE_DURATION_S = 0.2
const COUNT_PULSE_EASE: [number, number, number, number] = [0.4, 0, 0.2, 1]

/** `initial` prop for the pulsing motion element — `false` on the render
 *  where `pulseKey` is still 0 (first mount, or the count has never
 *  increased yet) so nothing pops on data load; `{ scale }` once it has. */
export function countPulseInitial(pulseKey: number): { scale: number } | false {
  return pulseKey > 0 ? { scale: COUNT_PULSE_SCALE } : false
}

/** `transition` prop for the pulse settle (`animate={{ scale: 1 }}`).
 *  `reducedMotion` is `useReducedMotion()`'s return value — `true` zeroes
 *  the duration so the element snaps straight to its final state. */
export function countPulseTransition(reducedMotion: boolean | null): {
  duration: number
  ease: [number, number, number, number]
} {
  return {
    duration: reducedMotion ? 0 : COUNT_PULSE_DURATION_S,
    ease: COUNT_PULSE_EASE,
  }
}
