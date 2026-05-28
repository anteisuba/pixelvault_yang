import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/business/node/CanvasPlannerRouteSelector', () => ({
  CanvasPlannerRouteSelector: ({
    onChange,
  }: {
    onChange: (selection: {
      optionId: string
      plannerProvider: 'gemini'
      apiKeyId: string
    }) => void
  }) => (
    <button
      type="button"
      onClick={() =>
        onChange({
          optionId: 'planner:key-1',
          plannerProvider: 'gemini',
          apiKeyId: 'key-1',
        })
      }
    >
      plannerRoute
    </button>
  ),
  getPlannerKeyOptionId: (keyId: string) => `planner:${keyId}`,
}))

import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { NodeWorkflowActionsProvider } from '@/components/business/node/NodeWorkflowActionsContext'
import { ComposerInspector } from '@/components/business/node/inspector/ComposerInspector'
import type { NodeWorkflowCanvasActions } from '@/components/business/node/NodeWorkflowActionsContext'
import type { NodeWorkflowNode } from '@/types/node-workflow'

const updateNodeData = vi.fn()
const sendFromComposer = vi.fn()

const ACTIONS: NodeWorkflowCanvasActions = {
  updateNodeData,
  updateScriptBreakdown: vi.fn(),
  updateSeedancePromptPlan: vi.fn(),
  spawnCharactersFromBreakdown: vi.fn(),
  spawnFullWorkflowFromAgent: vi.fn(() => ({
    createdNodeIds: [],
    shotCount: 0,
    refusal: null,
  })),
  applySeedancePromptPlanToSeedance: vi.fn(),
  deleteNode: vi.fn(),
  sendFromComposer,
  generateCharacterImage: vi.fn(),
  modelOptionsByType: {},
}

const COMPOSER_NODE: NodeWorkflowNode = {
  id: 'node-1',
  type: NODE_TYPE_IDS.composer,
  position: { x: 0, y: 0 },
  data: {
    prompt: 'old prompt',
    status: NODE_STATUS_IDS.idle,
  },
}

function renderInspector(node = COMPOSER_NODE) {
  return render(
    <NodeWorkflowActionsProvider value={ACTIONS}>
      <ComposerInspector node={node} />
    </NodeWorkflowActionsProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ComposerInspector', () => {
  it('writes prompt edits back to the node data', () => {
    renderInspector()

    fireEvent.change(screen.getByLabelText('promptLabel'), {
      target: { value: 'new idea' },
    })

    expect(updateNodeData).toHaveBeenCalledWith('node-1', {
      prompt: 'new idea',
    })
  })

  it('writes planner route changes back to the node data', () => {
    renderInspector()

    fireEvent.click(screen.getAllByText('plannerRoute')[1])

    expect(updateNodeData).toHaveBeenCalledWith('node-1', {
      plannerProvider: 'gemini',
      plannerApiKeyId: 'key-1',
      plannerRouteOptionId: 'planner:key-1',
    })
  })

  it('sends from the selected composer node', () => {
    renderInspector()

    fireEvent.click(screen.getByText('send'))

    expect(sendFromComposer).toHaveBeenCalledWith('node-1')
  })
})
