import { createRef } from 'react'
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { NODE_STUDIO_ASSISTANT_PICK_REJECT_REASON_IDS } from '@/constants/node-studio'
import { NODE_TYPE_IDS } from '@/constants/node-types'
import type { NodeAssistantMediaReference } from '@/types/node-assistant'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import {
  useCanvasAssistantPick,
  type CanvasAssistantPickApi,
} from './use-canvas-assistant-pick'

function makeNode(
  id: string,
  type: NodeWorkflowNode['type'],
  data: Record<string, unknown> = {},
): NodeWorkflowNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { prompt: '', status: 'idle', ...data },
  } as NodeWorkflowNode
}

const IMAGE = makeNode('img-1', NODE_TYPE_IDS.image, {
  imageUrl: 'https://cdn.example.com/a.png',
})
const TEXT = makeNode('text-1', NODE_TYPE_IDS.shotText, { action: '走进雨里' })
const getNodeTypeLabel = (type: string) => `type:${type}`

/** 画布上的一张卡（React Flow wrapper + 纸卡），供 arm 态高亮的命令式 DOM 找。 */
function mountCard(nodeId: string): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'react-flow__node'
  wrapper.setAttribute('data-id', nodeId)
  const card = document.createElement('div')
  card.className = 'node-card-paper'
  wrapper.appendChild(card)
  document.body.appendChild(wrapper)
  return card
}

afterEach(() => {
  document.body.replaceChildren()
})

function setup(
  overrides: Partial<Parameters<typeof useCanvasAssistantPick>[0]> = {},
) {
  const onAddReference = vi.fn()
  const onPicked = vi.fn()
  const onRejected = vi.fn()
  const apiRef = createRef<CanvasAssistantPickApi | null>() as {
    current: CanvasAssistantPickApi | null
  }
  const hook = renderHook(
    (props: {
      nodes: NodeWorkflowNode[]
      selectedReferences: NodeAssistantMediaReference[]
    }) =>
      useCanvasAssistantPick({
        nodes: props.nodes,
        getNodeTypeLabel,
        selectedReferences: props.selectedReferences,
        onAddReference,
        onPicked,
        onRejected,
        apiRef,
        ...overrides,
      }),
    {
      initialProps: {
        nodes: [IMAGE, TEXT],
        selectedReferences: [] as NodeAssistantMediaReference[],
      },
    },
  )
  return { ...hook, onAddReference, onPicked, onRejected, apiRef }
}

describe('useCanvasAssistantPick', () => {
  it('arm / exit / toggle，并把实时 API 发布到 ref', () => {
    const { result, apiRef } = setup()
    expect(result.current.armed).toBe(false)
    expect(apiRef.current?.armed).toBe(false)

    act(() => result.current.arm())
    expect(result.current.armed).toBe(true)
    expect(apiRef.current?.armed).toBe(true)

    act(() => apiRef.current?.exit())
    expect(result.current.armed).toBe(false)

    act(() => result.current.toggle())
    expect(result.current.armed).toBe(true)
  })

  it('feed 媒体节点 → onAddReference + onPicked；模式保持 armed', () => {
    const { result, onAddReference, onPicked } = setup()
    act(() => result.current.arm())
    let outcome: ReturnType<CanvasAssistantPickApi['feed']> | undefined
    act(() => {
      outcome = result.current.feed('img-1')
    })
    expect(outcome).toMatchObject({ kind: 'reference' })
    expect(onAddReference).toHaveBeenCalledWith(
      expect.objectContaining({ nodeId: 'img-1', kind: 'image' }),
    )
    expect(onPicked).toHaveBeenCalledTimes(1)
    expect(result.current.armed).toBe(true)
    expect(result.current.pickedNodeIds).toEqual([])
  })

  it('feed 非媒体节点 → 进 pickedNodeIds（去重），unpick / clear 能摘掉', () => {
    const { result, onAddReference, onRejected } = setup()
    act(() => {
      result.current.feed('text-1')
    })
    expect(result.current.pickedNodeIds).toEqual(['text-1'])
    expect(onAddReference).not.toHaveBeenCalled()

    act(() => {
      result.current.feed('text-1')
    })
    expect(result.current.pickedNodeIds).toEqual(['text-1'])
    expect(onRejected).toHaveBeenCalledWith(
      NODE_STUDIO_ASSISTANT_PICK_REJECT_REASON_IDS.alreadyPicked,
    )

    act(() => result.current.unpickNode('text-1'))
    expect(result.current.pickedNodeIds).toEqual([])

    act(() => {
      result.current.feed('text-1')
    })
    act(() => result.current.clearPicks())
    expect(result.current.pickedNodeIds).toEqual([])
  })

  it('已挂的引用再点 → rejected(alreadyPicked)，不重复 onAddReference', () => {
    const { result, rerender, onAddReference, onRejected } = setup()
    rerender({
      nodes: [IMAGE, TEXT],
      selectedReferences: [
        {
          id: 'node-reference:img-1',
          nodeId: 'img-1',
          source: 'canvas',
          kind: 'image',
          url: 'https://cdn.example.com/a.png',
          label: 'a',
        },
      ],
    })
    act(() => {
      result.current.feed('img-1')
    })
    expect(onAddReference).not.toHaveBeenCalled()
    expect(onRejected).toHaveBeenCalledWith(
      NODE_STUDIO_ASSISTANT_PICK_REJECT_REASON_IDS.alreadyPicked,
    )
  })

  it('节点从画布上删掉 → 自动从 pickedNodeIds 摘除', () => {
    const { result, rerender } = setup()
    act(() => {
      result.current.feed('text-1')
    })
    expect(result.current.pickedNodeIds).toEqual(['text-1'])
    rerender({ nodes: [IMAGE], selectedReferences: [] })
    expect(result.current.pickedNodeIds).toEqual([])
  })

  it('arm 态给可拾节点挂 target 类、已拾节点挂 included 类；exit 全部摘掉', () => {
    const imageCard = mountCard('img-1')
    const textCard = mountCard('text-1')
    const { result } = setup()

    act(() => result.current.arm())
    expect(imageCard.classList.contains('node-assistant-pick-target')).toBe(
      true,
    )
    expect(textCard.classList.contains('node-assistant-pick-target')).toBe(true)

    act(() => {
      result.current.feed('text-1')
    })
    expect(textCard.classList.contains('node-assistant-pick-included')).toBe(
      true,
    )
    expect(textCard.classList.contains('node-assistant-pick-target')).toBe(
      false,
    )

    act(() => result.current.exit())
    for (const card of [imageCard, textCard]) {
      expect(card.classList.contains('node-assistant-pick-target')).toBe(false)
      expect(card.classList.contains('node-assistant-pick-included')).toBe(
        false,
      )
    }
  })

  it('卸载时把 ref 清空', () => {
    const { unmount, apiRef } = setup()
    expect(apiRef.current).not.toBeNull()
    unmount()
    expect(apiRef.current).toBeNull()
  })
})
