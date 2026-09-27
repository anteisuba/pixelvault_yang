import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { UseStudioVideoAssetsReturn } from '@/hooks/use-studio-video-assets'

import { StudioVideoAssetRail } from './StudioVideoAssetRail'

/**
 * 视频台的素材排（owner 2026-09-27 视频台 A「素材在输入框里」）。
 *
 * 钉四件事：
 *  ① 一排按类型编号（图片N · 视频N · 音频N），首 / 尾帧是图片上的角标；
 *  ② 最右一行灰字说清这一枪按什么方式发（没有模式分段）；
 *  ③ 什么都没挂时整排不渲染（⛔ 不写「文生视频」）；
 *  ④ 上传中占一格转圈 —— 与「素材」chip 同一份 assets，看得见对方在传。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key
    t.rich = (key: string, values?: Record<string, unknown>) =>
      `${key}:${JSON.stringify({ mode: values?.mode, reason: values?.reason })}`
    return t
  },
}))

const form = vi.hoisted(() => ({
  audioRefs: [] as { id: string; url: string; fileName?: string }[],
}))
vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({
    state: { videoAudioRefs: form.audioRefs },
    dispatch: vi.fn(),
  }),
}))

function makeAssets(
  overrides: Partial<UseStudioVideoAssetsReturn> = {},
): UseStudioVideoAssetsReturn {
  return {
    capacity: { frames: 2, references: 9, videos: 3, audios: 3 },
    images: [
      { url: 'https://cdn.example.com/f.png', role: 'first', n: 1 },
      { url: 'https://cdn.example.com/r.png', role: 'reference', n: 2 },
    ],
    videos: [],
    send: {
      modelId: 'seedance-2.0-reference',
      hasReference: true,
      mode: 'omniReference',
      images: [],
    },
    rolesFor: () => [],
    addImage: vi.fn(),
    setRole: vi.fn(),
    removeImage: vi.fn(),
    uploadImageFile: vi.fn(),
    addVideo: vi.fn(),
    removeVideo: vi.fn(),
    acceptsImages: true,
    acceptTransfer: vi.fn(),
    acceptGeneration: vi.fn(),
    isUploading: false,
    ...overrides,
  }
}

beforeEach(() => {
  form.audioRefs = [
    { id: 'a1', url: 'https://cdn.example.com/v.mp3', fileName: 'v.mp3' },
  ]
})

describe('视频台 · 素材排', () => {
  it('按类型编号，首帧是图片上的角标；音频也在同一排', () => {
    render(<StudioVideoAssetRail assets={makeAssets()} />)
    expect(screen.getByTestId('video-asset-image-1')).toHaveTextContent(
      'image:{"n":1}',
    )
    expect(screen.getByTestId('video-asset-badge-first')).toBeInTheDocument()
    expect(screen.getByTestId('video-asset-image-2')).toHaveTextContent(
      'image:{"n":2}',
    )
    expect(screen.getByTestId('video-asset-audio-1')).toHaveTextContent(
      'audio:{"n":1}',
    )
  })

  it('最右一行灰字说清这一枪怎么发（⛔ 没有模式分段）', () => {
    render(<StudioVideoAssetRail assets={makeAssets()} />)
    expect(screen.getByTestId('video-asset-send-mode')).toHaveTextContent(
      'omniReference',
    )
  })

  it('什么都没挂：整排不渲染，也不写「文生视频」', () => {
    form.audioRefs = []
    const { container } = render(
      <StudioVideoAssetRail
        assets={makeAssets({
          images: [],
          send: {
            modelId: 'seedance-2.0',
            hasReference: false,
            mode: 'textToVideo',
            images: [],
          },
        })}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('上传中：占一格转圈，灰字还不出（还没挂上东西）', () => {
    form.audioRefs = []
    render(
      <StudioVideoAssetRail
        assets={makeAssets({ images: [], isUploading: true })}
      />,
    )
    expect(screen.getByRole('status', { name: 'uploading' })).toBeVisible()
    expect(screen.queryByTestId('video-asset-send-mode')).toBeNull()
  })
})
