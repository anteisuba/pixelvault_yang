/* eslint-disable @next/next/no-img-element */

import {
  useState,
  type ComponentType,
  type ImgHTMLAttributes,
  type ReactNode,
} from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
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

vi.mock('@xyflow/react', () => ({
  useEdges: () => [],
  useNodes: () => [],
}))

vi.mock('@/components/business/AssetSelectorDialog', () => ({
  AssetSelectorDialog: () => null,
}))

vi.mock('@/components/business/node/FishVoiceLibraryDialog', () => ({
  FishVoiceLibraryDialog: ({
    onSelectVoiceId,
  }: {
    onSelectVoiceId: (voiceId: string) => void
  }) => (
    <button type="button" onClick={() => onSelectVoiceId('fish-voice-test')}>
      fishVoiceDialog
    </button>
  ),
}))

vi.mock('@/components/business/node/CharacterImageReferenceControls', () => ({
  CharacterImageReferenceControls: () => <button>referenceControls</button>,
}))

vi.mock('@/components/business/node/CharacterImageLoraControls', () => ({
  CharacterImageLoraControls: () => <button>loraControls</button>,
}))

vi.mock('@/components/business/node/WorkflowModelPicker', () => ({
  WorkflowModelPicker: ({
    options,
    onChange,
  }: {
    options: Array<{ optionId: string; modelId: string }>
    onChange: (model: { optionId: string; modelId: string }) => void
  }) => (
    <button type="button" onClick={() => onChange(options[0])}>
      modelPicker
    </button>
  ),
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
  NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS,
} from '@/constants/node-studio'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import {
  NODE_GENERATION_STATUS_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
  NODE_WORKFLOW_FIELD_IDS,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import { NodeWorkflowActionsProvider } from '@/components/business/node/NodeWorkflowActionsContext'
import { BackgroundImageInspector } from '@/components/business/node/inspector/BackgroundImageInspector'
import { FrameImageInspector } from '@/components/business/node/inspector/FrameImageInspector'
import { ShotInspector } from '@/components/business/node/inspector/ShotInspector'
import { ShotTextInspector } from '@/components/business/node/inspector/ShotTextInspector'
import { VoiceInspector } from '@/components/business/node/inspector/VoiceInspector'
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

const VIDEO_OPTION: NodeWorkflowModelOption = {
  ...IMAGE_OPTION,
  optionId: 'saved:video',
  modelId: 'seedance-2.0',
  adapterType: AI_ADAPTER_TYPES.FAL,
  providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
  apiKeyId: 'key-video',
}

const ACTIONS: NodeWorkflowCanvasActions = {
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
  generateMediaNode,
  toolMode: NODE_STUDIO_TOOL_MODE_IDS.pointer,
  setToolMode: vi.fn(),
  expandedNodeId: null,
  setExpandedNodeId: vi.fn(),
  modelOptionsByType: {
    [NODE_TYPE_IDS.shot]: [IMAGE_OPTION],
    [NODE_TYPE_IDS.backgroundImage]: [IMAGE_OPTION],
    [NODE_TYPE_IDS.frameImage]: [IMAGE_OPTION],
    [NODE_TYPE_IDS.seedance]: [VIDEO_OPTION],
  },
}

function createNode(
  type: NodeWorkflowNodeType,
  patch: Partial<NodeWorkflowNode['data']> = {},
): NodeWorkflowNode {
  return {
    id: `node-${type}`,
    type,
    position: { x: 0, y: 0 },
    data: {
      prompt: 'initial prompt',
      status: NODE_STATUS_IDS.idle,
      generationStatus: NODE_GENERATION_STATUS_IDS.idle,
      [NODE_WORKFLOW_FIELD_IDS.action]: 'initial action',
      [NODE_WORKFLOW_FIELD_IDS.camera]: 'initial camera',
      [NODE_WORKFLOW_FIELD_IDS.composition]: 'initial composition',
      [NODE_WORKFLOW_FIELD_IDS.dialogue]: 'initial dialogue',
      [NODE_WORKFLOW_FIELD_IDS.motion]: 'initial motion',
      [NODE_WORKFLOW_FIELD_IDS.scene]: 'initial scene',
      ...patch,
    },
  }
}

type MediaInspectorComponent = ComponentType<{ node: NodeWorkflowNode }>

function renderWithActions(children: ReactNode) {
  return render(
    <NodeWorkflowActionsProvider value={ACTIONS}>
      {children}
    </NodeWorkflowActionsProvider>,
  )
}

function renderMediaInspector(
  Inspector: MediaInspectorComponent,
  initialNode: NodeWorkflowNode,
) {
  function MediaInspectorHarness() {
    const [node, setNode] = useState(initialNode)
    const actions: NodeWorkflowCanvasActions = {
      ...ACTIONS,
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
    }

    return (
      <NodeWorkflowActionsProvider value={actions}>
        <Inspector node={node} />
      </NodeWorkflowActionsProvider>
    )
  }

  return render(<MediaInspectorHarness />)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Node media inspectors', () => {
  it('edits shot text without requiring a model', () => {
    renderWithActions(
      <ShotTextInspector node={createNode(NODE_TYPE_IDS.shotText)} />,
    )

    fireEvent.change(screen.getByLabelText('scene.label'), {
      target: { value: 'new scene text' },
    })

    expect(updateNodeData).toHaveBeenCalledWith('node-shotText', {
      [NODE_WORKFLOW_FIELD_IDS.scene]: 'new scene text',
      status: NODE_STATUS_IDS.ready,
    })
    expect(screen.queryByText('modelPicker')).not.toBeInTheDocument()
  })

  it.each([
    [NODE_TYPE_IDS.shot, ShotInspector],
    [NODE_TYPE_IDS.backgroundImage, BackgroundImageInspector],
    [NODE_TYPE_IDS.frameImage, FrameImageInspector],
  ] satisfies Array<[NodeWorkflowNodeType, MediaInspectorComponent]>)(
    'starts idle image node %s with three source choices',
    (type, Inspector) => {
      renderMediaInspector(Inspector, createNode(type))

      expect(screen.queryByText(`${type}.emptyPreview`)).not.toBeInTheDocument()
      expect(screen.getByText('modeExistingTitle')).toBeInTheDocument()
      expect(screen.getByText('modeAiTitle')).toBeInTheDocument()
      expect(screen.getByText('modeStudioTitle')).toBeInTheDocument()
      expect(screen.queryByLabelText('prompt.label')).not.toBeInTheDocument()
    },
  )

  it('can turn an existing image node result into an AI reference', () => {
    renderMediaInspector(
      BackgroundImageInspector,
      createNode(NODE_TYPE_IDS.backgroundImage, {
        imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.existing,
        imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
        mediaUrl: 'https://cdn.test/background.png',
        sourceGenerationId: 'generation-background',
        sourceLabel: 'Existing background',
      }),
    )

    fireEvent.click(screen.getByText('useExistingAsReference'))

    expect(updateNodeData).toHaveBeenCalledWith(
      'node-backgroundImage',
      expect.objectContaining({
        imageMode: NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.ai,
        referenceAssets: expect.arrayContaining([
          expect.objectContaining({
            url: 'https://cdn.test/background.png',
            sourceId: 'generation-background',
          }),
        ]),
      }),
    )
  })

  it.each([
    [NODE_TYPE_IDS.shot, ShotInspector],
    [NODE_TYPE_IDS.backgroundImage, BackgroundImageInspector],
    [NODE_TYPE_IDS.frameImage, FrameImageInspector],
  ] satisfies Array<[NodeWorkflowNodeType, MediaInspectorComponent]>)(
    'selects a model and generates %s nodes',
    (type, Inspector) => {
      renderMediaInspector(Inspector, createNode(type))

      if (
        type === NODE_TYPE_IDS.shot ||
        type === NODE_TYPE_IDS.backgroundImage ||
        type === NODE_TYPE_IDS.frameImage
      ) {
        fireEvent.click(screen.getByText('modeAiTitle'))
      }

      fireEvent.click(screen.getByText('modelPicker'))
      fireEvent.click(screen.getByText('generate'))

      expect(updateNodeData).toHaveBeenCalledWith(
        `node-${type}`,
        expect.objectContaining({
          model: expect.objectContaining({
            optionId: expect.stringContaining('saved:'),
          }),
        }),
      )
      expect(generateMediaNode).toHaveBeenCalledWith(`node-${type}`)
    },
  )

  it('edits voice profile data without treating it as a generation node', () => {
    renderMediaInspector(VoiceInspector, createNode(NODE_TYPE_IDS.voice))

    fireEvent.change(screen.getByLabelText('voiceName.label'), {
      target: { value: 'Narrator voice' },
    })

    expect(updateNodeData).toHaveBeenCalledWith('node-voice', {
      [NODE_WORKFLOW_FIELD_IDS.voiceName]: 'Narrator voice',
      status: NODE_STATUS_IDS.ready,
    })

    fireEvent.click(screen.getByText('fishVoiceDialog'))

    expect(updateNodeData).toHaveBeenCalledWith(
      'node-voice',
      expect.objectContaining({
        voiceId: 'fish-voice-test',
        voiceSource: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.fishAudio,
        status: NODE_STATUS_IDS.ready,
      }),
    )
    expect(screen.queryByText('modelPicker')).not.toBeInTheDocument()
    expect(generateMediaNode).not.toHaveBeenCalled()
  })
})
