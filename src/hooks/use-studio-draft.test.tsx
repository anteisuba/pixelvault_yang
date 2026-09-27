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

  it('restores aspect ratio and resolution with the prompt (owner 2026-09-24)', () => {
    const withSpecs: StudioDraft = {
      ...saved,
      aspectRatio: '16:9',
      resolution: '2K',
    }
    const first = renderHook(() => useHarness())
    act(() => first.result.current.setDraft(withSpecs))
    first.unmount()
    const second = renderHook(() => useHarness())
    expect(second.result.current.draft).toMatchObject({
      aspectRatio: '16:9',
      resolution: '2K',
    })
  })

  it('drops a stored aspect ratio or resolution that is not a real option', () => {
    sessionStorage.setItem(
      'pv:studio-image-draft:user-a',
      JSON.stringify({ ...saved, aspectRatio: '7:3', resolution: '9K' }),
    )
    const view = renderHook(() => useHarness())
    expect(view.result.current.draft.aspectRatio).toBeUndefined()
    expect(view.result.current.draft.resolution).toBeUndefined()
    expect(view.result.current.draft.prompt).toBe(saved.prompt)
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

// 画风串 2026-09-27 取消：旧草稿里开着的那几块并进正向标签，关着的丢掉。
it('folds enabled legacy style blocks into the prompt and drops disabled ones', () => {
  const draft = {
    ...saved,
    prompt: '1girl, solo',
    promptBlocks: [
      { id: 'a', name: 'Ink', text: 'ink wash', enabled: true },
      { id: 'b', name: 'Off', text: 'watercolor', enabled: false },
    ],
  }
  sessionStorage.setItem('pv:studio-image-draft:user-a', JSON.stringify(draft))
  const view = renderHook(() => useHarness())
  expect(view.result.current.draft.prompt).toBe('1girl, solo, ink wash')
  expect(view.result.current.draft).not.toHaveProperty('promptBlocks')
})

it('keeps incomplete characters in the draft without making them valid generation input', () => {
  const draft = {
    ...saved,
    novelAiLayout: {
      positioning: 'auto' as const,
      characters: [
        {
          prompt: '',
          negativePrompt: 'blur',
          enabled: false,
          position: { x: 0.5, y: 0.5 },
        },
      ],
    },
  }
  sessionStorage.setItem('pv:studio-image-draft:user-a', JSON.stringify(draft))
  const view = renderHook(() => useHarness())
  expect(view.result.current.draft.novelAiLayout).toEqual(draft.novelAiLayout)
})
