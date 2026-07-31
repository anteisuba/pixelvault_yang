import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCreateNodeScriptDocAPI = vi.fn()
vi.mock('@/lib/api-client/node-script-doc', () => ({
  createNodeScriptDocAPI: (...args: unknown[]) =>
    mockCreateNodeScriptDocAPI(...args),
}))

// `getApiErrorMessage` needs `t.has` to decide whether an i18nKey resolves;
// a bare key-echo translator would silently fall through to the raw message.
const KNOWN_ERROR_KEYS = new Set([
  'common.unexpected',
  'scriptDoc.promptTooLong',
])
vi.mock('next-intl', () => {
  const t = (key: string) => `t:${key}`
  t.has = (key: string) => KNOWN_ERROR_KEYS.has(key)

  return { useTranslations: () => t }
})

import { useNodeScriptDoc } from '@/hooks/use-node-script-doc'
import type {
  NodeScriptDocRequest,
  NodeScriptDocResponseData,
  ScriptDoc,
} from '@/types/script-doc'

const REQUEST: NodeScriptDocRequest = {
  messages: [{ role: 'user', content: 'a botanist finds a signal' }],
  locale: 'en',
}

const DOC: ScriptDoc = {
  title: 'X',
  logline: '',
  roles: [],
  shots: [],
}

describe('useNodeScriptDoc', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the draft result and clears error on success', async () => {
    mockCreateNodeScriptDocAPI.mockResolvedValue({
      success: true,
      data: { kind: 'scriptDoc', scriptDoc: DOC },
    })

    const { result } = renderHook(() => useNodeScriptDoc())

    let returned: NodeScriptDocResponseData | null = null
    await act(async () => {
      returned = await result.current.draft(REQUEST)
    })

    expect(returned).toEqual({ kind: 'scriptDoc', scriptDoc: DOC })
    expect(result.current.error).toBeNull()
    expect(result.current.trim).toBeNull()
    expect(result.current.isDrafting).toBe(false)
  })

  it('sets the error and returns null on failure', async () => {
    mockCreateNodeScriptDocAPI.mockResolvedValue({
      success: false,
      error: 'route unavailable',
    })

    const { result } = renderHook(() => useNodeScriptDoc())

    let returned: NodeScriptDocResponseData | null = {
      kind: 'scriptDoc',
      scriptDoc: DOC,
    }
    await act(async () => {
      returned = await result.current.draft(REQUEST)
    })

    expect(returned).toBeNull()
    expect(result.current.error).toBe('route unavailable')
    expect(result.current.isDrafting).toBe(false)
  })

  // The whole point of the typed too-long error is that the user reads a
  // reason. Before this, the hook took `response.error` verbatim, so a
  // localized server key still surfaced as raw English.
  it('prefers the server i18nKey over the raw error message', async () => {
    mockCreateNodeScriptDocAPI.mockResolvedValue({
      success: false,
      error: 'The script is too long to revise in one request.',
      errorCode: 'SCRIPT_DOC_PROMPT_TOO_LONG',
      i18nKey: 'errors.scriptDoc.promptTooLong',
    })

    const { result } = renderHook(() => useNodeScriptDoc())
    await act(async () => {
      await result.current.draft(REQUEST)
    })

    expect(result.current.error).toBe('t:scriptDoc.promptTooLong')
  })

  it('exposes the trim notice so a silently shortened request is visible', async () => {
    const trim = { keptMessages: 3, droppedMessages: 5, heldBackFields: 2 }
    mockCreateNodeScriptDocAPI.mockResolvedValue({
      success: true,
      data: { kind: 'scriptDoc', scriptDoc: DOC, trim },
    })

    const { result } = renderHook(() => useNodeScriptDoc())
    await act(async () => {
      await result.current.draft(REQUEST)
    })

    expect(result.current.trim).toEqual(trim)
  })

  it('clears a stale trim notice when the next draft needs no trimming', async () => {
    mockCreateNodeScriptDocAPI.mockResolvedValue({
      success: true,
      data: {
        kind: 'scriptDoc',
        scriptDoc: DOC,
        trim: { keptMessages: 2, droppedMessages: 4, heldBackFields: 0 },
      },
    })

    const { result } = renderHook(() => useNodeScriptDoc())
    await act(async () => {
      await result.current.draft(REQUEST)
    })
    expect(result.current.trim).not.toBeNull()

    mockCreateNodeScriptDocAPI.mockResolvedValue({
      success: true,
      data: { kind: 'scriptDoc', scriptDoc: DOC },
    })
    await act(async () => {
      await result.current.draft(REQUEST)
    })

    expect(result.current.trim).toBeNull()
  })
})
