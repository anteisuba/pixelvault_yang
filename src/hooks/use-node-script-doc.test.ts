import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockCreateNodeScriptDocAPI = vi.fn()
vi.mock('@/lib/api-client/node-script-doc', () => ({
  createNodeScriptDocAPI: (...args: unknown[]) =>
    mockCreateNodeScriptDocAPI(...args),
}))

import { useNodeScriptDoc } from '@/hooks/use-node-script-doc'
import type { NodeScriptDocRequest, ScriptDoc } from '@/types/script-doc'

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

  it('returns the ScriptDoc and clears error on success', async () => {
    mockCreateNodeScriptDocAPI.mockResolvedValue({
      success: true,
      data: { scriptDoc: DOC },
    })

    const { result } = renderHook(() => useNodeScriptDoc())

    let returned: ScriptDoc | null = null
    await act(async () => {
      returned = await result.current.draft(REQUEST)
    })

    expect(returned).toEqual(DOC)
    expect(result.current.error).toBeNull()
    expect(result.current.isDrafting).toBe(false)
  })

  it('sets the error and returns null on failure', async () => {
    mockCreateNodeScriptDocAPI.mockResolvedValue({
      success: false,
      error: 'route unavailable',
    })

    const { result } = renderHook(() => useNodeScriptDoc())

    let returned: ScriptDoc | null = DOC
    await act(async () => {
      returned = await result.current.draft(REQUEST)
    })

    expect(returned).toBeNull()
    expect(result.current.error).toBe('route unavailable')
    expect(result.current.isDrafting).toBe(false)
  })
})
