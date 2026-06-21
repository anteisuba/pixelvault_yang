/* eslint-disable @next/next/no-img-element */

import type { ImgHTMLAttributes, ReactNode } from 'react'
import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('next/image', () => ({
  default: ({
    alt,
    src,
  }: ImgHTMLAttributes<HTMLImageElement> & {
    fill?: boolean
    unoptimized?: boolean
  }) => <img alt={alt} src={typeof src === 'string' ? src : ''} />,
}))

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: () => null,
}))

vi.mock('@/components/business/node/CharacterImageReferenceControls', () => ({
  CharacterImageReferenceControls: () => <button>referenceControls</button>,
}))

vi.mock('@/components/business/node/CharacterImageLoraControls', () => ({
  CharacterImageLoraControls: () => <button>loraControls</button>,
}))

vi.mock('@/components/business/node/WorkflowModelPicker', () => ({
  WorkflowModelPicker: () => <button>modelPicker</button>,
}))

vi.mock('@/hooks/node/use-node-reference-upload', () => ({
  useNodeReferenceUpload: () => ({
    uploadFile: vi.fn(),
    isUploading: false,
  }),
}))

import {
  NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS,
  NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS,
  NODE_STUDIO_TOOL_MODE_IDS,
} from '@/constants/node-studio'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import {
  NODE_GENERATION_STATUS_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'
import { NodeWorkflowActionsProvider } from '@/components/business/node/NodeWorkflowActionsContext'
import { CharacterImageInspector } from '@/components/business/node/inspector/CharacterImageInspector'
import type { NodeWorkflowCanvasActions } from '@/components/business/node/NodeWorkflowActionsContext'
import type {
  NodeWorkflowModelOption,
  NodeWorkflowNode,
} from '@/types/node-workflow'

const updateNodeData = vi.fn()
const generateCharacterImage = vi.fn()

const IMAGE_OPTION: NodeWorkflowModelOption = {
  optionId: 'saved:image',
  modelId: 'gemini-3.1-flash-image-preview',
  adapterType: AI_ADAPTER_TYPES.GEMINI,
  providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.GEMINI),
  requestCount: 2,
  sourceType: 'saved',
  apiKeyId: 'key-image',
}

function createCharacterNode(
  patch: Partial<NodeWorkflowNode['data']> = {},
): NodeWorkflowNode {
  return {
    id: 'node-character',
    type: NODE_TYPE_IDS.characterImage,
    position: { x: 0, y: 0 },
    data: {
      prompt: 'character prompt',
      status: NODE_STATUS_IDS.idle,
      generationStatus: NODE_GENERATION_STATUS_IDS.idle,
      imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.choice,
      referenceAssets: [],
      loras: [],
      ...patch,
    },
  }
}

function renderWithActions(initialNode: NodeWorkflowNode) {
  function CharacterInspectorHarness() {
    const [node, setNode] = useState(initialNode)
    const actions: NodeWorkflowCanvasActions = {
      updateNodeData: (nodeId, patch) => {
        updateNodeData(nodeId, patch)
        setNode((currentNode) => ({
          ...currentNode,
          data: {
            ...currentNode.data,
            ...patch,
          },
        }))
      },
      setScriptDoc: vi.fn(),
      setDefaultVideoModel: vi.fn(),
      defaultVideoModel: undefined,
      applyScriptDocToGraph: vi.fn(),
      deleteNode: vi.fn(),
      deleteEdge: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
      canUndo: false,
      canRedo: false,
      generateCharacterImage,
      toolMode: NODE_STUDIO_TOOL_MODE_IDS.pointer,
      setToolMode: vi.fn(),
      expandedNodeId: null,
      setExpandedNodeId: vi.fn(),
      modelOptionsByType: {
        [NODE_TYPE_IDS.characterImage]: [IMAGE_OPTION],
      },
    }

    return (
      <ReactFlowProvider>
        <NodeWorkflowActionsProvider value={actions}>
          <CharacterImageInspector node={node} />
        </NodeWorkflowActionsProvider>
      </ReactFlowProvider>
    )
  }

  return render(<CharacterInspectorHarness />)
}

function renderStatic(children: ReactNode) {
  return render(
    <ReactFlowProvider>
      <NodeWorkflowActionsProvider
        value={{
          updateNodeData,
          setScriptDoc: vi.fn(),
          setDefaultVideoModel: vi.fn(),
          defaultVideoModel: undefined,
          applyScriptDocToGraph: vi.fn(),
          deleteNode: vi.fn(),
          deleteEdge: vi.fn(),
          undo: vi.fn(),
          redo: vi.fn(),
          canUndo: false,
          canRedo: false,
          generateCharacterImage,
          toolMode: NODE_STUDIO_TOOL_MODE_IDS.pointer,
          setToolMode: vi.fn(),
          expandedNodeId: null,
          setExpandedNodeId: vi.fn(),
          modelOptionsByType: {
            [NODE_TYPE_IDS.characterImage]: [IMAGE_OPTION],
          },
        }}
      >
        {children}
      </NodeWorkflowActionsProvider>
    </ReactFlowProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CharacterImageInspector', () => {
  it('starts with three clear source choices before showing AI controls', () => {
    renderWithActions(createCharacterNode())

    expect(screen.getByText('modeExistingTitle')).toBeInTheDocument()
    expect(screen.getByText('modeAiTitle')).toBeInTheDocument()
    expect(screen.getByText('modeStudioTitle')).toBeInTheDocument()
    expect(screen.queryByText('modelPicker')).not.toBeInTheDocument()
    expect(screen.queryByText('emptyPreview')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('modeAiTitle'))

    expect(screen.getByText('activeAiTitle')).toBeInTheDocument()
    expect(screen.getByText('emptyPreview')).toBeInTheDocument()
    expect(screen.getByText('modelPicker')).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('backToChoice'))

    expect(screen.getByText('modeExistingTitle')).toBeInTheDocument()
  })

  it('can turn an existing image into an AI reference', () => {
    renderWithActions(
      createCharacterNode({
        imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.existing,
        imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
        imageUrl: 'https://cdn.test/existing.png',
        sourceGenerationId: 'generation-existing',
        sourceLabel: 'Existing character',
      }),
    )

    fireEvent.click(screen.getByText('useExistingAsReference'))

    expect(updateNodeData).toHaveBeenCalledWith(
      'node-character',
      expect.objectContaining({
        imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.ai,
        referenceAssets: expect.arrayContaining([
          expect.objectContaining({
            url: 'https://cdn.test/existing.png',
            sourceId: 'generation-existing',
          }),
        ]),
      }),
    )
  })

  it('keeps existing controls visible when rendered statically', () => {
    renderStatic(
      <CharacterImageInspector
        node={createCharacterNode({
          imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.existing,
          imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
          imageUrl: 'https://cdn.test/existing.png',
        })}
      />,
    )

    expect(screen.getByText('activeExistingTitle')).toBeInTheDocument()
    expect(screen.getByText('useExistingAsReference')).toBeInTheDocument()
  })
})
