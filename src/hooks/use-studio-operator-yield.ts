'use client'

import { motionValue, type MotionValue } from 'motion/react'

import { useIsTablet } from '@/hooks/use-mobile'

/**
 * 助手面板在桌面展开时，工作台右侧要让出的宽度（px，含面板右边距与间隙）。
 * `0` = 不让。
 *
 * ⭐ 一个模块级 motion 值，**只有 `StudioOperatorDock` 写**：展开时随形状第二拍
 * 用同一根弹簧长到面板宽，收起时随收回那一拍退回 0（owner 2026-09-26「工作台
 * 让位」）。拖宽面板时它跟着跳到新宽度。面板自己的滑入位移也由它推出来，所以
 * 平板上它照样动 —— 只是消费方不再跟着让（见下）。
 * ⚠ 要不要让位由**消费方**决定：只有绑了它的外壳才会收窄（现在是图片工作台的
 * 底部输入框布局），画布、LoRA、视频档不绑，面板照旧盖在上面。
 */
export const studioOperatorYield: MotionValue<number> = motionValue(0)

/** 平板上消费方拿到的那一份：恒为 0。 */
const NO_YIELD: MotionValue<number> = motionValue(0)

/**
 * 消费方（工作台地台、LoRA、卡片页、剪辑台、画布视口）绑让位量的唯一入口。
 *
 * 平板（768–1023）返回恒 0（owner 2026-10-09 平板 v10「竖着拿时助手从右边盖上来，
 * 不挤工作台」）：320 宽的面板再让出去，工作台只剩一半。⛔ 消费方别直接读
 * `studioOperatorYield`，那样平板会被挤。
 */
export function useStudioOperatorYield(): MotionValue<number> {
  return useIsTablet() ? NO_YIELD : studioOperatorYield
}
