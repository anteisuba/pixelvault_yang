import { fireEvent, render } from '@testing-library/react'
import type { ComponentProps, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { updateNodeData, resizeNode } = vi.hoisted(() => ({
  updateNodeData: vi.fn(),
  resizeNode: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@xyflow/react', () => ({
  NodeResizer: ({ keepAspectRatio }: { keepAspectRatio?: boolean }) => (
    <div
      data-testid="node-resizer"
      data-keep-aspect-ratio={String(keepAspectRatio)}
    />
  ),
  NodeToolbar: ({ children }: { children: ReactNode }) => children,
  Position: { Top: 'top' },
}))

vi.mock('../NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({
    updateNodeData,
    resizeNode,
    multiSelectActive: false,
  }),
}))

vi.mock('@/hooks/node/use-reference-video-upload', () => ({
  useReferenceVideoUpload: () => ({
    uploadFile: vi.fn(),
    isUploading: false,
  }),
}))

vi.mock('../CanvasImageSelectionToolbar', () => ({
  NodeSelectionToolbarChrome: () => null,
}))

vi.mock('../CanvasPopIn', () => ({
  CanvasPopIn: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('./NodeShell', () => ({
  EditableNodeLabel: () => null,
  NodeCardPorts: () => null,
}))

import { VideoReferenceNode } from './VideoReferenceNode'

describe('VideoReferenceNode', () => {
  beforeEach(() => {
    updateNodeData.mockClear()
    resizeNode.mockClear()
  })

  it('fits the node to the uploaded video aspect ratio without letterboxing', () => {
    const props = {
      id: 'video-reference-1',
      type: 'videoReference',
      data: {
        prompt: '',
        status: 'done',
        mediaUrl: 'https://cdn.example.com/reference.mp4',
      },
      selected: true,
      width: 320,
      height: 320,
    } as unknown as ComponentProps<typeof VideoReferenceNode>
    const { container, getByTestId } = render(<VideoReferenceNode {...props} />)
    const video = container.querySelector('video') as HTMLVideoElement
    Object.defineProperty(video, 'videoWidth', {
      configurable: true,
      value: 1920,
    })
    Object.defineProperty(video, 'videoHeight', {
      configurable: true,
      value: 1080,
    })

    fireEvent.loadedMetadata(video)

    expect(updateNodeData).toHaveBeenCalledWith('video-reference-1', {
      mediaWidth: 1920,
      mediaHeight: 1080,
    })
    expect(resizeNode).toHaveBeenCalledWith('video-reference-1', 320, 180)
    expect(getByTestId('node-resizer')).toHaveAttribute(
      'data-keep-aspect-ratio',
      'true',
    )
  })
})
