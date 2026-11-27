'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { PROMPT_TAG_WEIGHT } from '@/constants/prompt-dialects'
import { snapTagWeight } from '@/lib/tag-composer'
import {
  TagPromptBlockListSchema,
  type TagBlockMode,
  type TagBlockPosition,
  type TagBlockTarget,
  type TagPromptBlock,
} from '@/lib/tag-prompt-blocks'

const STORAGE_KEY = 'antei.tagStudio.promptBlocks.v1'
const MAX_BLOCKS = 30

interface TagPromptBlocksStoreState {
  blocks: readonly TagPromptBlock[]
  sequenceCounter: number
}

const EMPTY_STATE: TagPromptBlocksStoreState = {
  blocks: [],
  sequenceCounter: 0,
}

let state: TagPromptBlocksStoreState = EMPTY_STATE
let hydrated = false
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function persist(next: TagPromptBlocksStoreState) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        blocks: next.blocks,
        sequenceCounter: next.sequenceCounter,
      }),
    )
  } catch {
    // Ignore storage quota/privacy errors
  }
}

function hydrateOnce() {
  if (hydrated || typeof window === 'undefined') return
  hydrated = true
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as {
      blocks?: unknown
      sequenceCounter?: unknown
    }
    const list = TagPromptBlockListSchema.safeParse(parsed.blocks)
    if (list.success) {
      state = {
        blocks: list.data,
        sequenceCounter:
          typeof parsed.sequenceCounter === 'number' &&
          Number.isInteger(parsed.sequenceCounter) &&
          parsed.sequenceCounter >= 0
            ? parsed.sequenceCounter
            : 0,
      }
    }
  } catch {
    // Ignore malformed local draft
  }
}

function setState(next: TagPromptBlocksStoreState) {
  state = next
  persist(next)
  emit()
}

function createBlockId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID()
  }
  return `blk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** 非 Hook 读取：出图提交瞬间同步取最新积木列表与轮换步数。 */
export function getTagPromptBlocksSnapshot(): TagPromptBlocksStoreState {
  hydrateOnce()
  return state
}

/** 出图编译完一批后回写顺序游标、随机最近抽中项与全局顺序计数器。 */
export function commitTagPromptBlocksBatch(
  nextBlocks: readonly TagPromptBlock[],
  nextSequenceCounter: number,
): void {
  hydrateOnce()
  setState({
    blocks: [...nextBlocks],
    sequenceCounter: Math.max(0, Math.floor(nextSequenceCounter)),
  })
}

/** 助手应用 / 撤销整份积木清单（同步落盘并通知所有订阅组件）。 */
export function replaceTagPromptBlocks(
  nextBlocks: readonly TagPromptBlock[],
): void {
  hydrateOnce()
  setState({
    blocks: [...nextBlocks].slice(0, MAX_BLOCKS),
    sequenceCounter: state.sequenceCounter,
  })
}

/** 仅测试用：重置内存与持久化状态。 */
export function __resetTagPromptBlocksForTests(): void {
  state = EMPTY_STATE
  hydrated = false
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Ignore
    }
  }
  emit()
}

function subscribe(listener: () => void) {
  hydrateOnce()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getClientSnapshot(): TagPromptBlocksStoreState {
  hydrateOnce()
  return state
}

function getServerSnapshot(): TagPromptBlocksStoreState {
  return EMPTY_STATE
}

export function useTagPromptBlocks() {
  const snapshot = useSyncExternalStore(
    subscribe,
    getClientSnapshot,
    getServerSnapshot,
  )

  const activeBlocks = snapshot.blocks.filter(
    (block) =>
      block.enabled && block.items.some((item) => item.trim().length > 0),
  )

  const addBlock = useCallback(
    (initial?: {
      name?: string
      mode?: TagBlockMode
      target?: TagBlockTarget
      position?: TagBlockPosition
      items?: string[]
      weight?: number
    }) => {
      const current = getTagPromptBlocksSnapshot()
      if (current.blocks.length >= MAX_BLOCKS) return null
      const block: TagPromptBlock = {
        id: createBlockId(),
        name: initial?.name ?? '',
        target: initial?.target ?? 'positive',
        position: initial?.position ?? 'suffix',
        mode: initial?.mode ?? 'fixed',
        enabled: true,
        locked: false,
        weight: snapTagWeight(initial?.weight ?? PROMPT_TAG_WEIGHT.DEFAULT),
        items: initial?.items ?? [],
        cursor: 0,
      }
      setState({
        ...current,
        blocks: [...current.blocks, block],
      })
      return block.id
    },
    [],
  )

  const updateBlock = useCallback(
    (id: string, patch: Partial<Omit<TagPromptBlock, 'id'>>) => {
      const current = getTagPromptBlocksSnapshot()
      setState({
        ...current,
        blocks: current.blocks.map((block) => {
          if (block.id !== id) return block
          const nextItems = patch.items ?? block.items
          const nonEmptyCount = nextItems.filter((item) => item.trim()).length
          const rawCursor = patch.cursor ?? block.cursor
          const clampedCursor =
            nonEmptyCount > 0 ? Math.max(0, rawCursor % nonEmptyCount) : 0
          return {
            ...block,
            ...patch,
            weight:
              patch.weight !== undefined
                ? snapTagWeight(patch.weight)
                : block.weight,
            cursor: clampedCursor,
          }
        }),
      })
    },
    [],
  )

  const removeBlock = useCallback((id: string) => {
    const current = getTagPromptBlocksSnapshot()
    setState({
      ...current,
      blocks: current.blocks.filter((block) => block.id !== id),
    })
  }, [])

  const moveBlock = useCallback((id: string, delta: -1 | 1) => {
    const current = getTagPromptBlocksSnapshot()
    const index = current.blocks.findIndex((block) => block.id === id)
    const targetIndex = index + delta
    if (index < 0 || targetIndex < 0 || targetIndex >= current.blocks.length) {
      return
    }
    const next = [...current.blocks]
    const [moved] = next.splice(index, 1)
    next.splice(targetIndex, 0, moved!)
    setState({ ...current, blocks: next })
  }, [])

  return {
    blocks: snapshot.blocks,
    activeBlocks,
    sequenceCounter: snapshot.sequenceCounter,
    canAddMore: snapshot.blocks.length < MAX_BLOCKS,
    addBlock,
    updateBlock,
    removeBlock,
    moveBlock,
  }
}
