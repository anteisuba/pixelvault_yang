'use client'

import { useStudioOperatorDockPlacement } from '@/contexts/studio-operator-host'

import { StudioOperatorDock } from './StudioOperatorDock'

/**
 * 台上挂的那一颗（第 9f 步）：≥768 面板由 `/studio` 外壳中间那一栏挂着，台上 ⛔ 再挂；
 * 更窄照旧由台自己挂（浮起的那一颗）。⚠ 同一时刻只能有一份面板 —— 两份会各开一条流。
 */
export function StudioOperatorBenchDock() {
  const { owner } = useStudioOperatorDockPlacement()
  return owner === 'bench' ? <StudioOperatorDock /> : null
}
