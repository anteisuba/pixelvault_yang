import { fireEvent, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { API_ENDPOINTS } from '@/constants/config'
import { stubBrowserLayout } from '@/test/browser-stubs'
import { generationFixture } from '@/test/generation-fixture'
import { text } from '@/test/i18n-text'
import { renderWithApp } from '@/test/app-harness'
import {
  fakeStudioServer,
  renderWithStudio,
  settle,
  StudioProviders,
} from '@/test/studio-harness'
import { DESKTOP_WIDTH, MOBILE_WIDTH, setViewportWidth } from '@/test/viewport'

import { StudioImageEditWorkspace } from './StudioImageEditWorkspace'

/**
 * 编辑台外壳，全程真的：真源图选择（真 `useImageUpload`、真素材库弹窗 + 真 `useGallery`）、
 * 真编辑舞台 / 躯干；只假网络（画廊、素材分区计数）与屏宽。
 */

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: 'user-ws' }),
}))
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/studio/image',
  useRouter: () => ({ push: vi.fn() }),
}))

const T = (key: string, values?: Record<string, string | number>) =>
  text(`StudioImageEdit.${key}`, values)
const ok = (data: unknown) => Response.json({ success: true, data })

const SAVED = generationFixture({
  id: 'asset-1',
  url: 'https://cdn.example.com/selected.png',
  prompt: 'saved sunset',
})

beforeEach(() => {
  stubBrowserLayout()
  setViewportWidth(DESKTOP_WIDTH)
  fakeStudioServer()
    .on('GET', API_ENDPOINTS.IMAGES, () =>
      ok({
        generations: [SAVED],
        page: 1,
        limit: 30,
        total: 1,
        hasMore: false,
        nextCursor: null,
      }),
    )
    .on('GET', API_ENDPOINTS.ASSET_SECTION_COUNTS, () =>
      ok({ all: 1, liked: 0, unassigned: 1, uploads: 0, projects: {} }),
    )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function renderSlots({
  stage,
  params,
  composer,
}: {
  stage: ReactNode
  params: ReactNode
  composer: ReactNode
}) {
  return (
    <div className="studio-layout-v2" data-testid="shared-workspace">
      <div data-testid="shared-header">Workbench</div>
      {stage}
      <div data-testid="params">{params}</div>
      {composer}
    </div>
  )
}

function renderPicker() {
  const onSelect = vi.fn()
  renderWithStudio(
    <StudioImageEditWorkspace
      active
      target={null}
      sessionId={0}
      onSelect={onSelect}
      onTargetChange={vi.fn()}
      onBack={vi.fn()}
      onChangeSource={vi.fn()}
      onRunStateChange={vi.fn()}
      references={[
        { url: 'https://cdn.example.com/a.png' },
        { url: 'https://cdn.example.com/b.png' },
      ]}
    >
      {renderSlots}
    </StudioImageEditWorkspace>,
  )
  return onSelect
}

describe('StudioImageEditWorkspace 源图选择', () => {
  it('素材库只按图片查，点一张就把它（连 generation）当源图', async () => {
    const onSelect = renderPicker()
    fireEvent.click(screen.getByRole('button', { name: T('chooseSource') }))

    fireEvent.click(await screen.findByRole('button', { name: 'saved sunset' }))
    expect(onSelect).toHaveBeenCalledWith({
      url: 'https://cdn.example.com/selected.png',
      generationId: 'asset-1',
    })
    const galleryUrl = vi
      .mocked(fetch)
      .mock.calls.map(([input]) => String(input))
      .find((url) => url.startsWith(API_ENDPOINTS.IMAGES))
    expect(new URL(galleryUrl!, 'http://x').searchParams.get('type')).toBe(
      'image',
    )
  })

  it('点哪一张参考图就编哪一张，⛔ 默认拿第一张', () => {
    const onSelect = renderPicker()
    fireEvent.click(
      screen.getByRole('button', {
        name: T('stageEditingReference', { index: 2, total: 2 }),
      }),
    )
    expect(onSelect).toHaveBeenCalledWith({
      url: 'https://cdn.example.com/b.png',
      referenceIndex: 1,
      referenceTotal: 2,
    })
  })
})

describe('StudioImageEditWorkspace 槽位', () => {
  const session = {
    target: { url: 'https://cdn.example.com/source.png' },
    sessionId: 1,
    onSelect: vi.fn(),
    onTargetChange: vi.fn(),
    onBack: vi.fn(),
    onChangeSource: vi.fn(),
    onRunStateChange: vi.fn(),
    references: [],
    children: renderSlots,
  }
  const draft = () =>
    screen.queryByRole('textbox', { name: T('editPromptLabel') })

  it('切走再切回：编辑会话与共用表头不重挂，写了一半的修改还在；换会话才清空', async () => {
    // 要 rerender 同一棵树：直接包真 Provider（`renderWithStudio` 外面多一层捕获节点）。
    const view = renderWithApp(
      <StudioImageEditWorkspace {...session} active />,
      { inner: StudioProviders },
    )
    await settle()
    const header = screen.getByTestId('shared-header')
    const stage = screen.getByRole('img', { name: T('sourceAlt') })
    fireEvent.change(draft()!, { target: { value: 'Keep this edit' } })

    view.rerender(<StudioImageEditWorkspace {...session} active={false} />)
    expect(screen.getByTestId('shared-header')).toBe(header)
    // 切走：舞台还挂着（藏起来），输入框收起。
    const hidden = stage.closest('[aria-hidden="true"]')
    expect(hidden).toHaveClass('hidden')
    expect(draft()).toBeNull()

    view.rerender(<StudioImageEditWorkspace {...session} active />)
    expect(screen.getByTestId('shared-header')).toBe(header)
    expect(screen.getByRole('img', { name: T('sourceAlt') })).toBe(stage)
    await waitFor(() => expect(draft()).toHaveValue('Keep this edit'))
    // 桌面：输入框落在参数栏那一格里。
    expect(screen.getByTestId('params')).toContainElement(draft())

    view.rerender(
      <StudioImageEditWorkspace {...session} active sessionId={2} />,
    )
    await waitFor(() => expect(draft()).toHaveValue(''))
    expect(screen.getByTestId('shared-header')).toBe(header)
  })

  it('还没开始编辑时不挂源图选择、不挂舞台', () => {
    renderWithStudio(
      <StudioImageEditWorkspace {...session} active={false} target={null} />,
    )
    expect(screen.getByTestId('shared-header')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: T('chooseSource') })).toBeNull()
    expect(draft()).toBeNull()
    expect(screen.getByTestId('params')).toBeEmptyDOMElement()
  })

  it('手机：只留一条底部输入条，只在编辑台开着时量高度', async () => {
    setViewportWidth(MOBILE_WIDTH)
    const observe = vi.fn()
    const disconnect = vi.fn()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = observe
        unobserve() {}
        disconnect = disconnect
      },
    )
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 390, 128),
    )

    // 要 rerender 同一棵树：直接包真 Provider（`renderWithStudio` 外面多一层捕获节点）。
    const view = renderWithApp(
      <StudioImageEditWorkspace {...session} active />,
      { inner: StudioProviders },
    )
    await settle()
    const workspace = screen.getByTestId('shared-workspace')
    const composer = workspace.querySelector('.studio-mobile-composer')
    expect(workspace.querySelectorAll('.studio-mobile-composer')).toHaveLength(
      1,
    )
    expect(composer).toContainElement(draft())
    expect(screen.getByTestId('params')).toBeEmptyDOMElement()
    expect(
      workspace.style.getPropertyValue('--studio-mobile-composer-height'),
    ).toBe('128px')
    expect(observe).toHaveBeenCalledWith(composer)

    view.rerender(<StudioImageEditWorkspace {...session} active={false} />)
    expect(workspace.querySelector('.studio-mobile-composer')).toBe(composer)
    expect(composer).toHaveClass('hidden')
    expect(
      workspace.style.getPropertyValue('--studio-mobile-composer-height'),
    ).toBe('')

    view.rerender(<StudioImageEditWorkspace {...session} active />)
    expect(workspace.querySelector('.studio-mobile-composer')).toBe(composer)
    expect(composer).not.toHaveClass('hidden')
    expect(
      workspace.style.getPropertyValue('--studio-mobile-composer-height'),
    ).toBe('128px')
  })
})
