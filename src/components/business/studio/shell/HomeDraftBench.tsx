'use client'

import { memo, useLayoutEffect } from 'react'

import { StudioProvider } from '@/contexts/studio-context'
import type { StudioOperatorHost } from '@/contexts/studio-operator-host'
import { useHomeDraftOperatorHost } from '@/hooks/use-home-draft-operator-host'
import { useStudioGenerateAction } from '@/hooks/use-studio-generate-action'

/**
 * 首页那份小配方（第 9g 步）：一份看不见的图片台表单，对话里直接出图用。
 *
 * ⭐ 自己挂一份 `StudioProvider`：台上那份表单（`(workspace)` 那一层）一个字都不碰；
 *   宿主交给外壳（`onHost`），面板照常拿它当首页那张脸。
 * ⚠ 只在首页挂（外壳按 `kind` 判）：台开着时这一份不在，⛔ 两份表单抢着记「上次用的型号」。
 */
/*
 * ⚠ 必须 `memo`（10-24 线上 React #185）：宿主交给外壳 = 外壳 setState 重渲染；不挡住的话
 *   这一份跟着重渲染、宿主又是新的、再交一次……死循环。挡住之后只有这份表单自己变了才重算。
 *   `onHost` 因此必须是稳的（外壳给的是 `useState` 的 setter）。
 */
export const HomeDraftBench = memo(function HomeDraftBench({
  onHost,
}: {
  onHost(host: StudioOperatorHost | null): void
}) {
  return (
    <StudioProvider>
      <HomeDraftHostSource onHost={onHost} />
      <HomeDraftGenerate />
    </StudioProvider>
  )
})

function HomeDraftHostSource({
  onHost,
}: {
  onHost(host: StudioOperatorHost | null): void
}) {
  const host = useHomeDraftOperatorHost()
  useLayoutEffect(() => onHost(host), [host, onHost])
  useLayoutEffect(() => () => onHost(null), [onHost])
  return null
}

/**
 * `REQUEST_GENERATE` 的执行端（这一份表单只挂这一颗）：确认卡按下去走的就是图片台那颗出图键的同一条路
 * —— 闸门、请求组装、排队、扣额度都在 `useStudioGenerateAction` 里。
 */
function HomeDraftGenerate() {
  useStudioGenerateAction()
  return null
}
