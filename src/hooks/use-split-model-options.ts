'use client'

import { useMemo } from 'react'

export interface SplitableModelOption {
  sourceType: string
  /**
   * Provider-level key coverage: the option's adapter has an active key, so it
   * is runnable even without a key row bound to this exact model id.
   */
  providerKeyId?: string
}

export interface SplitModelOptions<T extends SplitableModelOption> {
  saved: T[]
  locked: T[]
}

/**
 * 这个选项现在**能不能真的跑起来** —— 自带 key 或 provider 级 key 覆盖。
 *
 * ⚠ 2026-09-17 owner 拍板：生成类没有「平台免费额度」这一档，所以曾经算进来的
 * `freeTier` 整个删掉了；缺 key 一律落 locked，点开走 QuickSetupDialog（Hard Rule 8）。
 *
 * 台账 D7（2026-08-02）抽出来的：`useSplitModelOptions` 的分桶本来就
 * 是这套判据（saved = 可跑，locked = 缺 key），而
 * `GenerateComposer` 挑默认模型时只取 `modelOptions[0]`，不看可用性 ——
 * 于是新画布的默认模型是「OpenAI GPT Image 2」，一个在列表里明写着「需要
 * API key」的项，看起来能发、发了才失败。两处共用同一个谓词，别再手写第三份。
 */
export function isRunnableModelOption(option: SplitableModelOption): boolean {
  return option.sourceType === 'saved' || Boolean(option.providerKeyId)
}

/**
 * 分桶本体。抽成纯函数是因为三层选择器要**按分组**判桶（一个型号底下的几条
 * 渠道，只要有一条能跑，这个型号就不该落进「需要 API key」），而分组判桶发生在
 * 一次 render 里的循环中，调不了 hook。两处共用同一份分类，别再手写第三份。
 */
export function splitModelOptions<T extends SplitableModelOption>(
  options: T[],
): SplitModelOptions<T> {
  const saved: T[] = []
  const locked: T[] = []
  for (const opt of options) {
    if (opt.sourceType === 'saved' || opt.providerKeyId) {
      // Reachable through an existing key — "configured", not locked.
      saved.push(opt)
    } else {
      locked.push(opt)
    }
  }
  return { saved, locked }
}

export function useSplitModelOptions<T extends SplitableModelOption>(
  options: T[],
): SplitModelOptions<T> {
  return useMemo(() => splitModelOptions(options), [options])
}
