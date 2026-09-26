'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useReducedMotion } from 'motion/react'

import { DURATION_MS } from '@/constants/motion'
import { cn } from '@/lib/utils'

/** 结果让位：线性淡出，淡完面板才上来。 */
const RESULTS_OUT_CLASS =
  'pointer-events-none animate-out fade-out-0 fill-mode-forwards duration-(--duration-fast) ease-linear'
/** 面板收起后结果回来。 */
const RESULTS_IN_CLASS =
  'animate-in fade-in-0 duration-(--duration-base) ease-standard'
const PANEL_IN_CLASS =
  'animate-in fade-in-0 slide-in-from-bottom-1.5 duration-(--duration-base) ease-standard motion-reduce:animate-none'
const PANEL_OUT_CLASS =
  'pointer-events-none animate-out fade-out-0 slide-out-to-bottom-1.5 fill-mode-forwards duration-(--duration-fast) ease-linear'

/**
 * 换场走到哪一拍：`resultsOut` 结果正在淡出（面板还没上来）· `panelOut` 面板正在
 * 淡出 · `resultsIn` 结果正在淡回来。
 */
type SwapPhase = 'idle' | 'resultsOut' | 'panelOut' | 'resultsIn'

/**
 * 舞台在「结果」与一块面板之间换场（owner 2026-09-26 模板 C 动效表）：
 *  · 打开：结果 120ms 线性淡出，淡完面板淡入 + 上浮 6px；
 *  · 收起：面板 120ms 淡出 + 下沉 6px，淡完结果淡入。
 * 两层都在文档流里，⛔ 不叠在一起交叉淡化 —— 所以是「先走一个，再来一个」。
 * 「减少动态效果」时直切。
 *
 * ⚠ 结果那一层**不卸载**，只是藏起来（`hidden` ↔ `contents`）：`StudioCanvas` 手上
 *   有正在跑的那一批与放大图的状态，卸掉等于把它们丢了。`contents` 不产生盒子，
 *   舞台空态那条高度链（globals.css `.studio-workbench-stage:has(...)`）因此不断；
 *   也因为没有盒子，淡入淡出的类由 `renderResults` 挂到结果自己的根上。
 * ⚠ 每一拍靠定时器落定，⛔ 不等 `animationend`：后台标签页里动画不跑，等它的
 *   下场是一块摘不掉、吃着点击的面板。
 */
export function StudioStageSwap({
  panelKey,
  renderPanel,
  renderResults,
}: {
  /** 开着哪块面板；`null` = 看结果。 */
  panelKey: string | null
  renderPanel: (key: string) => ReactNode
  /** `motionClass` = 这一拍结果根上要挂的淡入 / 淡出类（没有换场时是 `undefined`）。 */
  renderResults: (motionClass: string | undefined) => ReactNode
}) {
  const reducedMotion = useReducedMotion()
  /** 舞台上此刻画着的那块面板（换场途中会落后 `panelKey` 一拍）。 */
  const [shownKey, setShownKey] = useState(panelKey)
  const [phase, setPhase] = useState<SwapPhase>('idle')
  const [previousKey, setPreviousKey] = useState(panelKey)
  if (previousKey !== panelKey) {
    setPreviousKey(panelKey)
    if (reducedMotion) {
      setShownKey(panelKey)
      setPhase('idle')
    } else if (panelKey === null) {
      // 面板还没上来就又收了：结果直接淡回来。
      setPhase(shownKey === null ? 'resultsIn' : 'panelOut')
    } else if (shownKey !== null) {
      // 面板之间换、或收到一半又开：直接换上，新的那块照常淡入。
      setShownKey(panelKey)
      setPhase('idle')
    } else {
      setPhase('resultsOut')
    }
  }

  useEffect(() => {
    if (phase !== 'resultsOut') return
    const timer = window.setTimeout(() => {
      setShownKey(panelKey)
      setPhase('idle')
    }, DURATION_MS.fast)
    return () => window.clearTimeout(timer)
  }, [phase, panelKey])

  useEffect(() => {
    if (phase !== 'panelOut') return
    const timer = window.setTimeout(() => {
      setShownKey(null)
      setPhase('resultsIn')
    }, DURATION_MS.fast)
    return () => window.clearTimeout(timer)
  }, [phase])

  useEffect(() => {
    if (phase !== 'resultsIn') return
    const timer = window.setTimeout(() => setPhase('idle'), DURATION_MS.slow)
    return () => window.clearTimeout(timer)
  }, [phase])

  const resultsMotion =
    phase === 'resultsOut'
      ? RESULTS_OUT_CLASS
      : phase === 'resultsIn'
        ? RESULTS_IN_CLASS
        : undefined
  return (
    <>
      <div className={shownKey ? 'hidden' : 'contents'}>
        {renderResults(resultsMotion)}
      </div>
      {shownKey ? (
        <div
          key={shownKey}
          className={cn(
            'flex min-h-0 flex-1 flex-col',
            phase === 'panelOut' ? PANEL_OUT_CLASS : PANEL_IN_CLASS,
          )}
        >
          {renderPanel(shownKey)}
        </div>
      ) : null}
    </>
  )
}
