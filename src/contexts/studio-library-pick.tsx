'use client'

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import type { LoraStageContextValue } from '@/components/business/studio/lora/lora-stage-context'

/**
 * 「选给 XX 台」（第 9f 步方向 E 规矩 1）：库叠在中间，台在右边开着时，台把「我要什么」
 * 登记到外壳上，库那一类据此显示顶上那条「选给 XX 台」、按台的条件判断装不装得上。
 *
 * ⭐ 库与台不在同一棵树里（库在 `@library` 那一格 / 传送落点，台在 `children`），所以走
 *   外壳这一层的登记，⛔ 靠 Provider 嵌套。
 * 现在只有 LoRA 台：挂上去本来就进外壳那份挂载栈，这里只多给一样底模。
 */
interface StudioLibraryPickValue {
  lora: LoraStageContextValue | null
  setLora: (stage: LoraStageContextValue | null) => void
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
  const value = useMemo(() => ({ lora, setLora }), [lora])
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

/** 库里读：现在有没有台在等着挑、要什么。 */
export function useStudioLibraryPick(): Pick<StudioLibraryPickValue, 'lora'> {
  return { lora: useContext(StudioLibraryPickContext)?.lora ?? null }
}
