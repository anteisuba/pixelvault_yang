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

import { PROMPT_TAG_RECENT_STORAGE_PREFIX } from '@/constants/prompt-tags'
import type {
  PromptPolarity,
  PromptTagDefinition,
  PromptTagSelection,
  PromptTagStack,
} from '@/types/prompt-tags'

const STORAGE_KEY_PREFIX = 'pv.prompt-tag-stack.v1'

function getStorageKey(clerkId: string): string {
  return `${STORAGE_KEY_PREFIX}.${clerkId}`
}

function isPolarity(value: unknown): value is PromptPolarity {
  return value === 'positive' || value === 'negative'
}

function isPromptTagSelection(value: unknown): value is PromptTagSelection {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.tagId === 'string' &&
    typeof record.promptText === 'string' &&
    typeof record.label === 'string' &&
    isPolarity(record.polarity) &&
    typeof record.source === 'string' &&
    typeof record.type === 'string' &&
    typeof record.enabled === 'boolean' &&
    typeof record.orderIndex === 'number' &&
    typeof record.insertedAt === 'string' &&
    (record.weight === undefined || typeof record.weight === 'number')
  )
}

function readFromStorage(clerkId: string): {
  positive: PromptTagSelection[]
  negative: PromptTagSelection[]
} {
  if (typeof window === 'undefined') return { positive: [], negative: [] }
  try {
    const raw = window.localStorage.getItem(getStorageKey(clerkId))
    if (!raw) return { positive: [], negative: [] }
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') {
      return { positive: [], negative: [] }
    }
    const stack = parsed as Partial<PromptTagStack>
    if (stack.ownerClerkId !== clerkId || stack.version !== 1) {
      return { positive: [], negative: [] }
    }
    return {
      positive: Array.isArray(stack.positive)
        ? stack.positive.filter(isPromptTagSelection)
        : [],
      negative: Array.isArray(stack.negative)
        ? stack.negative.filter(isPromptTagSelection)
        : [],
    }
  } catch {
    return { positive: [], negative: [] }
  }
}

function writeToStorage(
  clerkId: string,
  positive: PromptTagSelection[],
  negative: PromptTagSelection[],
): void {
  if (typeof window === 'undefined') return
  try {
    const stack: PromptTagStack = {
      ownerClerkId: clerkId,
      version: 1,
      positive,
      negative,
      updatedAt: new Date().toISOString(),
    }
    window.localStorage.setItem(getStorageKey(clerkId), JSON.stringify(stack))
  } catch {
    // Storage can be full or disabled; keep the in-memory stack usable.
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
  const hasHydrated = useRef(false)
  const loadedForClerkId = useRef<string | null>(null)
  const { isLoaded, userId } = useAuth()
  const activeClerkId = isLoaded ? userId : null

  useEffect(() => {
    hasHydrated.current = false
    if (activeClerkId === null) {
      loadedForClerkId.current = null
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPositive([])
      setNegative([])
      return
    }

    loadedForClerkId.current = activeClerkId
    const stored = readFromStorage(activeClerkId)
    setPositive(stored.positive)
    setNegative(stored.negative)
    hasHydrated.current = true
  }, [activeClerkId])

  useEffect(() => {
    if (!hasHydrated.current || activeClerkId === null) return
    if (loadedForClerkId.current !== activeClerkId) return
    writeToStorage(activeClerkId, positive, negative)
  }, [activeClerkId, positive, negative])

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

export function getPromptTagRecentStorageKey(clerkId: string): string {
  return `${PROMPT_TAG_RECENT_STORAGE_PREFIX}.${clerkId}`
}
