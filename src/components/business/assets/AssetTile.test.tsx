import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AssetTile } from '@/components/business/assets/AssetTile'
import { FAKE_GENERATION } from '@/test/api-helpers'
import type { GenerationRecord } from '@/types'

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const CDN = 'https://cdn.test.com'

function videoGeneration(
  overrides: Partial<GenerationRecord> = {},
): GenerationRecord {
  return {
    ...FAKE_GENERATION,
    outputType: 'VIDEO',
    url: `${CDN}/generations/video/clip.mp4`,
    storageKey: 'generations/video/clip.mp4',
    mimeType: 'video/mp4',
    thumbnailUrl: null,
    previewUrl: null,
    ...overrides,
  } as GenerationRecord
}

function model3DGeneration(
  overrides: Partial<GenerationRecord> = {},
): GenerationRecord {
  const modelUrl = 'https://cdn.example.com/3d/model.glb'
  return {
    ...FAKE_GENERATION,
    outputType: 'MODEL_3D',
    url: modelUrl,
    storageKey: '3d/model.glb',
    mimeType: 'model/gltf-binary',
    modelUrl,
    modelStorageKey: '3d/model.glb',
    referenceImageUrl: 'https://cdn.example.com/source.png',
    width: 0,
    height: 0,
    ...overrides,
  } as GenerationRecord
}

function renderTile(generation: GenerationRecord) {
  return render(
    <AssetTile
      generation={generation}
      width={180}
      height={180}
      selected={false}
      showSelectionMark={false}
      selectionMode={false}
      draggable={false}
      onAudioCoverError={vi.fn()}
      onClick={vi.fn()}
    />,
  )
}

describe('AssetTile 3D preview', () => {
  it('never sends a GLB URL to an image element when the poster is missing', () => {
    renderTile(model3DGeneration())

    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://cdn.example.com/source.png',
    )
    expect(screen.getByRole('img')).not.toHaveAttribute(
      'src',
      expect.stringContaining('.glb'),
    )
  })

  it('renders a 3D placeholder instead of an image when no still is available', () => {
    renderTile(model3DGeneration({ referenceImageUrl: null }))

    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getAllByText('sidebarModel3D')).toHaveLength(1)
  })
})

describe('AssetTile video poster', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('posters the tile from the CDN frame endpoint and stops preloading video bytes', () => {
    vi.stubEnv('NEXT_PUBLIC_STORAGE_BASE_URL', CDN)
    const { container } = renderTile(videoGeneration())

    const video = container.querySelector('video')
    expect(video).not.toBeNull()
    expect(video).toHaveAttribute('preload', 'none')
    expect(video?.getAttribute('poster')).toContain('/cdn-cgi/media/mode=frame')
  })

  it('prefers a derived thumbnail when the pipeline produced one', () => {
    vi.stubEnv('NEXT_PUBLIC_STORAGE_BASE_URL', CDN)
    const { container } = renderTile(
      videoGeneration({ thumbnailUrl: `${CDN}/generations/video/clip.jpg` }),
    )

    expect(container.querySelector('video')).toHaveAttribute(
      'poster',
      `${CDN}/generations/video/clip.jpg`,
    )
  })

  it('never seeks the video element to build its own frame', () => {
    vi.stubEnv('NEXT_PUBLIC_STORAGE_BASE_URL', CDN)
    const { container } = renderTile(videoGeneration())
    const video = container.querySelector('video')

    // 抠帧逻辑没了 —— 没有 loadedmetadata 处理器，也就不会有 currentTime 跳帧。
    expect(video).not.toHaveAttribute('onloadedmetadata')
    expect(video?.currentTime).toBe(0)
  })

  it('keeps a recognizable placeholder when no poster can be built', () => {
    vi.stubEnv('NEXT_PUBLIC_STORAGE_BASE_URL', CDN)
    const { container } = renderTile(
      videoGeneration({ url: 'https://fal.media/files/tmp/clip.mp4' }),
    )

    expect(screen.getAllByText('sidebarVideos')).toHaveLength(1)
    expect(container.querySelector('video')).not.toHaveAttribute('poster')
  })

  it('renders only the poster image while the tile is still off screen', () => {
    vi.stubEnv('NEXT_PUBLIC_STORAGE_BASE_URL', CDN)
    // 视口外 = observer 永不回调（jsdom 默认没有这个 API，装一个哑实现来
    // 走「还没进视口」那条分支）。
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    )

    const { container } = renderTile(videoGeneration())

    expect(container.querySelector('video')).toBeNull()
    expect(container.querySelector('img')?.getAttribute('src')).toContain(
      '/cdn-cgi/media/mode=frame',
    )

    vi.unstubAllGlobals()
  })
})
