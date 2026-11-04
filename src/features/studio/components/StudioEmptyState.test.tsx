import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { API_ENDPOINTS } from '@/constants/config'
import {
  STUDIO_GUIDE_SEEN_STORAGE_KEY,
  STUDIO_PROMPT_TEXTAREA_ID,
} from '@/constants/studio'
import type { GenerationRecord } from '@/types'
import { text } from '@/test/i18n-text'
import {
  fakeStudioServer,
  renderWithStudio,
  type StudioHandle,
} from '@/test/studio-harness'

import { StudioEmptyState } from './StudioEmptyState'

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-a' }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image',
  useRouter: () => ({ push: vi.fn() }),
}))

const T = (key: string) => text(`StudioEmptyState.${key}`)
const ok = (data: unknown) => Response.json({ success: true, data })

let history: GenerationRecord[] = []

/**
 * 真工作台里挂起手屏，旁边放一块真的提示词框（`focusStudioPrompt` 找它）。
 * 最近作品走真 `useProjects` 拉回来的未归档历史。
 */
function renderEmpty(
  props: React.ComponentProps<typeof StudioEmptyState>,
  { tags = false } = {},
) {
  const view = renderWithStudio(
    <>
      {tags ? (
        <textarea aria-label="positive" data-tag-polarity="positive" />
      ) : (
        <textarea aria-label="prompt" id={STUDIO_PROMPT_TEXTAREA_ID} />
      )}
      <StudioEmptyState {...props} />
    </>,
  )
  return view
}

function useTagStudio(studio: { current: StudioHandle }) {
  studio.current.dispatch({ type: 'SET_PROMPT_DIALECT', payload: 'tags' })
}

const recentTiles = () =>
  screen.findAllByRole('button', { name: new RegExp(T('recentRemixHint')) })

function makeGeneration(
  overrides: Partial<GenerationRecord> = {},
): GenerationRecord {
  return {
    id: 'gen-1',
    outputType: 'IMAGE',
    url: 'https://cdn.example.com/gen-1.webp',
    prompt: 'a prompt',
    ...overrides,
  } as GenerationRecord
}

beforeEach(() => {
  history = []
  localStorage.clear()
  fakeStudioServer().on('GET', `${API_ENDPOINTS.PROJECTS}/:id/history`, () =>
    ok({ generations: history, total: history.length, hasMore: false }),
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('StudioEmptyState', () => {
  it('renders the hint and fills prompt + focuses on example chip click', () => {
    localStorage.setItem(STUDIO_GUIDE_SEEN_STORAGE_KEY, '1')
    const { studio } = renderEmpty({ mode: 'image' })

    expect(screen.getByText(T('hint.image'))).toBeInTheDocument()
    // 台名不再写在起手屏上（用户 10-25：留位置给左上角的头像）。
    expect(screen.queryByText(T('modeLabel.image'))).toBeNull()

    fireEvent.click(
      screen.getByRole('button', { name: T('examples.image.e1.label') }),
    )
    expect(studio.current.state.prompt).toBe(T('examples.image.e1.prompt'))
    expect(document.activeElement).toBe(screen.getByLabelText('prompt'))
  })

  // 标签台起手是几组标签：点一组 = 正向栏换成这一组（⛔ 不走 SET_PROMPT 的整句）。
  it('starts the tag studio from a tag set', () => {
    localStorage.setItem(STUDIO_GUIDE_SEEN_STORAGE_KEY, '1')
    const { studio } = renderEmpty({ mode: 'image' }, { tags: true })
    act(() => useTagStudio(studio))

    expect(screen.getByText(T('hint.image_tags'))).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: T('examples.image_tags.e1.label') }),
    )
    // 正向栏换成这一组：一个标签一格，权重 1。
    expect(studio.current.state.tagChips).toEqual(
      T('examples.image_tags.e1.prompt')
        .split(',')
        .map((tag) => ({ text: tag.trim(), weight: 1 })),
    )
    expect(document.activeElement).toBe(screen.getByLabelText('positive'))
  })

  it('shows recent tiles filtered by mode, capped at 6, remixing on click', async () => {
    localStorage.setItem(STUDIO_GUIDE_SEEN_STORAGE_KEY, '1')
    const onRemix = vi.fn()
    history = [
      makeGeneration({ id: 'img-1' }),
      makeGeneration({ id: 'vid-1', outputType: 'VIDEO' }),
      ...Array.from({ length: 7 }, (_, i) =>
        makeGeneration({ id: `img-${i + 2}` }),
      ),
    ]
    renderEmpty({ mode: 'image', onRemix })

    const tiles = await recentTiles()
    expect(tiles).toHaveLength(6)

    fireEvent.click(tiles[0])
    expect(onRemix).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'img-1' }),
    )
  })

  it('点缩略图时图片模态还会把图挂进输入框，视频模态不会', async () => {
    localStorage.setItem(STUDIO_GUIDE_SEEN_STORAGE_KEY, '1')
    history = [
      makeGeneration({ id: 'img-1', url: 'https://cdn/img-1.png' }),
      makeGeneration({
        id: 'vid-1',
        outputType: 'VIDEO',
        url: 'https://cdn/vid-1.mp4',
      }),
    ]

    const image = renderEmpty({ mode: 'image' })
    fireEvent.click((await recentTiles())[0]!)
    await waitFor(() =>
      expect(
        image.studio.current.imageUpload.referenceEntries.map((e) => e.url),
      ).toEqual(['https://cdn/img-1.png']),
    )
    image.unmount()

    // 视频产物挂成图片参考没有意义 —— 那两个模态维持原来的 remix 行为。
    const video = renderEmpty({ mode: 'video' })
    fireEvent.click((await recentTiles())[0]!)
    await act(async () => {})
    expect(video.studio.current.imageUpload.referenceEntries).toEqual([])
  })

  it('hides the recent row when no history matches the mode', async () => {
    localStorage.setItem(STUDIO_GUIDE_SEEN_STORAGE_KEY, '1')
    history = [makeGeneration({ id: 'vid-1', outputType: 'VIDEO' })]
    const { studio } = renderEmpty({ mode: 'image' })
    await waitFor(() => expect(studio.current.projects.history).toHaveLength(1))

    expect(screen.queryByText(T('recentLabel'))).not.toBeInTheDocument()
  })

  it('auto-opens the guide on first visit; closing records the seen flag', async () => {
    renderEmpty({ mode: 'image' })

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeInTheDocument()
    // 标记在用户关闭教程时才写，避免"弹过但没看"的用户永远错过。
    expect(localStorage.getItem(STUDIO_GUIDE_SEEN_STORAGE_KEY)).toBeNull()

    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() =>
      expect(localStorage.getItem(STUDIO_GUIDE_SEEN_STORAGE_KEY)).toBe('1'),
    )
  })

  it('does not auto-open once seen; the manual entry still opens it', async () => {
    localStorage.setItem(STUDIO_GUIDE_SEEN_STORAGE_KEY, '1')
    renderEmpty({ mode: 'image' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(T('guideButton')) }),
    )
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
})
