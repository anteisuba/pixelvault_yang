'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import { ROUTES } from '@/constants/routes'
import { useRouter } from '@/i18n/navigation'
import type { LoraStageContextValue } from '@/components/business/studio/lora/lora-stage-context'

/**
 * 「选给 XX 台」（第 9f 步方向 E 规矩 1）：台上「参考图 / 角色 / 模板 / 添加 LoRA」打开的都是
 * 外壳中间那一层库，顶上写「选给 XX 台」。
 *
 * ⭐ 库与台不在同一棵树里（库在 `@library` 那一格 / 传送落点，台在 `children`），所以走
 *   外壳这一层的登记，⛔ 靠 Provider 嵌套。两种登记：
 * - **LoRA**（9f-2b）：库本身就是挑的地方，挂上去进外壳那份挂载栈；台只多给一样底模。
 * - **标签**（9f-2c）：同 LoRA，库就是挑的地方；标签台登记一份「加进来」（`TagsLibraryAdder`）。
 * （10-25 起图片台的「角色 / 模板」不再开库，在台面出图区换上面板；原来的挑选落点已删。）
 */
/** 加到哪：整体 · 第几位角色 · 新建一位。 */
export type TagLookupTarget = 'whole' | 'new' | number

/**
 * 标签台登记给标签库的那一份（9f-2c）：库里详情的「加到整体 / 角色 N」走它。
 * ⚠ 函数是稳定引用（台那边经 ref 转一手），数据字段只在真的变了才换 —— 否则台每画一帧
 *   就登记一次，外壳跟着重画，台又重画……
 */
export interface TagsLibraryAdder {
  benchLabel: string
  /** 模型有角色构图（没有就只剩整体）。 */
  composition: boolean
  characterCount: number
  canAddCharacter: boolean
  /** 输入框当前在哪一页（默认加到那里）。 */
  followTarget: TagLookupTarget
  busy: boolean
  /** 正向标签里已经有这一个（画风开关看它）。 */
  hasPositive: (tag: string) => boolean
  /** 加进去；建了新角色就回它的位置，接着加就加到那一位。 */
  add: (tags: readonly string[], target: TagLookupTarget) => number | null
  toggleStyle: (name: string) => void
}

interface StudioLibraryPickValue {
  lora: LoraStageContextValue | null
  setLora: (stage: LoraStageContextValue | null) => void
  tags: TagsLibraryAdder | null
  setTags: (adder: TagsLibraryAdder | null) => void
  openLoraBench: () => void
}

const StudioLibraryPickContext = createContext<StudioLibraryPickValue | null>(
  null,
)

export function StudioLibraryPickProvider({
  children,
}: {
  children: ReactNode
}) {
  const [lora, setLora] = useState<LoraStageContextValue | null>(null)
  const [tags, setTags] = useState<TagsLibraryAdder | null>(null)
  const router = useRouter()
  const openLoraBench = useCallback(
    () => router.push(ROUTES.STUDIO_LORA),
    [router],
  )
  const value = useMemo<StudioLibraryPickValue>(
    () => ({
      lora,
      setLora,
      tags,
      setTags,
      openLoraBench,
    }),
    [lora, openLoraBench, tags],
  )
  return (
    <StudioLibraryPickContext.Provider value={value}>
      {children}
    </StudioLibraryPickContext.Provider>
  )
}

/** LoRA 台开着时登记底模；离场撤掉。外壳外面（不该发生）什么也不做。 */
export function useRegisterLoraLibraryPick(stage: LoraStageContextValue) {
  const setLora = useContext(StudioLibraryPickContext)?.setLora
  const { base, baseLabel } = stage
  useEffect(() => {
    if (!setLora) return
    setLora({ base, baseLabel })
    return () => setLora(null)
  }, [base, baseLabel, setLora])
}

/** 标签台开着（桌面）时登记那一份「加进来」；`null` = 不登记（手机还在台上查资料）。 */
export function useRegisterTagsLibraryPick(adder: TagsLibraryAdder | null) {
  const setTags = useContext(StudioLibraryPickContext)?.setTags
  useEffect(() => {
    if (!setTags || !adder) return
    setTags(adder)
    return () => setTags(null)
  }, [adder, setTags])
}

/** 库里读 LoRA 台的底模（9f-2b）与标签台那一份「加进来」（9f-2c）。外壳外面一律没有。 */
export function useStudioLibraryPick(): {
  lora: LoraStageContextValue | null
  tags: TagsLibraryAdder | null
} {
  const ctx = useContext(StudioLibraryPickContext)
  return { lora: ctx?.lora ?? null, tags: ctx?.tags ?? null }
}

/**
 * 库里「挂上」之后去不去 LoRA 台（owner 2026-10-28）：外壳里、LoRA 台没开（从左栏进的
 * 库）时给出跳过去的那一下，键写「去 LoRA 台用」—— 挂上就跳，已经挂着的直接跳。台开着
 * （台上「+ LoRA」进来）或不在外壳里一律 `null`：照旧只挂上、留在原地。
 */
export function useLoraBenchHandoff(): (() => void) | null {
  const ctx = useContext(StudioLibraryPickContext)
  if (!ctx || ctx.lora) return null
  return ctx.openLoraBench
}
