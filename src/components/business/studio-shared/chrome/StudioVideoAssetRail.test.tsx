// ⚠ 用 `fireEvent` 不是 `user-event`：本仓没装 `@testing-library/user-event`。
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ASSET_DND_MIME } from '@/constants/asset-dnd'
import { GENERATION_REVIEW_STATE_IDS } from '@/constants/assistant-operator'
import { setOperatorReviewState } from '@/hooks/use-studio-operator-store'
import type { UseStudioVideoAssetsReturn } from '@/hooks/use-studio-video-assets'

import { StudioVideoAssetRail } from './StudioVideoAssetRail'

/**
 * 视频素材轨（owner 2026-09-24 视频画板 ①）。
 *
 * 钉四件事：
 *  ① 轨上按类型编号（图片N · 视频N · 音频N），首 / 尾帧是图片上的角标；
 *  ② 轨下那行灰字说清这一枪按什么方式发（没有模式分段）；
 *  ③ 拖进来的图走同一个入口（`addImage`），「已否」的产物拒收且要说话；
 *  ④ 型号什么都不收时整块不渲染（⛔ 不留一个空标题）。
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

const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError } }))

const dispatch = vi.hoisted(() => vi.fn())
vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({
    state: {
      videoAudioRefs: [
        { id: 'a1', url: 'https://cdn.example.com/v.mp3', fileName: 'v.mp3' },
      ],
    },
    dispatch,
  }),
}))

vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: () => null,
}))

const assets = vi.hoisted(() => ({
  current: null as unknown as UseStudioVideoAssetsReturn,
}))
vi.mock('@/hooks/use-studio-video-assets', () => ({
  useStudioVideoAssets: () => assets.current,
}))

beforeEach(() => {
  dispatch.mockClear()
  toastError.mockClear()
  assets.current = {
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
    isUploading: false,
  }
})

function dropUrl(url: string, assetIds?: readonly string[]) {
  fireEvent.drop(screen.getByTestId('studio-video-asset-rail'), {
    dataTransfer: {
      files: [],
      getData: (type: string) => {
        if (type === 'text/uri-list') return url
        if (type === ASSET_DND_MIME && assetIds) return JSON.stringify(assetIds)
        return ''
      },
    },
  })
}

describe('视频素材轨', () => {
  it('按类型编号，首帧是图片上的角标；音频也在同一条轨上', () => {
    render(<StudioVideoAssetRail />)
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

  it('轨下一行灰字说清这一枪怎么发（⛔ 没有模式分段）', () => {
    render(<StudioVideoAssetRail />)
    expect(screen.getByTestId('video-asset-send-mode')).toHaveTextContent(
      'omniReference',
    )
  })

  it('拖一张图进来走同一个入口 addImage', () => {
    render(<StudioVideoAssetRail />)
    dropUrl('https://cdn.example.com/new.png')
    expect(assets.current.addImage).toHaveBeenCalledWith(
      'https://cdn.example.com/new.png',
    )
  })

  it('⛔ 「已否」的产物拒收，而且要说话', () => {
    setOperatorReviewState('gen-blocked', GENERATION_REVIEW_STATE_IDS.blocked)
    render(<StudioVideoAssetRail />)
    dropUrl('https://cdn.example.com/blocked.png', ['gen-blocked'])
    expect(assets.current.addImage).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith('reject.blockedSource')
  })

  it('型号什么都不收时整块不渲染', () => {
    assets.current = {
      ...assets.current,
      capacity: { frames: 0, references: 0, videos: 0, audios: 0 },
    }
    const { container } = render(<StudioVideoAssetRail />)
    expect(container).toBeEmptyDOMElement()
  })
})
