import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

const { updateNodeData } = vi.hoisted(() => ({ updateNodeData: vi.fn() }))
vi.mock('../NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({ updateNodeData }),
}))

// Sentinel default data so the reset payload is assertable without pulling the
// workflow hook's deps into jsdom.
vi.mock('@/hooks/node/use-node-workflow', () => ({
  createDefaultNodeData: (type: string) => ({ seeded: type }),
}))

// NodeShell is only used by the card wrapper, not the Body under test — stub it
// so importing the module doesn't drag ReactFlow into the test.
vi.mock('./NodeShell', () => ({
  NodeShell: Object.assign(() => null, {
    Header: () => null,
    Body: () => null,
    Footer: () => null,
  }),
}))

import {
  NODE_IMAGE_ROLE_IDS,
  NODE_IMAGE_ROLE_TO_LEGACY_TYPE,
} from '@/constants/node-types'

import { ImageRolePickerBody } from './ImageRolePicker'

describe('ImageRolePickerBody', () => {
  beforeEach(() => {
    updateNodeData.mockClear()
  })

  it('stamps role + default data on a fresh (role-less) pick', () => {
    const onPicked = vi.fn()
    render(<ImageRolePickerBody nodeId="n1" onPicked={onPicked} />)

    fireEvent.click(screen.getByText(NODE_IMAGE_ROLE_IDS.character))

    expect(updateNodeData).toHaveBeenCalledWith('n1', {
      seeded: NODE_IMAGE_ROLE_TO_LEGACY_TYPE[NODE_IMAGE_ROLE_IDS.character],
      role: NODE_IMAGE_ROLE_IDS.character,
    })
    expect(onPicked).toHaveBeenCalledTimes(1)
  })

  it('offers the shot image role inside the image node picker', () => {
    render(<ImageRolePickerBody nodeId="n1" />)

    expect(screen.getByText(NODE_IMAGE_ROLE_IDS.shot)).toBeInTheDocument()
  })

  it('treats re-picking the current role as a non-destructive no-op', () => {
    const onPicked = vi.fn()
    render(
      <ImageRolePickerBody
        nodeId="n1"
        currentRole={NODE_IMAGE_ROLE_IDS.character}
        onPicked={onPicked}
      />,
    )

    // Same role as the node already has → keep the image/data, just exit.
    fireEvent.click(screen.getByText(NODE_IMAGE_ROLE_IDS.character))

    expect(updateNodeData).not.toHaveBeenCalled()
    expect(onPicked).toHaveBeenCalledTimes(1)
  })

  it('resets to the new role when re-picking a different role', () => {
    render(
      <ImageRolePickerBody
        nodeId="n1"
        currentRole={NODE_IMAGE_ROLE_IDS.character}
      />,
    )

    fireEvent.click(screen.getByText(NODE_IMAGE_ROLE_IDS.background))

    expect(updateNodeData).toHaveBeenCalledWith('n1', {
      seeded: NODE_IMAGE_ROLE_TO_LEGACY_TYPE[NODE_IMAGE_ROLE_IDS.background],
      role: NODE_IMAGE_ROLE_IDS.background,
    })
  })
})
