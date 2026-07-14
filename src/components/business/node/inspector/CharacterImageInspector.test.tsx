/* eslint-disable @next/next/no-img-element */

import type { ImgHTMLAttributes } from 'react'
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
  useRouter: () => ({ push: vi.fn() }),
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
const generateMediaNode = vi.fn()

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
      referenceAssets: [],
      loras: [],
      ...patch,
    },
  }
}

function renderInspector(initialNode: NodeWorkflowNode) {
  function Harness() {
    const [node, setNode] = useState(initialNode)
    const actions: NodeWorkflowCanvasActions = {
      updateNodeData: (nodeId, patch) => {
        updateNodeData(nodeId, patch)
        setNode((current) => ({
          ...current,
          data: { ...current.data, ...patch },
        }))
      },
      setScriptDoc: vi.fn(),
      setDefaultVideoModel: vi.fn(),
      setCanvasAppearance: vi.fn(),
      defaultVideoModel: undefined,
      setScriptDocStage: vi.fn(),
      setScriptDocDepth: vi.fn(),
      setScriptDocLocks: vi.fn(),
      scriptDocStage: undefined,
      scriptDocDepth: undefined,
      scriptDocLocks: undefined,
      applyScriptDocToGraph: vi.fn(),
      deleteNode: vi.fn(),
      deleteEdge: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
      canUndo: false,
      canRedo: false,
      generateMediaNode,
      generateCharacterImage: vi.fn(),
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

  return render(<Harness />)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CharacterImageInspector (unified wrapper)', () => {
  it('keeps one reference-material entry and removes duplicate image source controls', () => {
    renderInspector(createCharacterNode())

    expect(screen.getByLabelText('nameLabel')).toBeInTheDocument()
    expect(screen.getByText('referenceControls')).toBeInTheDocument()
    expect(screen.queryByText('existing.upload')).not.toBeInTheDocument()
    expect(screen.queryByText('modelPicker')).not.toBeInTheDocument()
    expect(screen.queryByText('changeSourceExisting')).not.toBeInTheDocument()
    expect(screen.queryByText('changeSourceAi')).not.toBeInTheDocument()
    expect(screen.queryByText('changeSourceStudio')).not.toBeInTheDocument()
  })

  it('writes the character name', () => {
    renderInspector(createCharacterNode())

    fireEvent.change(screen.getByLabelText('nameLabel'), {
      target: { value: 'Aria' },
    })

    expect(updateNodeData).toHaveBeenCalledWith('node-character', {
      characterName: 'Aria',
    })
  })

  it('keeps legacy media data compatible without restoring the duplicate preview', () => {
    renderInspector(
      createCharacterNode({
        imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.choice,
        imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
        mediaUrl: 'https://cdn.test/character.png',
      }),
    )

    expect(screen.queryByAltText('imageAlt')).not.toBeInTheDocument()
    expect(screen.getByText('referenceControls')).toBeInTheDocument()
  })
})
