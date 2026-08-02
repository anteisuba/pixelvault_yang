'use client'

import { useMemo } from 'react'

export interface SplitableModelOption {
  sourceType: string
  freeTier?: boolean
  /**
   * Provider-level key coverage: the option's adapter has an active key, so it
   * is runnable even without a key row bound to this exact model id.
   */
  providerKeyId?: string
}

export interface SplitModelOptions<T extends SplitableModelOption> {
  saved: T[]
  platform: T[]
  locked: T[]
}

/**
 * 这个选项现在**能不能真的跑起来** —— 自带 key / 平台免费额度 / provider 级
 * key 覆盖，三者有其一即可。
 *
 * 台账 D7（2026-08-02）抽出来的：`useSplitModelOptions` 的三桶分法本来就
 * 是这套判据（saved + platform = 可跑，locked = 缺 key），而
 * `GenerateComposer` 挑默认模型时只取 `modelOptions[0]`，不看可用性 ——
 * 于是新画布的默认模型是「OpenAI GPT Image 2」，一个在列表里明写着「需要
 * API key」的项，看起来能发、发了才失败。两处共用同一个谓词，别再手写第三份。
 */
export function isRunnableModelOption(option: SplitableModelOption): boolean {
  return (
    option.sourceType === 'saved' ||
    Boolean(option.freeTier) ||
    Boolean(option.providerKeyId)
  )
}

export function useSplitModelOptions<T extends SplitableModelOption>(
  options: T[],
): SplitModelOptions<T> {
  return useMemo(() => {
    const saved: T[] = []
    const platform: T[] = []
    const locked: T[] = []
    for (const opt of options) {
      if (opt.sourceType === 'saved') {
        saved.push(opt)
      } else if (opt.freeTier) {
        // Platform quota outranks spending the user's own key.
        platform.push(opt)
      } else if (opt.providerKeyId) {
        // Reachable through an existing provider key — "configured", not locked.
        saved.push(opt)
      } else {
        locked.push(opt)
      }
    }
    return { saved, platform, locked }
  }, [options])
}
