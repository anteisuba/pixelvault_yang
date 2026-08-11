import { render } from '@testing-library/react'
import type { ComponentProps, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'

const mocks = vi.hoisted(() => ({
  updateNodeData: vi.fn(),
  updateNodeInternals: vi.fn(),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@xyflow/react', () => ({
  useEdges: () => [],
  useNodes: () => [],
  useUpdateNodeInternals: () => mocks.updateNodeInternals,
}))

vi.mock('../NodeWorkflowActionsContext', () => ({
  useNodeWorkflowActions: () => ({ updateNodeData: mocks.updateNodeData }),
}))

vi.mock('./NodeShell', () => {
  const Header = () => null
  const NodeShell = ({ children }: { children?: ReactNode }) => (
    <article>{children}</article>
  )
  NodeShell.Header = Header
  return { NodeShell }
})

import { IdentityCollectorCard } from './IdentityCollectorCard'

describe('IdentityCollectorCard', () => {
  it('renders an empty identity without reading dimensions from null natural size', () => {
    const props = {
      id: 'identity-empty',
      legacyType: NODE_TYPE_IDS.characterImage,
      data: { status: NODE_STATUS_IDS.idle },
      selected: false,
    } as ComponentProps<typeof IdentityCollectorCard>

    expect(() => render(<IdentityCollectorCard {...props} />)).not.toThrow()
  })
})
