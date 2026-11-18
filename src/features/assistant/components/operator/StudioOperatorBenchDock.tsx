'use client'

import { useMemo, useState } from 'react'

import {
  StudioOperatorHostProvider,
  useInStudioOperatorShell,
  useStudioOperatorDockPlacement,
  type StudioOperatorHost,
} from '@/contexts/studio-operator-host'
import { useHomeOperatorHost } from '@/features/assistant/hooks/use-home-operator-host'

import { StudioOperatorDock } from './StudioOperatorDock'

/**
 * 台上挂的那一颗（第 9f 步）：≥768 面板由 `/studio` 外壳中间那一栏挂着，台上 ⛔ 再挂；
 * 更窄照旧由台自己挂（浮起的那一颗）。⚠ 同一时刻只能有一份面板 —— 两份会各开一条流。
 *
 * `benchless`（owner 11-18）：配音台、3D 台没有可让助手改的表单，自己不交宿主 —— 桌面外壳那一栏
 * 拿的本来就是首页那张脸（没台：只拦改表单与出图，聊天 / 开库 / 开别的台照常）。手机上给它们挂
 * **同一张脸**，入口才一致（右上头像 → 同一个面板）。
 */
export function StudioOperatorBenchDock({
  benchless = false,
}: {
  benchless?: boolean
}) {
  const { owner } = useStudioOperatorDockPlacement()
  // 「没台」是外壳里的说法（兜底那张首页脸住在外壳）：不在外壳里（单测里单挂一个台）⛔ 凭空挂一份。
  const inShell = useInStudioOperatorShell()
  if (owner !== 'bench') return null
  if (!benchless) return <StudioOperatorDock />
  return inShell ? <StudioOperatorBenchlessDock /> : null
}

/**
 * 首页那张脸 + 自己的开合。⚠ 首页宿主的 `open` 恒真（首页中间那一栏就是对话本身），原样拿到
 * 手机 Sheet 上就是一进台 Sheet 就盖满屏、还关不掉 —— 这里只把开合换成自己的。
 * ⚠ 只在手机（`owner === 'bench'`）挂：桌面不登记，外壳那一栏照旧读兜底那一份，换台不掐流。
 */
function StudioOperatorBenchlessDock() {
  const home = useHomeOperatorHost()
  const [open, setOpen] = useState(false)
  const host = useMemo(
    (): StudioOperatorHost => ({ ...home, open, setOpen }),
    [home, open],
  )
  return (
    <StudioOperatorHostProvider host={host}>
      <StudioOperatorDock />
    </StudioOperatorHostProvider>
  )
}
