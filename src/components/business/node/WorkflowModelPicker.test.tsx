import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) =>
    `${namespace}.${key}`,
}))

import {
  NODE_MEDIA_KIND_IDS,
  type NodeWorkflowMediaKind,
} from '@/constants/node-types'
import {
  AI_ADAPTER_TYPES,
  getDefaultProviderConfig,
} from '@/constants/providers'
import { WorkflowModelPicker } from '@/components/business/node/WorkflowModelPicker'
import type { NodeWorkflowModelOption } from '@/types/node-workflow'

const MODEL_OPTION: NodeWorkflowModelOption = {
  optionId: 'saved:model',
  modelId: 'seedance-2.0',
  adapterType: AI_ADAPTER_TYPES.FAL,
  providerConfig: getDefaultProviderConfig(AI_ADAPTER_TYPES.FAL),
  requestCount: 3,
  sourceType: 'saved',
  apiKeyId: 'key-video',
}

function renderPicker(kind: NodeWorkflowMediaKind) {
  return render(
    <WorkflowModelPicker
      value={undefined}
      options={[MODEL_OPTION]}
      onChange={vi.fn()}
      kind={kind}
    />,
  )
}

describe('WorkflowModelPicker', () => {
  it.each([
    [NODE_MEDIA_KIND_IDS.image, 'labels.image', 'hints.image'],
    [NODE_MEDIA_KIND_IDS.video, 'labels.video', 'hints.video'],
    [NODE_MEDIA_KIND_IDS.audio, 'labels.audio', 'hints.audio'],
  ] satisfies Array<[NodeWorkflowMediaKind, string, string]>)(
    'uses %s-specific copy',
    (kind, labelKey, hintKey) => {
      renderPicker(kind)

      const trigger = screen.getByRole('button', {
        name: `StudioNode.workflowModelPicker.${labelKey}`,
      })
      fireEvent.click(trigger)

      expect(
        screen.getByText(`StudioNode.workflowModelPicker.${hintKey}`),
      ).toBeInTheDocument()
    },
  )

  it('uses an audio-specific empty state', () => {
    render(
      <WorkflowModelPicker
        value={undefined}
        options={[]}
        onChange={vi.fn()}
        kind={NODE_MEDIA_KIND_IDS.audio}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'StudioNode.workflowModelPicker.labels.audio',
      }),
    )

    expect(
      screen.getByText('StudioNode.workflowModelPicker.noOptions.audio'),
    ).toBeInTheDocument()
  })
})
