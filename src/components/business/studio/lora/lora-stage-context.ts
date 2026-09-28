'use client'

import { createContext, useContext } from 'react'

import type { LoraBaseModel } from '@/constants/lora-base-models'

export interface LoraStageContextValue {
  /** 生成台当前选中的底模（库里判断「装不装得上」用）。 */
  readonly base: LoraBaseModel | null
  /** 与装配列那一行同一个名字（`spine.<translationKey>` 优先）。 */
  readonly baseLabel: string | null
}

const LoraStageContext = createContext<LoraStageContextValue>({
  base: null,
  baseLabel: null,
})

/**
 * 库 / 收藏住在生成台那一副舞台里（lora-library.md §2），底模状态在生成台手上：
 * 由 GenerateBranch 在库那一层外面给，库里的详情页读它判断「装不装得上」。
 */
export const LoraStageProvider = LoraStageContext.Provider

export function useLoraStage(): LoraStageContextValue {
  return useContext(LoraStageContext)
}
