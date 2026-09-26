'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  animate,
  calcGeneratorDuration,
  spring,
  useMotionValue,
  useTransform,
  type MotionValue,
} from 'motion/react'

import { DURATION_MS, LIQUID_SPRING, LIQUID_TIMING } from '@/constants/motion'

/**
 * **面板从触发物长出来**（interaction.md §2.1 · ui-defaults §4 液态展开那一族）。
 *
 * 形状只裁剪、不变尺寸：面板按全尺寸排版，四条边各一根 motion 值拼成 `clip-path`。
 * 开 = 先横成一条标题条（`LIQUID_SPRING.strip`），`LIQUID_TIMING.unfoldDelayS` 后纵向
 * 落下（`unfold`）；收 = 先收回成一条（`retract`），`retractSecondBeatDelayS` 后缩回
 * 触发物。横着走时前进方向那条边硬（`lead`）、后面那条软（`trail`）。
 *
 * ⚠ 与画布左侧栏（`ShellSidePanels`）同一套相位机：`closed → opening → open →
 *   closing → closed`。展开认弹簧落定并带兜底定时器，收回**只认定时器**（后台标签页
 *   rAF 冻结，弹簧永远不落）。中途改目标不先停：下一段 `animate` 从此刻的位置与速度
 *   接着走。
 * ⚠ 静止档（`open`）的 `clipPath` 是 `none`，两档都走同一个 motion 值，⛔ 不在 style
 *   上换成字符串（motion 不解绑，会留最后一帧的裁剪）。
 * ⚠ 坐标是相对「形状所在的那个全尺寸层」左上角的像素；调用方负责把触发物与面板的
 *   `getBoundingClientRect()` 换算过来。
 */

export type LiquidPhase = 'closed' | 'opening' | 'open' | 'closing'

export interface LiquidRect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface LiquidRevealOptions {
  reducedMotion: boolean
  /** 第一拍那条标题条多高。 */
  stripHeightPx: number
  /** 触发物的圆角。 */
  originRadiusPx: number
  /** 面板的圆角（贴边面板为 0）。 */
  targetRadiusPx: number
}

export interface LiquidReveal {
  phase: LiquidPhase
  clipPath: MotionValue<string>
  open(origin: LiquidRect, target: LiquidRect): void
  close(origin: LiquidRect, target: LiquidRect): void
}

type LiquidSpring = (typeof LIQUID_SPRING)[keyof typeof LIQUID_SPRING]

/** 一根液态弹簧走完 `distancePx` 要多久（ms）—— 用 motion 自己的生成器算。 */
function settleMs(config: LiquidSpring, distancePx: number): number {
  return calcGeneratorDuration(
    spring({
      keyframes: [0, Math.max(1, Math.abs(distancePx))],
      stiffness: config.stiffness,
      damping: config.damping,
    }),
  )
}

export function useLiquidReveal(options: LiquidRevealOptions): LiquidReveal {
  const { reducedMotion, stripHeightPx, originRadiusPx, targetRadiusPx } =
    options
  const [phase, setPhase] = useState<LiquidPhase>('closed')
  const phaseRef = useRef<LiquidPhase>('closed')
  const left = useMotionValue(0)
  const top = useMotionValue(0)
  const right = useMotionValue(0)
  const bottom = useMotionValue(0)
  const radius = useMotionValue(originRadiusPx)
  const timers = useRef<number[]>([])

  const clipPath = useTransform(() => {
    const l = left.get()
    const t = top.get()
    const r = right.get()
    const b = bottom.get()
    const rad = radius.get()
    if (phase === 'open' || phase === 'closed' || reducedMotion) return 'none'
    return `inset(${t.toFixed(2)}px calc(100% - ${r.toFixed(2)}px) calc(100% - ${b.toFixed(2)}px) ${l.toFixed(2)}px round ${Math.max(0, rad).toFixed(2)}px)`
  })

  const go = useCallback((next: LiquidPhase) => {
    phaseRef.current = next
    setPhase(next)
  }, [])
  const clearTimers = useCallback(() => {
    timers.current.forEach((timer) => window.clearTimeout(timer))
    timers.current = []
  }, [])
  const later = useCallback((ms: number, run: () => void) => {
    timers.current.push(window.setTimeout(run, ms))
  }, [])
  useEffect(() => clearTimers, [clearTimers])

  /** 横着走：前进方向那条边用 `lead`，后面那条用 `trail`。 */
  const horizontal = useCallback(
    (toLeft: number, toRight: number) => {
      const goingRight = (toLeft + toRight) / 2 > (left.get() + right.get()) / 2
      animate(
        right,
        toRight,
        goingRight ? LIQUID_SPRING.lead : LIQUID_SPRING.trail,
      )
      return animate(
        left,
        toLeft,
        goingRight ? LIQUID_SPRING.trail : LIQUID_SPRING.lead,
      )
    },
    [left, right],
  )

  const open = useCallback(
    (origin: LiquidRect, target: LiquidRect) => {
      clearTimers()
      if (reducedMotion) {
        go('open')
        return
      }
      const settle = () => {
        if (phaseRef.current === 'opening') go('open')
      }
      if (phaseRef.current === 'closed') {
        left.jump(origin.left)
        top.jump(origin.top)
        right.jump(origin.right)
        bottom.jump(origin.bottom)
        radius.jump(originRadiusPx)
        go('opening')
        // 第一拍：横成一条标题条（到面板顶端、面板那么宽）。
        horizontal(target.left, target.right)
        animate(top, target.top, LIQUID_SPRING.strip)
        animate(bottom, target.top + stripHeightPx, LIQUID_SPRING.strip)
        animate(radius, targetRadiusPx, LIQUID_SPRING.strip)
        const unfoldAtMs = LIQUID_TIMING.unfoldDelayS * 1000
        // 第二拍：纵向落下。
        later(unfoldAtMs, () => {
          void animate(
            bottom,
            target.bottom,
            LIQUID_SPRING.unfold,
          ).finished.then(settle)
        })
        later(
          unfoldAtMs +
            settleMs(
              LIQUID_SPRING.unfold,
              target.bottom - target.top - stripHeightPx,
            ) +
            DURATION_MS.fast,
          settle,
        )
        return
      }
      // 收回途中又点开：接住此刻的位置与速度直接走满（⛔ 不跳回触发物从头播）。
      go('opening')
      horizontal(target.left, target.right)
      animate(top, target.top, LIQUID_SPRING.unfold)
      animate(radius, targetRadiusPx, LIQUID_SPRING.unfold)
      void animate(bottom, target.bottom, LIQUID_SPRING.unfold).finished.then(
        settle,
      )
      later(
        settleMs(
          LIQUID_SPRING.unfold,
          Math.max(target.bottom - bottom.get(), target.left - left.get()),
        ) + DURATION_MS.fast,
        settle,
      )
    },
    [
      bottom,
      clearTimers,
      go,
      horizontal,
      later,
      left,
      originRadiusPx,
      radius,
      reducedMotion,
      right,
      stripHeightPx,
      targetRadiusPx,
      top,
    ],
  )

  const close = useCallback(
    (origin: LiquidRect, target: LiquidRect) => {
      clearTimers()
      if (reducedMotion) {
        go('closed')
        return
      }
      if (phaseRef.current === 'open') {
        // 静止档没有裁剪，四条边从整块起步。
        left.jump(target.left)
        top.jump(target.top)
        right.jump(target.right)
        bottom.jump(target.bottom)
        radius.jump(targetRadiusPx)
      }
      go('closing')
      const retractAtMs = LIQUID_TIMING.retractDelayS * 1000
      const secondBeatAtMs =
        retractAtMs + LIQUID_TIMING.retractSecondBeatDelayS * 1000
      later(retractAtMs, () => {
        animate(bottom, top.get() + stripHeightPx, LIQUID_SPRING.retract)
      })
      later(secondBeatAtMs, () => {
        horizontal(origin.left, origin.right)
        animate(top, origin.top, LIQUID_SPRING.retract)
        animate(bottom, origin.bottom, LIQUID_SPRING.retract)
        animate(radius, originRadiusPx, LIQUID_SPRING.retract)
      })
      // ⚠ 收回只认定时器。
      later(
        secondBeatAtMs +
          settleMs(
            LIQUID_SPRING.retract,
            Math.max(
              Math.abs(target.left - origin.left),
              Math.abs(target.top - origin.top),
            ),
          ) +
          DURATION_MS.fast,
        () => {
          if (phaseRef.current === 'closing') go('closed')
        },
      )
    },
    [
      bottom,
      clearTimers,
      go,
      horizontal,
      later,
      left,
      originRadiusPx,
      radius,
      reducedMotion,
      right,
      stripHeightPx,
      targetRadiusPx,
      top,
    ],
  )

  return { phase, clipPath, open, close }
}
