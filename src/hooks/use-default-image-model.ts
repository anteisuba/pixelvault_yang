'use client'

import { useEffect, useMemo } from 'react'
import { usePathname } from 'next/navigation'

import { getModelUnitPriceByStringId } from '@/constants/models/unit-prices'
import {
  getPromptDialect,
  type PromptDialect,
} from '@/constants/prompt-dialects'
import { ROUTES } from '@/constants/routes'
import {
  STUDIO_LAST_IMAGE_MODEL_STORAGE_KEY,
  STUDIO_LAST_TAGS_MODEL_STORAGE_KEY,
} from '@/constants/studio'
import type { StudioModelOption } from '@/types/model-option'
import { useStudioForm } from '@/contexts/studio-context'

/**
 * `/studio/image` 的默认模型（owner 2026-09-03 拍板）。
 *
 * 规则，按顺序：
 * 1. localStorage 里「上次使用的模型」（`STUDIO_LAST_IMAGE_MODEL_STORAGE_KEY`），
 *    且该 optionId 在当前可用路由里仍然存在；
 * 2. 否则取**已配置 API key** 的图片路由里单价最低的一条；
 * 3. 都不成立 → 保持空态。缺 key 不禁用 UI，生成时由既有的
 *    `QuickSetupDialog` 路由接手（Hard Rule 8，此处不重复实现）。
 *
 * ⚠ 只作用于图片档。视频/音频的默认值一个字都不改。
 */

/** 选型只需要三个事实——刻意不吃整个 `StudioModelOption`，好让它可以被穷举测试。 */
export interface DefaultImageModelCandidate {
  optionId: string
  /** 这条路由今天能不能跑（自己的 key 行，或 provider 级已有 key）。 */
  keyConfigured: boolean
  /** USD/张。undefined = 单价表里没有可信数据（`MODEL_UNIT_PRICES` 宁可留空）。 */
  unitPriceUsd?: number
}

/**
 * 「已配置 API key」的判据与模型选择器行内那枚指示灯同源：显式 key 行
 * (`sourceType === 'saved'`)，或 provider 级覆盖 (`providerKeyId`，见
 * `withProviderKeyCoverage`)。平台免费额度不算——owner 的规则写的是「provider
 * 已配置 API key」。
 */
export function toDefaultImageModelCandidates(
  options: readonly StudioModelOption[],
): DefaultImageModelCandidate[] {
  return options.map((option) => {
    const price = getModelUnitPriceByStringId(option.modelId)
    return {
      optionId: option.optionId,
      keyConfigured:
        option.sourceType === 'saved' || Boolean(option.providerKeyId),
      unitPriceUsd: price?.unit === 'image' ? price.amount : undefined,
    }
  })
}

/**
 * 纯函数：给一组候选 + 记住的 optionId，算出该默认选中哪一条（或 null）。
 *
 * 缺价的候选不是「不可选」，只是排在所有有价的后面——否则一个还没进单价表的
 * 模型会让「有 key 却仍是空模型」重新出现，而空态正是这条规则要修的问题。
 */
export function pickDefaultImageModelOptionId(
  candidates: readonly DefaultImageModelCandidate[],
  storedOptionId: string | null,
): string | null {
  if (
    storedOptionId &&
    candidates.some((candidate) => candidate.optionId === storedOptionId)
  ) {
    return storedOptionId
  }

  let best: DefaultImageModelCandidate | null = null
  for (const candidate of candidates) {
    if (!candidate.keyConfigured) continue
    if (!best) {
      best = candidate
      continue
    }
    const price = candidate.unitPriceUsd ?? Number.POSITIVE_INFINITY
    const bestPrice = best.unitPriceUsd ?? Number.POSITIVE_INFINITY
    // 严格小于 → 同价时先出现的那条赢，结果对同一份目录是稳定的。
    if (price < bestPrice) best = candidate
  }

  return best?.optionId ?? null
}

/** 「上次用的模型」按台分开记（D10 ②）。 */
export function storageKeyForDialect(dialect: PromptDialect): string {
  return dialect === 'tags'
    ? STUDIO_LAST_TAGS_MODEL_STORAGE_KEY
    : STUDIO_LAST_IMAGE_MODEL_STORAGE_KEY
}

/** SSR 安全：服务端没有 localStorage，隐私模式下读写都可能直接抛。 */
export function readStoredImageModelOptionId(
  dialect: PromptDialect = 'natural',
): string | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = window.localStorage.getItem(storageKeyForDialect(dialect))
    return stored && stored.length > 0 ? stored : null
  } catch {
    return null
  }
}

export function writeStoredImageModelOptionId(
  optionId: string,
  dialect: PromptDialect = 'natural',
): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKeyForDialect(dialect), optionId)
  } catch {
    // 写不进去只是下次不记得，不该把工作台带崩。
  }
}

/**
 * 图片的两台都算（带 locale 前缀，如 `/zh/studio/image` 与
 * `/zh/studio/image/tags`）。⚠ 标签台的路径以图片台的路径开头，所以先判长的
 * 那条 —— 反过来写会让标签台永远匹配成图片台。
 */
export function isImageStudioPathname(pathname: string | null): boolean {
  if (!pathname) return false
  return (
    pathname === ROUTES.STUDIO_IMAGE ||
    pathname.endsWith(ROUTES.STUDIO_IMAGE) ||
    pathname === ROUTES.STUDIO_IMAGE_TAGS ||
    pathname.endsWith(ROUTES.STUDIO_IMAGE_TAGS)
  )
}

/**
 * 挂在 `useImageModelOptions` 里：图片工作台一进来就把模型填上，并把用户之后
 * 每一次**显式**选型记进 localStorage。
 *
 * ⚠ 自动选中走 `AUTO_SELECT_OPTION_ID`（不置 `modelSelectionTouched`），所以
 * 它既不会被当成用户的选择写回存储，也不会掩盖「用户把最后一行模型删掉 →
 * 就是要空态」这个意图：那条路径走 `SET_OPTION_ID`，一旦 touched 为真，本 hook
 * 这辈子都不再自动补模型。
 */
export function useDefaultImageModel(
  modelOptions: readonly StudioModelOption[],
): void {
  const { state, dispatch } = useStudioForm()
  const pathname = usePathname()
  const active = isImageStudioPathname(pathname) && state.outputType === 'image'
  const { selectedOptionId, modelSelectionTouched, promptDialect } = state

  /** 这一台的名单 —— 只有本方言的型号（D10 ② Q3「⛔ 不跨方言」）。 */
  const dialectOptions = useMemo(
    () =>
      modelOptions.filter(
        (option) => getPromptDialect(option.adapterType) === promptDialect,
      ),
    [modelOptions, promptDialect],
  )

  useEffect(() => {
    if (!active) return
    if (dialectOptions.length === 0) return

    const candidates = toDefaultImageModelCandidates(dialectOptions)
    /**
     * 选中的那条属不属于这一台。⚠ **跨台的陈旧选择永远不是用户的意图**
     * （在自然语言台选的 GPT 跟着走进标签台），所以它是唯一一个越过
     * `modelSelectionTouched` 去自动补位的口子；「把最后一行删掉 = 就是要空态」
     * 那条路径（`selectedOptionId === null`）照旧一个字不动。
     */
    const crossDialect =
      selectedOptionId !== null &&
      !candidates.some((candidate) => candidate.optionId === selectedOptionId)

    if (!crossDialect) {
      if (selectedOptionId !== null) return
      if (modelSelectionTouched) return
    }

    const optionId = pickDefaultImageModelOptionId(
      candidates,
      readStoredImageModelOptionId(promptDialect),
    )
    if (!optionId) return
    dispatch({ type: 'AUTO_SELECT_OPTION_ID', payload: optionId })
  }, [
    active,
    dispatch,
    dialectOptions,
    modelSelectionTouched,
    promptDialect,
    selectedOptionId,
  ])

  useEffect(() => {
    if (!active) return
    if (!modelSelectionTouched) return
    if (!selectedOptionId) return
    writeStoredImageModelOptionId(selectedOptionId, promptDialect)
  }, [active, modelSelectionTouched, promptDialect, selectedOptionId])
}
