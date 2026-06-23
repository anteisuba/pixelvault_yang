import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  STUDIO_NODE_HANDOFF_STORAGE_KEY,
  STUDIO_NODE_RESULT_STORAGE_KEY,
} from '@/constants/studio'
import {
  clearStudioNodeHandoff,
  clearStudioNodeResult,
  readStudioNodeHandoff,
  readStudioNodeResult,
  writeStudioNodeHandoff,
  writeStudioNodeResult,
} from './studio-node-handoff'

const store = new Map<string, string>()

beforeEach(() => {
  store.clear()
  vi.stubGlobal('window', {
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('studio node handoff (outbound)', () => {
  it('round-trips a handoff and defaults referenceUrls', () => {
    writeStudioNodeHandoff({
      originNodeId: 'node-1',
      prompt: 'a knight',
      characterName: 'Aria',
      referenceUrls: ['https://cdn.test/a.png'],
    })

    expect(readStudioNodeHandoff()).toEqual({
      originNodeId: 'node-1',
      prompt: 'a knight',
      characterName: 'Aria',
      referenceUrls: ['https://cdn.test/a.png'],
    })
  })

  it('returns null for a missing or malformed payload', () => {
    expect(readStudioNodeHandoff()).toBeNull()
    store.set(STUDIO_NODE_HANDOFF_STORAGE_KEY, '{not json')
    expect(readStudioNodeHandoff()).toBeNull()
    store.set(STUDIO_NODE_HANDOFF_STORAGE_KEY, JSON.stringify({ prompt: 'x' }))
    expect(readStudioNodeHandoff()).toBeNull()
  })

  it('clears the handoff', () => {
    writeStudioNodeHandoff({
      originNodeId: 'node-1',
      prompt: '',
      referenceUrls: [],
    })
    clearStudioNodeHandoff()
    expect(readStudioNodeHandoff()).toBeNull()
  })
})

describe('studio node result (return)', () => {
  it('round-trips a result', () => {
    writeStudioNodeResult({
      originNodeId: 'node-1',
      url: 'https://cdn.test/out.png',
      generationId: 'gen-1',
      label: 'Aria',
    })

    expect(readStudioNodeResult()).toEqual({
      originNodeId: 'node-1',
      url: 'https://cdn.test/out.png',
      generationId: 'gen-1',
      label: 'Aria',
    })
  })

  it('rejects a result missing the image url', () => {
    store.set(
      STUDIO_NODE_RESULT_STORAGE_KEY,
      JSON.stringify({ originNodeId: 'node-1' }),
    )
    expect(readStudioNodeResult()).toBeNull()
  })

  it('clears the result', () => {
    writeStudioNodeResult({
      originNodeId: 'node-1',
      url: 'https://cdn.test/out.png',
    })
    clearStudioNodeResult()
    expect(readStudioNodeResult()).toBeNull()
  })
})
