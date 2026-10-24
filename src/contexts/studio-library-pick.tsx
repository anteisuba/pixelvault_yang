'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import type { StudioLibraryCategoryId } from '@/constants/studio-shell'
import type { LoraStageContextValue } from '@/components/business/studio/lora/lora-stage-context'

/**
 * 「选给 XX 台」（第 9f 步方向 E 规矩 1）：台上「参考图 / 角色 / 模板 / 添加 LoRA」打开的都是
 * 外壳中间那一层库，顶上写「选给 XX 台」。
 *
 * ⭐ 库与台不在同一棵树里（库在 `@library` 那一格 / 传送落点，台在 `children`），所以走
 *   外壳这一层的登记，⛔ 靠 Provider 嵌套。两种登记：
 * - **LoRA**（9f-2b）：库本身就是挑的地方，挂上去进外壳那份挂载栈；台只多给一样底模。
 * - **标签**（9f-2c）：同 LoRA，库就是挑的地方；标签台登记一份「加进来」（`TagsLibraryAdder`）。
 * - **挑选落点**（9f-2d）：库那一类在挑选的样子（`?pick=1`）只画外框和一格落点，里面那份
 *   挑选界面由**台自己**传送进来 —— 它还在台的那棵树里，台的状态（容量、造型、模板撤销…）
 *   原样可用，⛔ 把台的状态搬一份到库里。
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

interface PickProvider {
  id: string
  category: StudioLibraryCategoryId
  benchLabel: string
}

interface StudioLibraryPickValue {
  lora: LoraStageContextValue | null
  setLora: (stage: LoraStageContextValue | null) => void
  tags: TagsLibraryAdder | null
  setTags: (adder: TagsLibraryAdder | null) => void
  /** 登记的先后：同一类最后一条说了算。 */
  providers: readonly PickProvider[]
  setProviders: (
    update: (current: readonly PickProvider[]) => readonly PickProvider[],
  ) => void
  slots: Partial<Record<StudioLibraryCategoryId, HTMLElement>>
  setSlot: (category: StudioLibraryCategoryId, node: HTMLElement | null) => void
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
  const [providers, setProviders] = useState<readonly PickProvider[]>([])
  const [slots, setSlots] = useState<
    Partial<Record<StudioLibraryCategoryId, HTMLElement>>
  >({})
  // ⚠ 稳定引用：落点的 ref 回调靠它，换了引用 ref 就会解绑重绑、再触发一轮更新。
  const setSlot = useCallback(
    (category: StudioLibraryCategoryId, node: HTMLElement | null) =>
      setSlots((current) => {
        if ((current[category] ?? null) === node) return current
        const next = { ...current }
        if (node) next[category] = node
        else delete next[category]
        return next
      }),
    [],
  )
  const value = useMemo<StudioLibraryPickValue>(
    () => ({
      lora,
      setLora,
      tags,
      setTags,
      providers,
      setProviders,
      slots,
      setSlot,
    }),
    [lora, tags, providers, slots, setSlot],
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

/**
 * 台登记「这一类我来挑」，拿回库那一格落点 —— 只有**说了算的那一处**拿得到（同一个台
 * 可能登记两处：桌面 chip 与手机「＋」抽屉，后挂的说了算，⛔ 传送两份）。
 * `benchLabel` 给 `null` = 不登记（例如视频档不收参考图）。
 */
export function useLibraryPickSlot(
  category: StudioLibraryCategoryId,
  benchLabel: string | null,
): HTMLElement | null {
  const ctx = useContext(StudioLibraryPickContext)
  const setProviders = ctx?.setProviders
  const id = useId()
  useEffect(() => {
    if (!setProviders || benchLabel === null) return
    setProviders((current) => [
      ...current.filter((entry) => entry.id !== id),
      { id, category, benchLabel },
    ])
    return () =>
      setProviders((current) => current.filter((entry) => entry.id !== id))
  }, [benchLabel, category, id, setProviders])
  if (!ctx || benchLabel === null) return null
  const owner = ctx.providers.findLast((entry) => entry.category === category)
  return owner?.id === id ? (ctx.slots[category] ?? null) : null
}

/** 库那一格读：这一类现在有没有台在等着挑（有就是台的名字）。 */
export function useLibraryPickProvider(
  category: StudioLibraryCategoryId,
): string | null {
  const ctx = useContext(StudioLibraryPickContext)
  return (
    ctx?.providers.findLast((entry) => entry.category === category)
      ?.benchLabel ?? null
  )
}

/** 库那一格登记落点。 */
export function useSetLibraryPickSlot():
  | StudioLibraryPickValue['setSlot']
  | null {
  return useContext(StudioLibraryPickContext)?.setSlot ?? null
}

/** 库里读 LoRA 台的底模（9f-2b）与标签台那一份「加进来」（9f-2c）。外壳外面一律没有。 */
export function useStudioLibraryPick(): {
  lora: LoraStageContextValue | null
  tags: TagsLibraryAdder | null
} {
  const ctx = useContext(StudioLibraryPickContext)
  return { lora: ctx?.lora ?? null, tags: ctx?.tags ?? null }
}
