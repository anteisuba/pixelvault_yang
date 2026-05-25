import { useState, type ComponentType, type ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/business/studio/node/WorkflowModelPicker', () => ({
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
import { NodeWorkflowActionsProvider } from '@/components/business/studio/node/NodeWorkflowActionsContext'
import { BackgroundImageInspector } from '@/components/business/studio/node/inspector/BackgroundImageInspector'
import { FrameImageInspector } from '@/components/business/studio/node/inspector/FrameImageInspector'
import { SeedanceInspector } from '@/components/business/studio/node/inspector/SeedanceInspector'
import { ShotInspector } from '@/components/business/studio/node/inspector/ShotInspector'
import { ShotTextInspector } from '@/components/business/studio/node/inspector/ShotTextInspector'
import { VoiceInspector } from '@/components/business/studio/node/inspector/VoiceInspector'
import type { NodeWorkflowCanvasActions } from '@/components/business/studio/node/NodeWorkflowActionsContext'
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

const AUDIO_OPTION: NodeWorkflowModelOption = {
  ...IMAGE_OPTION,
  optionId: 'saved:audio',
  modelId: 'fish-audio-s2-pro',
  adapterType: AI_ADAPTER_TYPES.FISH_AUDIO,
  providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FISH_AUDIO),
  apiKeyId: 'key-audio',
}

const ACTIONS: NodeWorkflowCanvasActions = {
  updateNodeData,
  updateScriptBreakdown: vi.fn(),
  spawnCharactersFromBreakdown: vi.fn(),
  deleteNode: vi.fn(),
  generateMediaNode,
  modelOptionsByType: {
    [NODE_TYPE_IDS.shot]: [IMAGE_OPTION],
    [NODE_TYPE_IDS.backgroundImage]: [IMAGE_OPTION],
    [NODE_TYPE_IDS.frameImage]: [IMAGE_OPTION],
    [NODE_TYPE_IDS.voice]: [AUDIO_OPTION],
    [NODE_TYPE_IDS.seedance]: [VIDEO_OPTION],
  },
}

function createNode(type: NodeWorkflowNodeType): NodeWorkflowNode {
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
    [NODE_TYPE_IDS.voice, VoiceInspector],
    [NODE_TYPE_IDS.seedance, SeedanceInspector],
  ] satisfies Array<[NodeWorkflowNodeType, MediaInspectorComponent]>)(
    'selects a model and generates %s nodes',
    (type, Inspector) => {
      renderMediaInspector(Inspector, createNode(type))

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
})
