'use client'

import { motionValue, type MotionValue } from 'motion/react'

/**
 * 助手面板在桌面展开时，工作台右侧要让出的宽度（px，含面板右边距与间隙）。
 * `0` = 不让。
 *
 * ⭐ 一个模块级 motion 值，**只有 `StudioOperatorDock` 写**：展开时随形状第二拍
 * 用同一根弹簧长到面板宽，收起时随收回那一拍退回 0（owner 2026-09-26「工作台
 * 让位」）。拖宽面板时它跟着跳到新宽度。
 * ⚠ 要不要让位由**消费方**决定：只有绑了它的外壳才会收窄（现在是图片工作台的
 * 底部输入框布局），画布、LoRA、视频档不绑，面板照旧盖在上面。
 */
export const studioOperatorYield: MotionValue<number> = motionValue(0)

export function useStudioOperatorYield(): MotionValue<number> {
  return studioOperatorYield
}
