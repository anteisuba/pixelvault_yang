import { fireEvent, render, screen } from '@testing-library/react'
import * as Toolbar from '@radix-ui/react-toolbar'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import type { UseStudioVideoAssetsReturn } from '@/hooks/use-studio-video-assets'
import type { GenerationRecord } from '@/types'

import { StudioVideoAssetChip } from './StudioVideoAssetChip'

/**
 * 视频台工具行的「素材」chip（owner 2026-09-27 视频台 A）：
 *  ① 四样都在菜单里：上传图片 / 从素材库选图 / 选参考视频 / 添加音频；
 *  ② 挂满了、这个型号不收、还没选型号 —— 那一项灰着写原因（⛔ 不藏）；
 *  ③ 上传与素材库都走宿主那一份 assets（与输入框里的素材排同一份）。
 */

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))

const form = vi.hoisted(() => ({
  audioRefs: [] as { id: string; url: string }[],
  dispatch: vi.fn(),
}))
vi.mock('@/contexts/studio-context', () => ({
  useStudioForm: () => ({
    state: { selectedOptionId: 'video-option', videoAudioRefs: form.audioRefs },
    dispatch: form.dispatch,
  }),
}))

const model = vi.hoisted(() => ({ selected: true }))
vi.mock('@/hooks/use-video-model-options', () => ({
  useVideoModelOptions: () => ({
    selectedModel: model.selected
      ? { optionId: 'video-option', modelId: 'kling-v3-pro' }
      : undefined,
  }),
}))

vi.mock('@/lib/model-options', () => ({
  getTranslatedModelLabel: () => 'Kling V3 Pro',
}))

const picked = vi.hoisted(() => ({
  generation: null as GenerationRecord | null,
}))
vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: ({
    open,
    mediaType,
    onSelect,
  }: {
    open: boolean
    mediaType: string
    onSelect: (generation: GenerationRecord) => void
  }) =>
    open ? (
      <button
        type="button"
        onClick={() => picked.generation && onSelect(picked.generation)}
      >
        {`library:${mediaType}`}
      </button>
    ) : null,
}))

vi.mock('@/components/business/studio-shared/primitives/tool-surface', () => ({
  useStudioChipClasses: () => ({
    look: 'outline',
    trigger: '',
    open: '',
    set: '',
    compact: '',
    compactLabel: '',
    popoverAlign: 'start',
    popoverSideOffset: 8,
  }),
  StudioToolSurface: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  StudioToolSurfaceTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  StudioToolPopoverContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}))

function makeAssets(
  overrides: Partial<UseStudioVideoAssetsReturn> = {},
): UseStudioVideoAssetsReturn {
  return {
    capacity: { frames: 2, references: 0, videos: 0, audios: 0 },
    images: [],
    videos: [],
    send: null,
    rolesFor: () => [],
    addImage: vi.fn(),
    setRole: vi.fn(),
    removeImage: vi.fn(),
    uploadImageFile: vi.fn(async () => {}),
    addVideo: vi.fn(),
    removeVideo: vi.fn(),
    acceptsImages: true,
    acceptTransfer: vi.fn(),
    acceptGeneration: vi.fn(),
    isUploading: false,
    ...overrides,
  }
}

function renderChip(assets: UseStudioVideoAssetsReturn) {
  return render(
    <Toolbar.Root>
      <StudioVideoAssetChip assets={assets} />
    </Toolbar.Root>,
  )
}

beforeEach(() => {
  form.audioRefs = []
  form.dispatch.mockClear()
  model.selected = true
  picked.generation = null
})

describe('视频台 · 「素材」chip', () => {
  it('这个型号不收参考视频和音频：那两项灰着写原因（⛔ 不藏）', () => {
    renderChip(makeAssets())
    expect(screen.getByRole('button', { name: /^uploadImage/ })).toBeEnabled()
    const video = screen.getByRole('button', { name: /^pickVideo/ })
    expect(video).toBeDisabled()
    expect(video).toHaveTextContent('menu.noVideo:{"model":"Kling V3 Pro"}')
    expect(screen.getByRole('button', { name: /^addAudio/ })).toHaveTextContent(
      'menu.noAudio:{"model":"Kling V3 Pro"}',
    )
    expect(screen.getByText('menu.dropHint')).toBeInTheDocument()
  })

  it('首尾帧两格都占了：上传与选图灰着，说挂了几张、最多几张', () => {
    renderChip(
      makeAssets({
        images: [
          { url: 'https://cdn.example.com/a.png', role: 'first', n: 1 },
          { url: 'https://cdn.example.com/b.png', role: 'last', n: 2 },
        ],
      }),
    )
    const upload = screen.getByRole('button', { name: /^uploadImage/ })
    expect(upload).toBeDisabled()
    expect(upload).toHaveTextContent('menu.imagesFull:{"count":2,"max":2}')
    expect(screen.getByRole('button', { name: /^pickImage/ })).toBeDisabled()
  })

  it('还没选型号：说「先选型号」，⛔ 不说一个空名字「不收」', () => {
    model.selected = false
    renderChip(
      makeAssets({
        capacity: { frames: 0, references: 0, videos: 0, audios: 0 },
        acceptsImages: false,
      }),
    )
    expect(
      screen.getByRole('button', { name: /^uploadImage/ }),
    ).toHaveTextContent('menu.pickModel')
    expect(screen.queryByText(/noImage/)).toBeNull()
  })

  it('上传：选几张传几张，一张一张走宿主那份 assets', async () => {
    const assets = makeAssets()
    renderChip(assets)
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement
    const files = [
      new File(['a'], 'a.png', { type: 'image/png' }),
      new File(['b'], 'b.png', { type: 'image/png' }),
    ]
    Object.defineProperty(input, 'files', { value: files })
    fireEvent.change(input)
    await vi.waitFor(() =>
      expect(assets.uploadImageFile).toHaveBeenCalledTimes(2),
    )
    expect(assets.uploadImageFile).toHaveBeenNthCalledWith(1, files[0])
    expect(assets.uploadImageFile).toHaveBeenNthCalledWith(2, files[1])
  })

  it('素材库选参考视频：挑中的那条交给 acceptGeneration(…, video)', () => {
    const assets = makeAssets({
      capacity: { frames: 2, references: 9, videos: 1, audios: 3 },
    })
    picked.generation = {
      id: 'gen-video',
      url: 'https://cdn.example.com/v.mp4',
      outputType: 'VIDEO',
    } as GenerationRecord
    renderChip(assets)
    fireEvent.click(screen.getByRole('button', { name: /^pickVideo/ }))
    fireEvent.click(screen.getByRole('button', { name: 'library:video' }))
    expect(assets.acceptGeneration).toHaveBeenCalledWith(
      picked.generation,
      'video',
    )
  })

  it('添加音频：打开音频设置那一面板', () => {
    renderChip(
      makeAssets({
        capacity: { frames: 2, references: 9, videos: 1, audios: 3 },
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: /^addAudio/ }))
    expect(form.dispatch).toHaveBeenCalledWith({
      type: 'OPEN_PANEL',
      payload: 'videoAudio',
    })
  })
})
