import { StrictMode, useState, type ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useStudioDraft, type StudioDraft } from './use-studio-draft'

const empty = (): StudioDraft => ({
  prompt: '',
  negativePrompt: '',
  referenceImages: [],
})
const saved: StudioDraft = {
  prompt: 'Use @Image1 with @Image2',
  negativePrompt: 'blur',
  referenceImages: ['https://example.com/a.png', 'https://example.com/b.png'],
}
function useHarness(userId: string | null = 'user-a', enabled = true) {
  const [draft, setDraft] = useState(empty)
  useStudioDraft({ userId, enabled, draft, onRestore: setDraft })
  return { draft, setDraft }
}
beforeEach(() => sessionStorage.clear())

describe('Studio image draft', () => {
  it('restores prompt and ordered references after a full remount', () => {
    const first = renderHook(() => useHarness())
    act(() => first.result.current.setDraft(saved))
    first.unmount()
    const second = renderHook(() => useHarness())
    expect(second.result.current.draft).toEqual(saved)
  })

  it('does not overwrite a saved draft with empty hydration state in Strict Mode', () => {
    sessionStorage.setItem(
      'pv:studio-image-draft:user-a',
      JSON.stringify(saved),
    )
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    const view = renderHook(() => useHarness(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <StrictMode>{children}</StrictMode>
      ),
    })
    expect(view.result.current.draft).toEqual(saved)
    expect(
      writes.mock.calls.every(
        ([, value]) => JSON.parse(value).prompt === saved.prompt,
      ),
    ).toBe(true)
    writes.mockRestore()
  })

  it('waits for account hydration and isolates account changes', () => {
    sessionStorage.setItem(
      'pv:studio-image-draft:user-a',
      JSON.stringify(saved),
    )
    const view = renderHook(({ user }) => useHarness(user), {
      initialProps: { user: null as string | null },
    })
    expect(view.result.current.draft).toEqual(empty())
    view.rerender({ user: 'user-a' })
    expect(view.result.current.draft).toEqual(saved)
    view.rerender({ user: 'user-b' })
    expect(view.result.current.draft).toEqual(empty())
    expect(
      JSON.parse(sessionStorage.getItem('pv:studio-image-draft:user-a')!),
    ).toEqual(saved)
  })

  it('persists intentional clearing instead of resurrecting older content', () => {
    const view = renderHook(() => useHarness())
    act(() => view.result.current.setDraft(saved))
    act(() => view.result.current.setDraft(empty()))
    view.unmount()
    const reopened = renderHook(() => useHarness())
    expect(reopened.result.current.draft).toEqual(empty())
  })

  it('does not replace image drafts while another workspace is active', () => {
    sessionStorage.setItem(
      'pv:studio-image-draft:user-a',
      JSON.stringify(saved),
    )
    const view = renderHook(() => useHarness('user-a', false))
    act(() =>
      view.result.current.setDraft({ ...empty(), prompt: 'video prompt' }),
    )
    expect(
      JSON.parse(sessionStorage.getItem('pv:studio-image-draft:user-a')!),
    ).toEqual(saved)
  })
})
