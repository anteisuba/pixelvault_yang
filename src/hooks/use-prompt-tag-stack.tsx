'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '@clerk/nextjs'

import { PROMPT_TAG_STACK_SAVE_DEBOUNCE_MS } from '@/constants/prompt-tags'
import {
  getPromptTagStackAPI,
  savePromptTagStackAPI,
} from '@/lib/api-client/prompt-tag-stack'
import {
  PromptTagSelectionSchema,
  type PromptPolarity,
  type PromptTagDefinition,
  type PromptTagSelection,
  type PromptTagStack,
  type PromptTagStackSides,
} from '@/types/prompt-tags'

/**
 * 标签堆存在账号里（`/api/prompt-tags/stack`）。2026-10-22 之前只存在这个浏览器
 * key 下：账号里还没有那一份时读一次、传上去，之后不再读写它。
 */
const LEGACY_STORAGE_KEY_PREFIX = 'pv.prompt-tag-stack.v1'

function readSelections(value: unknown): PromptTagSelection[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const parsed = PromptTagSelectionSchema.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
}

function readLegacyStack(clerkId: string): PromptTagStackSides {
  const empty = { positive: [], negative: [] }
  if (typeof window === 'undefined') return empty
  try {
    const raw = window.localStorage.getItem(
      `${LEGACY_STORAGE_KEY_PREFIX}.${clerkId}`,
    )
    if (!raw) return empty
    const stack = JSON.parse(raw) as Partial<PromptTagStack> | null
    if (!stack || stack.ownerClerkId !== clerkId || stack.version !== 1) {
      return empty
    }
    return {
      positive: readSelections(stack.positive),
      negative: readSelections(stack.negative),
    }
  } catch {
    return empty
  }
}

function selectionId(tagId: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${tagId}:${Date.now().toString(36)}`
}

function createSelection(
  tag: PromptTagDefinition,
  orderIndex: number,
): PromptTagSelection {
  return {
    id: selectionId(tag.id),
    tagId: tag.id,
    promptText: tag.promptText,
    label: tag.label,
    polarity: tag.polarity,
    source: tag.source,
    type: tag.type,
    weight: tag.defaultWeight,
    enabled: true,
    orderIndex,
    insertedAt: new Date().toISOString(),
  }
}

interface PromptTagStackValue {
  positive: PromptTagSelection[]
  negative: PromptTagSelection[]
  selectedTagIds: ReadonlySet<string>
  selectedCount: number
  addTag(tag: PromptTagDefinition): void
  removeTag(tagId: string): void
  clearTags(polarity?: PromptPolarity): void
  setWeight(selectionId: string, weight?: number): void
  allSelections(): PromptTagSelection[]
}

const PromptTagStackContext = createContext<PromptTagStackValue | null>(null)

export function PromptTagProvider({ children }: { children: ReactNode }) {
  const [positive, setPositive] = useState<PromptTagSelection[]>([])
  const [negative, setNegative] = useState<PromptTagSelection[]>([])
  // 只有从账号里读到（或首次传上去）之后才往回存：读失败时 ⛔ 不拿空堆盖掉账号里那份。
  const hasHydrated = useRef(false)
  const loadedForClerkId = useRef<string | null>(null)
  const lastSavedJson = useRef<string | null>(null)
  const pendingSave = useRef<PromptTagStackSides | null>(null)
  const { isLoaded, userId } = useAuth()
  const activeClerkId = isLoaded ? userId : null

  useEffect(() => {
    hasHydrated.current = false
    pendingSave.current = null
    loadedForClerkId.current = activeClerkId
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPositive([])
    setNegative([])
    if (activeClerkId === null) return

    let cancelled = false
    const apply = (stack: PromptTagStackSides) => {
      setPositive(stack.positive)
      setNegative(stack.negative)
      lastSavedJson.current = JSON.stringify(stack)
      hasHydrated.current = true
    }
    getPromptTagStackAPI()
      .then(async (stored) => {
        if (cancelled) return
        if (stored) {
          apply(stored)
          return
        }
        const legacy = readLegacyStack(activeClerkId)
        if (legacy.positive.length > 0 || legacy.negative.length > 0) {
          await savePromptTagStackAPI(legacy)
          if (cancelled) return
        }
        apply(legacy)
      })
      .catch(() => {
        // 读不到就先空着、不存；下次进页面再读。
      })
    return () => {
      cancelled = true
    }
  }, [activeClerkId])

  const flushSave = useCallback(() => {
    const stack = pendingSave.current
    if (!stack) return
    pendingSave.current = null
    const json = JSON.stringify(stack)
    if (json === lastSavedJson.current) return
    lastSavedJson.current = json
    void savePromptTagStackAPI(stack).catch(() => {
      // 下一次改动会再存整份；这里不重试。
      lastSavedJson.current = null
    })
  }, [])

  useEffect(() => {
    if (!hasHydrated.current || activeClerkId === null) return
    if (loadedForClerkId.current !== activeClerkId) return
    pendingSave.current = { positive, negative }
    const timer = window.setTimeout(
      flushSave,
      PROMPT_TAG_STACK_SAVE_DEBOUNCE_MS,
    )
    return () => window.clearTimeout(timer)
  }, [activeClerkId, positive, negative, flushSave])

  // 离开 LoRA 台或关页时，没等到的那次也存掉。
  useEffect(() => {
    window.addEventListener('pagehide', flushSave)
    return () => {
      window.removeEventListener('pagehide', flushSave)
      flushSave()
    }
  }, [flushSave])

  const addTag = useCallback((tag: PromptTagDefinition) => {
    const update = (prev: PromptTagSelection[]) => {
      if (prev.some((selection) => selection.tagId === tag.id)) return prev
      return [...prev, createSelection(tag, prev.length)]
    }
    if (tag.polarity === 'negative') {
      setNegative(update)
      return
    }
    setPositive(update)
  }, [])

  const removeTag = useCallback((tagId: string) => {
    setPositive((prev) => prev.filter((selection) => selection.tagId !== tagId))
    setNegative((prev) => prev.filter((selection) => selection.tagId !== tagId))
  }, [])

  const clearTags = useCallback((polarity?: PromptPolarity) => {
    if (!polarity || polarity === 'positive') setPositive([])
    if (!polarity || polarity === 'negative') setNegative([])
  }, [])

  const setWeight = useCallback((selectionIdValue: string, weight?: number) => {
    const update = (selection: PromptTagSelection): PromptTagSelection =>
      selection.id === selectionIdValue ? { ...selection, weight } : selection
    setPositive((prev) => prev.map(update))
    setNegative((prev) => prev.map(update))
  }, [])

  const allSelections = useCallback(
    () => [...positive, ...negative],
    [positive, negative],
  )

  const selectedTagIds = useMemo(
    () =>
      new Set([...positive, ...negative].map((selection) => selection.tagId)),
    [positive, negative],
  )

  const value = useMemo<PromptTagStackValue>(
    () => ({
      positive,
      negative,
      selectedTagIds,
      selectedCount: positive.length + negative.length,
      addTag,
      removeTag,
      clearTags,
      setWeight,
      allSelections,
    }),
    [
      positive,
      negative,
      selectedTagIds,
      addTag,
      removeTag,
      clearTags,
      setWeight,
      allSelections,
    ],
  )

  return (
    <PromptTagStackContext.Provider value={value}>
      {children}
    </PromptTagStackContext.Provider>
  )
}

export function usePromptTagStack(): PromptTagStackValue {
  const ctx = useContext(PromptTagStackContext)
  if (!ctx) {
    throw new Error(
      'usePromptTagStack must be used inside a <PromptTagProvider>',
    )
  }
  return ctx
}
