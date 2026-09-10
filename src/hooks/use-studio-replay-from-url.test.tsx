import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  clear: vi.fn(),
  add: vi.fn(),
  query: '',
}))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mocks.query),
}))
vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({
    state: { advancedParams: {} },
    dispatch: mocks.dispatch,
  }),
  useStudioData: () => ({
    imageUpload: { clearAllImages: mocks.clear, addReferenceImage: mocks.add },
  }),
}))
import { useStudioReplayFromUrl } from './use-studio-replay-from-url'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.query = ''
  window.history.replaceState({}, '', '/')
})

describe('Studio recovery link', () => {
  it('restores ordered references before the prompt and consumes replay parameters', () => {
    const params = new URLSearchParams({
      prompt: 'Use @Image1 then @Image2',
      style: 'keep-this',
    })
    params.append('referenceImage', 'https://example.com/one.png')
    params.append('referenceImage', 'https://example.com/two.png')
    mocks.query = params.toString()
    window.history.replaceState({}, '', `/?${mocks.query}`)
    const view = renderHook(() => useStudioReplayFromUrl())
    expect(mocks.clear).toHaveBeenCalledTimes(1)
    expect(mocks.add.mock.calls).toEqual([
      ['https://example.com/one.png'],
      ['https://example.com/two.png'],
    ])
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: 'SET_PROMPT',
      payload: 'Use @Image1 then @Image2',
    })
    expect(mocks.clear.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.dispatch.mock.invocationCallOrder[0],
    )
    expect(window.location.search).toBe('?style=keep-this')
    view.rerender()
    expect(mocks.clear).toHaveBeenCalledTimes(1)
  })

  it('ignores nonpersistent or invalid reference URLs', () => {
    mocks.query =
      'referenceImage=javascript%3Aalert(1)&referenceImage=blob%3Atest&referenceImage=not-a-url'
    renderHook(() => useStudioReplayFromUrl())
    expect(mocks.clear).not.toHaveBeenCalled()
    expect(mocks.add).not.toHaveBeenCalled()
  })
})
