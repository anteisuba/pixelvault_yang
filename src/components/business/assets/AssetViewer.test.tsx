import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AssetViewer } from '@/components/business/assets/AssetViewer'
import { FAKE_GENERATION } from '@/test/api-helpers'
import type { GenerationRecord } from '@/types'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}:${key}`,
  useFormatter: () => ({ dateTime: () => 'Sep 29, 02:10' }),
  useLocale: () => 'zh',
}))

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}))

vi.mock('@/lib/api-client/projects', () => ({
  getFolderMembershipsAPI: vi.fn(async () => ({ success: true, data: {} })),
}))

vi.mock('@/components/business/assets/AssetAddToFolderPanel', () => ({
  AssetAddToFolderPanel: ({ trigger }: { trigger: React.ReactNode }) => trigger,
}))

vi.mock('@/components/business/vision/VideoAnalysisPanel', () => ({
  VideoAnalysisPanel: () => <div data-testid="video-analysis" />,
}))

vi.mock('@/components/business/ModelViewer', () => ({
  ModelViewer: () => <div data-testid="model-viewer" />,
}))

function image(id: string, overrides: Partial<GenerationRecord> = {}) {
  return {
    ...FAKE_GENERATION,
    id,
    outputType: 'IMAGE',
    prompt: `prompt of ${id}`,
    negativePrompt: null,
    model: 'anima-dit-runner',
    width: 960,
    height: 1280,
    seed: '130554060',
    snapshot: null,
    ...overrides,
  } as GenerationRecord
}

const images = [image('a'), image('b'), image('c')]

function renderViewer(
  generation: GenerationRecord,
  onNavigate = vi.fn(),
  list: readonly GenerationRecord[] = images,
) {
  render(
    <AssetViewer
      generation={generation}
      images={list}
      onNavigate={onNavigate}
      onClose={vi.fn()}
      folders={[]}
      onCreateFolder={vi.fn(async () => null)}
      onFoldersChanged={vi.fn()}
      onFoldersUndone={vi.fn()}
      onDeleted={vi.fn()}
      onRestored={vi.fn()}
      onUpdated={vi.fn()}
    />,
  )
  return { onNavigate }
}

describe('AssetViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // jsdom 没有这个 API：缩略轨把当前那一张滚到中间用的。
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('pages through the loaded images and stops at the ends', () => {
    const { onNavigate } = renderViewer(images[0])

    expect(
      screen.getByRole('button', { name: 'AssetsPage:detailPreviousImage' }),
    ).toBeDisabled()
    fireEvent.click(
      screen.getByRole('button', { name: 'AssetsPage:detailNextImage' }),
    )
    expect(onNavigate).toHaveBeenCalledWith(images[1])
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
  })

  it('turns pages with the arrow keys, never past the last one', () => {
    const { onNavigate } = renderViewer(images[2])

    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(onNavigate).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(onNavigate).toHaveBeenCalledWith(images[1])
  })

  it('shows the recipe: prompt, model, size with seed', () => {
    renderViewer(images[1])

    expect(screen.getByText('prompt of b')).toBeInTheDocument()
    expect(screen.getByText('anima-dit-runner')).toBeInTheDocument()
    expect(
      screen.getByText('960×1280 · AssetsPage:viewer.seed'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /AssetsPage:detailRemix/ }),
    ).toBeInTheDocument()
  })

  it('copies the recipe and says so on the key itself', async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    renderViewer(images[0])

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /AssetsPage:viewer\.copyRecipe/ }),
      )
    })

    expect(writeText).toHaveBeenCalledWith(
      'prompt of a\nSeed: 130554060, Size: 960x1280, Model: anima-dit-runner',
    )
    expect(
      screen.getByRole('button', { name: /AssetsPage:viewer\.copied/ }),
    ).toBeInTheDocument()
  })

  it('先搜再画出的图：「发布」置灰，原因写在下面一行', () => {
    renderViewer(image('g', { searchGrounded: true, isPublic: false }))

    const publish = screen.getByRole('button', {
      name: 'AssetsPage:viewer.publish',
    })
    expect(publish).toBeDisabled()
    expect(publish).toHaveAttribute(
      'aria-describedby',
      'asset-viewer-publish-note',
    )
    expect(screen.getByRole('note')).toHaveTextContent(
      'SearchGrounding:publishWhy',
    )
  })

  it('普通出图照常能发布，原因行收起', () => {
    renderViewer(image('p', { isPublic: false }))

    expect(
      screen.getByRole('button', { name: 'AssetsPage:viewer.publish' }),
    ).toBeEnabled()
    expect(
      document
        .getElementById('asset-viewer-publish-note')
        ?.closest('[data-open]'),
    ).toHaveAttribute('data-open', 'false')
  })

  it('has no rail or arrows for a video, and brings its analysis panel', () => {
    renderViewer(
      image('v', {
        outputType: 'VIDEO',
        url: 'https://cdn.test.com/clip.mp4',
        mimeType: 'video/mp4',
      }),
    )

    expect(
      screen.queryByRole('button', { name: 'AssetsPage:detailNextImage' }),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('video-analysis')).toBeInTheDocument()
  })
})
