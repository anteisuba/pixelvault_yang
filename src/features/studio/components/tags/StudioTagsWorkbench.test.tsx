import { act, fireEvent, screen } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { API_ENDPOINTS } from '@/constants/config'
import { DURATION_MS } from '@/constants/motion'
import { STUDIO_GUIDE_SEEN_STORAGE_KEY } from '@/constants/studio'
import { renderWithApp } from '@/test/app-harness'
import { stubBrowserLayout } from '@/test/browser-stubs'
import { text } from '@/test/i18n-text'
import { fakeStudioServer, StudioProviders } from '@/test/studio-harness'
import { DESKTOP_WIDTH, MOBILE_WIDTH, setViewportWidth } from '@/test/viewport'

import {
  StudioTagsStage,
  StudioTagsWorkbench,
  type TagWorkbenchPanel,
} from './StudioTagsWorkbench'

/**
 * 标签台舞台换场，全程真的：真结果区（`StudioCanvas`）、真查资料面板、真标签输入框、
 * 真工作台；只假网络（Danbooru 目录 / 收藏回空）、屏宽、时钟，以及 jsdom 没有的
 * `scrollIntoView`（浏览器 API）。
 */

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-tags-wb' }),
}))
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/studio/image/tags',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image/tags',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

const ok = (data: unknown) => Response.json({ success: true, data })
const LOOKUP_TITLE = text('StudioTags.lookup.title')
const COMPOSITION = text('StudioTags.workbench.composition')

const scrollIntoView = vi.fn()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  stubBrowserLayout()
  setViewportWidth(DESKTOP_WIDTH)
  scrollIntoView.mockClear()
  // 首次进工作台会自动弹操作教程（模态，盖住整页）；这里当作看过了。
  localStorage.setItem(STUDIO_GUIDE_SEEN_STORAGE_KEY, '1')
  Element.prototype.scrollIntoView = scrollIntoView
  fakeStudioServer()
    .on('GET', API_ENDPOINTS.DANBOORU_CATALOG, () =>
      ok({ candidates: [], crossHint: null, nextPage: null, detail: null }),
    )
    .on('GET', API_ENDPOINTS.DANBOORU_FAVORITES, () => ok([]))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** 跑完挂载请求、换场定时器。 */
const tick = (ms = 0) => act(() => vi.advanceTimersByTimeAsync(ms))

function renderStage(panel: TagWorkbenchPanel | null) {
  const view = renderWithApp(
    <StudioTagsStage panel={panel} onClose={vi.fn()} />,
    { inner: StudioProviders },
  )
  return (next: TagWorkbenchPanel | null) =>
    view.rerender(<StudioTagsStage panel={next} onClose={vi.fn()} />)
}

describe('标签台舞台面板', () => {
  /**
   * 换场是「结果先淡出一拍，面板再上来」：标题要在**挂上时**落焦点，⛔ 在
   * `panel` 一变就去找（那一拍它还没挂上，焦点就留在触发键上了）。
   */
  it('面板晚一拍挂上，标题照样拿到焦点；面板之间直接切，新标题接过焦点', async () => {
    const show = renderStage(null)
    await tick()
    show('catalog')
    expect(screen.queryByRole('heading', { name: LOOKUP_TITLE })).toBeNull()
    await tick(DURATION_MS.fast)
    expect(screen.getByRole('heading', { name: LOOKUP_TITLE })).toHaveFocus()

    show('composition')
    expect(screen.getByRole('heading', { name: COMPOSITION })).toHaveFocus()
  })

  /**
   * 手机上整页在滚：面板要整块顶到顶栏下（它的高度正好卡在顶栏与底部生成栏之间），
   * ⛔ 只把标题滚进来 —— 那样钉在面板底部的「加到哪 + 加入」会压在生成栏底下。
   */
  it('手机：打开查资料把整块面板滚到顶', async () => {
    setViewportWidth(MOBILE_WIDTH)
    const show = renderStage(null)
    await tick()
    show('catalog')
    await tick(DURATION_MS.fast)

    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'start' })
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(
      screen.getByRole('heading', { name: LOOKUP_TITLE }).closest('section'),
    )
  })

  it('桌面：标题只在看不见时才滚进来（nearest）', async () => {
    const show = renderStage(null)
    await tick()
    show('catalog')
    await tick(DURATION_MS.fast)

    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest' })
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(
      screen.getByRole('heading', { name: LOOKUP_TITLE }),
    )
  })
})

describe('标签台（手机）', () => {
  function Workbench() {
    const [panel, setPanel] = useState<TagWorkbenchPanel | null>(null)
    return (
      <StudioTagsWorkbench
        panel={panel}
        onPanelChange={setPanel}
        templates={null}
      >
        {({ stage, composer }: { stage: ReactNode; composer: ReactNode }) => (
          <div className="studio-layout-v2">
            <div data-testid="stage-slot">{stage}</div>
            <div data-testid="composer-slot">{composer}</div>
          </div>
        )}
      </StudioTagsWorkbench>
    )
  }

  it('资料入口在底部编辑框；返回结果把焦点交回上方舞台', async () => {
    setViewportWidth(MOBILE_WIDTH)
    renderWithApp(<Workbench />, { inner: StudioProviders })
    await tick()
    const stage = screen.getByTestId('stage-slot').firstElementChild

    // 手机：查资料住在底部编辑框的「＋」里。
    const add = screen.getByRole('button', { name: text('StudioMobile.add') })
    expect(screen.getByTestId('composer-slot')).toContainElement(add)
    fireEvent.click(add)
    fireEvent.click(
      screen.getByRole('button', {
        name: text('StudioTags.workbench.lookup'),
      }),
    )
    // 打开时先把舞台顶上来。
    expect(scrollIntoView.mock.contexts).toContain(stage)
    await tick(DURATION_MS.fast)
    expect(screen.getByRole('heading', { name: LOOKUP_TITLE })).toBeVisible()

    fireEvent.click(
      screen.getByRole('button', {
        name: text('StudioTags.lookup.backToResults'),
      }),
    )
    await tick(DURATION_MS.base)
    expect(screen.queryByRole('heading', { name: LOOKUP_TITLE })).toBeNull()
    expect(screen.getByTestId('stage-slot').firstElementChild).toBe(stage)
    expect(stage).toHaveFocus()
  })
})
