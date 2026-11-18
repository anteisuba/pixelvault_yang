'use client'

import { createContext, useContext, type Context, type ReactNode } from 'react'

import {
  useUnifiedGenerate,
  type UseUnifiedGenerateReturn,
} from '@/hooks/use-unified-generate'

/**
 * 各台**在飞的那一单**住在外壳这一层（`(shell)/layout.tsx`），⛔ 不住在台自己身上。
 *
 * 为什么：每张台是一条独立路由（`(workspace)` 图片 / 视频、`/studio/lora`、`/studio/audio` …），
 * 点侧边栏换台 = 上一张台整颗卸载。出图状态（`activeRun` / `isGenerating` / 轮询定时器）
 * 原先是台自己 `useUnifiedGenerate()` 的本地 state：一卸载，状态没了，卸载清理还把轮询停掉。
 * 服务端那一单照样跑完落库，但切回来的新台上一个字都不知道 —— 进度卡、结果全消失
 * （2026-11-17 LoRA 台真机：28% 时切去配音台再切回，舞台上什么都没有）。
 *
 * 搬到这一层后，换台只卸掉画面，那一单的轮询、计时、结果都还在；切回来就接着画。
 * 每张台一个槽，互不串台；每个槽一颗自己的组件，一个槽在计时不会让别的槽的消费者重渲染。
 * 与 `LoraStackProvider` 挂在同一层是同一个理由（换台不丢）。
 */
export type StudioGenerationSessionId = 'workspace' | 'homeDraft' | 'lora'

const SESSION_CONTEXTS: Record<
  StudioGenerationSessionId,
  Context<UseUnifiedGenerateReturn | null>
> = {
  /** `(workspace)` 那一层的 `StudioProvider`：图片（自然语言 / 标签）与视频台。 */
  workspace: createContext<UseUnifiedGenerateReturn | null>(null),
  /** 首页那份看不见的小配方（`HomeDraftBench`）—— 与台上那份表单分开记。 */
  homeDraft: createContext<UseUnifiedGenerateReturn | null>(null),
  /** LoRA 装配台（那条路由故意不挂 `StudioProvider`）。 */
  lora: createContext<UseUnifiedGenerateReturn | null>(null),
}

function StudioGenerationSessionSlot({
  id,
  children,
}: {
  id: StudioGenerationSessionId
  children: ReactNode
}) {
  const generation = useUnifiedGenerate()
  const SessionContext = SESSION_CONTEXTS[id]
  return (
    <SessionContext.Provider value={generation}>
      {children}
    </SessionContext.Provider>
  )
}

export function StudioGenerationSessionsProvider({
  children,
}: {
  children: ReactNode
}) {
  return (
    <StudioGenerationSessionSlot id="workspace">
      <StudioGenerationSessionSlot id="homeDraft">
        <StudioGenerationSessionSlot id="lora">
          {children}
        </StudioGenerationSessionSlot>
      </StudioGenerationSessionSlot>
    </StudioGenerationSessionSlot>
  )
}

export function useStudioGenerationSession(
  id: StudioGenerationSessionId,
): UseUnifiedGenerateReturn {
  const session = useContext(SESSION_CONTEXTS[id])
  if (!session) {
    throw new Error(
      'useStudioGenerationSession must be used within StudioGenerationSessionsProvider',
    )
  }
  return session
}
