import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NODE_TYPE_IDS } from '@/constants/node-types'
import type {
  NodeWorkflowNode,
  NodeWorkflowNodeData,
} from '@/types/node-workflow'

const { received } = vi.hoisted(() => ({
  received: {
    node: null as NodeWorkflowNode | null,
    layout: null as string | null,
  },
}))

// Wrap target — capture the synthesized node it receives.
vi.mock('../inspector/CharacterImageInspector', () => ({
  CharacterImageInspector: ({
    node,
    layout,
  }: {
    node: NodeWorkflowNode
    layout?: string
  }) => {
    received.node = node
    received.layout = layout ?? null
    return <div data-testid="character-inspector">{node.id}</div>
  },
}))

import { CharacterDetailBody } from './CharacterDetailBody'

describe('CharacterDetailBody', () => {
  it('mounts the inspector with a node synthesized from the body props', () => {
    const data = {
      prompt: 'a hero',
      status: 'idle',
      characterName: '林',
    } as NodeWorkflowNodeData

    render(
      <CharacterDetailBody
        nodeId="char-1"
        type={NODE_TYPE_IDS.characterImage}
        data={data}
      />,
    )

    expect(screen.getByTestId('character-inspector')).toHaveTextContent(
      'char-1',
    )
    expect(received.node).toMatchObject({
      id: 'char-1',
      type: NODE_TYPE_IDS.characterImage,
      data,
    })
    expect(received.node?.position).toEqual({ x: 0, y: 0 })
    expect(received.layout).toBe('object-studio')
  })
})
