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

  // 《画布修法》02 节刀 1 task B：调查锚点原文点名「参考视频空态」要从 400 收到
  // 320——但这张卡从来不走 NodeShell 的 w-node-card（它是可缩放媒体卡，见文件顶
  // 部注释），落点已经是 use-node-workflow.ts `addNode` 的 `needsExplicitSize`
  // 分支显式写的 NODE_STUDIO_LOOSE_IMAGE_DEFAULT_SIZE(320)。React Flow 还没测出
  // 真实尺寸、`width`/`height` prop 缺席时的兜底同样是这个常量——补一条回归锁住
  // 这个"已经是 320"的事实，不需要为它改产品代码。
  it('falls back to the shared loose-image size (320) before React Flow measures it', () => {
    const props = {
      id: 'video-reference-2',
      type: 'videoReference',
      data: { prompt: '', status: 'idle' },
      selected: false,
    } as unknown as ComponentProps<typeof VideoReferenceNode>
    const { container } = render(<VideoReferenceNode {...props} />)
    const root = container.firstElementChild as HTMLElement

    expect(root.style.width).toBe('320px')
    expect(root.style.height).toBe('320px')
  })
})
