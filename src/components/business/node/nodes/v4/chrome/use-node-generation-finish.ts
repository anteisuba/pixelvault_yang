'use client'

import { useCallback, useState } from 'react'

/**
 * 画布卡的「出图那一拍」（加载态 A「边即进度」，owner 2026-09-27）。
 *
 * 线补满合拢 → 停一拍（`holding`：卡边还是线的，新图先压在白纱 + 模糊底下）→ 线淡出，
 * 白纱撤掉、模糊收掉，选中环 / 细灰边在淡出的线底下回来（`release`）→ 整拍走完
 * （`finish`）。
 *
 * ⚠ 只有「生成结束**而且换上了新的媒体**」才算出图：取消（✕）与失败都 ⛔ 走这一拍 ——
 *   否则取消时线会假装走满一圈。判据是生成开始那一刻的地址与结束时的地址不同。
 * ⚠ 「生成中」的翻转在渲染期对齐（adjust-state-during-render），⛔ 不放 effect：
 *   它是在跟自己的 props，不是在同步外部系统。
 */
export interface NodeGenerationFinish {
  /** 出图那一拍还在走（进度层要继续挂着，`isCompleting`）。 */
  readonly completing: boolean
  /** 线合拢、停一拍之前：卡边还归线，新图压在白纱与模糊底下。 */
  readonly holding: boolean
  /** 线开始淡出时调（`onEdgeRelease`）。 */
  release(): void
  /** 整拍走完时调（`onCompleteAnimationDone`）。 */
  finish(): void
}

export function useNodeGenerationFinish({
  generating,
  failed,
  mediaUrl,
}: {
  readonly generating: boolean
  readonly failed: boolean
  readonly mediaUrl: string | undefined
}): NodeGenerationFinish {
  const [watch, setWatch] = useState({ generating, startUrl: mediaUrl })
  const [completing, setCompleting] = useState(false)
  const [released, setReleased] = useState(false)

  if (watch.generating !== generating) {
    setWatch({
      generating,
      startUrl: generating ? mediaUrl : watch.startUrl,
    })
    if (generating) {
      setCompleting(false)
      setReleased(false)
    } else if (!failed && mediaUrl && mediaUrl !== watch.startUrl) {
      setCompleting(true)
      setReleased(false)
    }
  }

  const release = useCallback(() => setReleased(true), [])
  const finish = useCallback(() => setCompleting(false), [])

  return {
    completing,
    holding: completing && !released,
    release,
    finish,
  }
}
