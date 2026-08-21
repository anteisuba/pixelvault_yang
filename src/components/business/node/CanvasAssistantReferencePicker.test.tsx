import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AssistantReferenceOption } from '@/components/business/assistant/AssistantReferencePicker'
import type { GenerationRecord } from '@/types'

const mockUploadImage = vi.fn()
const mockUploadVideo = vi.fn()
const mockCaptureVideoThumbnail = vi.fn()
let pickerProps: {
  onPickImageFile(file: File): unknown
  onPickImageAsset(generation: GenerationRecord): unknown
  onPickVideoAsset(generation: GenerationRecord): unknown
  onPickExisting(reference: AssistantReferenceOption): unknown
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

vi.mock('@/hooks/node/use-node-reference-upload', () => ({
  useNodeReferenceUpload: () => ({
    uploadFile: (...args: unknown[]) => mockUploadImage(...args),
    isUploading: false,
    error: null,
  }),
}))

vi.mock('@/lib/api-client', () => ({
  uploadReferenceVideoAPI: (...args: unknown[]) => mockUploadVideo(...args),
}))

vi.mock('@/lib/video-thumbnail', () => ({
  captureVideoThumbnail: (...args: unknown[]) =>
    mockCaptureVideoThumbnail(...args),
}))

vi.mock('@/components/business/assistant/AssistantReferencePicker', () => ({
  AssistantReferencePicker: (props: typeof pickerProps) => {
    pickerProps = props
    return <button type="button">reference-picker</button>
  },
}))

import { CanvasAssistantReferencePicker } from './CanvasAssistantReferencePicker'

describe('CanvasAssistantReferencePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUploadImage.mockResolvedValue({
      success: true,
      url: 'https://cdn.example.com/upload.png',
      generationId: 'generation-1',
    })
  })

  it('uploads an image and adds it as a non-node assistant reference', async () => {
    const onAddReference = vi.fn()
    render(
      <CanvasAssistantReferencePicker
        references={[]}
        selectedReferences={[]}
        onAddReference={onAddReference}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'reference-picker' }),
    ).toBeVisible()
    const file = new File(['image'], 'reference.png', { type: 'image/png' })
    await act(async () => {
      await pickerProps.onPickImageFile(file)
    })

    expect(mockUploadImage).toHaveBeenCalledWith(
      file,
      'Node assistant reference image',
    )
    expect(onAddReference).toHaveBeenCalledWith({
      id: 'uploaded-image:generation-1',
      source: 'upload',
      kind: 'image',
      url: 'https://cdn.example.com/upload.png',
      thumbnailUrl: 'https://cdn.example.com/upload.png',
      label: 'reference.png',
    })
  })

  it('keeps canvas reference identity when selecting an existing item', () => {
    const onAddReference = vi.fn()
    const reference = {
      id: 'node-reference:node-1',
      nodeId: 'node-1',
      source: 'canvas' as const,
      kind: 'image' as const,
      url: 'https://cdn.example.com/node.png',
      label: 'Character',
    }
    render(
      <CanvasAssistantReferencePicker
        references={[reference]}
        selectedReferences={[]}
        onAddReference={onAddReference}
      />,
    )

    pickerProps.onPickExisting(reference)
    expect(onAddReference).toHaveBeenCalledWith(reference)
  })

  it('adds a gallery video as the full stable video URL, not its poster', () => {
    const onAddReference = vi.fn()
    render(
      <CanvasAssistantReferencePicker
        references={[]}
        selectedReferences={[]}
        onAddReference={onAddReference}
      />,
    )

    pickerProps.onPickVideoAsset({
      id: 'video-1',
      outputType: 'VIDEO',
      url: 'https://cdn.example.com/reference.mp4',
      thumbnailUrl: 'https://cdn.example.com/reference.jpg',
      prompt: 'Camera movement reference',
    } as GenerationRecord)

    expect(onAddReference).toHaveBeenCalledWith({
      id: 'gallery-video:video-1',
      source: 'gallery',
      kind: 'video',
      url: 'https://cdn.example.com/reference.mp4',
      thumbnailUrl: 'https://cdn.example.com/reference.jpg',
      // ⛔ 不是 generation 的 prompt（owner 2026-08-19：参考图的 prompt 不喂给
      // 模型，画布也不喂）。指定第几张靠 #n 序号，不靠内容。
      label: 'galleryVideoLabel',
    })
  })

  it('图库图片同样不拿 prompt 当 label', () => {
    const onAddReference = vi.fn()
    render(
      <CanvasAssistantReferencePicker
        references={[]}
        selectedReferences={[]}
        onAddReference={onAddReference}
      />,
    )

    pickerProps.onPickImageAsset({
      id: 'image-1',
      outputType: 'IMAGE',
      url: 'https://cdn.example.com/a.png',
      thumbnailUrl: 'https://cdn.example.com/a-thumb.png',
      prompt: '一段会被喂给模型的完整提示词',
    } as GenerationRecord)

    expect(onAddReference).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'galleryImageLabel' }),
    )
    expect(onAddReference).not.toHaveBeenCalledWith(
      expect.objectContaining({ label: '一段会被喂给模型的完整提示词' }),
    )
  })
})
