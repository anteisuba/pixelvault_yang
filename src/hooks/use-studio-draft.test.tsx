import { StrictMode, useState, type ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  useStudioDraft,
  EMPTY_STUDIO_DRAFT,
  type StudioDraft,
  type StudioDraftWorkspace,
} from './use-studio-draft'

const empty = (): StudioDraft => ({
  ...EMPTY_STUDIO_DRAFT,
  advancedParams: {},
  referenceImages: [],
})
const saved: StudioDraft = {
  ...empty(),
  prompt: 'Use @Image1 with @Image2',
  advancedParams: { negativePrompt: 'blur' },
  referenceImages: ['https://example.com/a.png', 'https://example.com/b.png'],
}
function useHarness(
  userId: string | null = 'user-a',
  enabled = true,
  workspace: StudioDraftWorkspace = 'image-natural',
) {
  const [draft, setDraft] = useState(empty)
  useStudioDraft({ userId, workspace, enabled, draft, onRestore: setDraft })
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
      advancedParams: { ...saved.advancedParams, resolution: '2K' },
    }
    const first = renderHook(() => useHarness())
    act(() => first.result.current.setDraft(withSpecs))
    first.unmount()
    const second = renderHook(() => useHarness())
    expect(second.result.current.draft).toMatchObject({
      aspectRatio: '16:9',
      advancedParams: { ...saved.advancedParams, resolution: '2K' },
    })
  })

  it('drops a stored aspect ratio or resolution that is not a real option', () => {
    sessionStorage.setItem(
      'pv:studio-draft:image-natural:user-a',
      JSON.stringify({
        ...saved,
        aspectRatio: '7:3',
        advancedParams: { ...saved.advancedParams, resolution: '9K' },
      }),
    )
    const view = renderHook(() => useHarness())
    expect(view.result.current.draft.aspectRatio).toBe('1:1')
    expect(view.result.current.draft.advancedParams.resolution).toBeUndefined()
    expect(view.result.current.draft.prompt).toBe(saved.prompt)
  })

  it('does not overwrite a saved draft with empty hydration state in Strict Mode', () => {
    sessionStorage.setItem(
      'pv:studio-draft:image-natural:user-a',
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
      'pv:studio-draft:image-natural:user-a',
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
      JSON.parse(
        sessionStorage.getItem('pv:studio-draft:image-natural:user-a')!,
      ),
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
      'pv:studio-draft:image-natural:user-a',
      JSON.stringify(saved),
    )
    const view = renderHook(() => useHarness('user-a', false))
    act(() =>
      view.result.current.setDraft({ ...empty(), prompt: 'video prompt' }),
    )
    expect(
      JSON.parse(
        sessionStorage.getItem('pv:studio-draft:image-natural:user-a')!,
      ),
    ).toEqual(saved)
  })
})

it('keeps incomplete characters in the draft without making them valid generation input', () => {
  const draft = {
    ...saved,
    advancedParams: {
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
    },
  }
  sessionStorage.setItem(
    'pv:studio-draft:image-natural:user-a',
    JSON.stringify(draft),
  )
  const view = renderHook(() => useHarness())
  expect(view.result.current.draft.advancedParams.novelAiLayout).toEqual(
    draft.advancedParams.novelAiLayout,
  )
})

describe('workspace draft isolation', () => {
  it('restores each workspace prompt, references, model and parameters on a round trip', () => {
    const view = renderHook(
      ({ workspace }) => useHarness('user-a', true, workspace),
      {
        initialProps: { workspace: 'image-natural' as StudioDraftWorkspace },
      },
    )
    const natural: StudioDraft = {
      ...saved,
      selectedOptionId: 'natural-model',
      advancedParams: { negativePrompt: 'blur', seed: 12 },
    }
    const tags: StudioDraft = {
      ...empty(),
      prompt: '1girl, solo',
      selectedOptionId: 'nai-model',
      tagChips: [{ text: '1girl', weight: 1.2 }],
      referenceImages: ['https://example.com/tags.png'],
    }
    act(() => view.result.current.setDraft(natural))
    view.rerender({ workspace: 'image-tags' })
    expect(view.result.current.draft).toEqual(empty())
    act(() => view.result.current.setDraft(tags))
    view.rerender({ workspace: 'video' })
    expect(view.result.current.draft).toEqual(empty())
    act(() =>
      view.result.current.setDraft({ ...empty(), prompt: 'moving shot' }),
    )
    view.rerender({ workspace: 'image-natural' })
    expect(view.result.current.draft).toEqual(natural)
    view.rerender({ workspace: 'image-tags' })
    expect(view.result.current.draft).toEqual(tags)
  })

  it('never saves the outgoing prompt under the destination key during a switch', () => {
    sessionStorage.setItem(
      'pv:studio-draft:image-tags:user-a',
      JSON.stringify({ ...empty(), prompt: 'saved tags' }),
    )
    const view = renderHook(
      ({ workspace }) => useHarness('user-a', true, workspace),
      {
        initialProps: { workspace: 'image-natural' as StudioDraftWorkspace },
      },
    )
    act(() => view.result.current.setDraft(saved))
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    view.rerender({ workspace: 'image-tags' })
    expect(view.result.current.draft.prompt).toBe('saved tags')
    expect(
      writes.mock.calls
        .filter(([key]) => key.includes('image-tags'))
        .every(([, value]) => JSON.parse(value).prompt === 'saved tags'),
    ).toBe(true)
    writes.mockRestore()
  })

  it('does not assign the old unscoped draft to either image workspace', () => {
    sessionStorage.setItem(
      'pv:studio-image-draft:user-a',
      JSON.stringify(saved),
    )
    const view = renderHook(() => useHarness())
    expect(view.result.current.draft).toEqual(empty())
    expect(
      sessionStorage.getItem('pv:studio-image-draft:user-a'),
    ).not.toBeNull()
  })
})
