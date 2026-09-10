/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { NODE_SLOT_IDS, NODE_SLOT_OUTPUT_IDS } from '@/constants/node-slots'
import type {
  NodeV4,
  NodeV4Data,
  NodeWorkflowEdgeV4,
} from '@/types/node-workflow'

import { useCastIngestEngineV4 } from './use-cast-ingest-engine-v4'

const NOW = '2026-09-08T00:00:00.000Z'

function node(
  id: string,
  data: Partial<NodeV4Data> & { kind: NodeV4Data['kind'] },
): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: { name: id, status: 'idle', createdAt: NOW, ...data } as NodeV4Data,
  }
}

function edge(
  id: string,
  source: string,
  target: string,
  slot: NodeWorkflowEdgeV4['slot'],
): NodeWorkflowEdgeV4 {
  return { id, source, sourceHandle: NODE_SLOT_OUTPUT_IDS.out, target, slot }
}

const image = node('img', {
  kind: 'image',
  subtype: 'shot',
  url: 'https://cdn/a.png',
})
const shot = node('shot', { kind: 'video', subtype: 'shot', label: 'S01' })
/** 角色卡：一张图同时进得了 `reference` 与 `closeup`，两者都没有默认口。 */
const character = node('char', {
  kind: 'image',
  subtype: 'character',
  url: 'https://cdn/c.png',
})
const loose = node('ref', {
  kind: 'image',
  subtype: 'reference',
  url: 'https://cdn/r.png',
})
const merge = node('merge', { kind: 'video', subtype: 'merge' })

/** 画一张假的 RF 卡，好让引擎的 DOM 命中路径跑到底。 */
function mountCard(nodeId: string): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'react-flow__node'
  wrapper.setAttribute('data-id', nodeId)
  const card = document.createElement('div')
  card.className = 'node-card-paper'
  wrapper.appendChild(card)
  document.body.appendChild(wrapper)
  wrapper.getBoundingClientRect = () =>
    ({
      left: 100,
      top: 100,
      right: 300,
      bottom: 240,
      width: 200,
      height: 140,
    }) as DOMRect
  card.getBoundingClientRect = wrapper.getBoundingClientRect
  return card
}

function drag(
  source: NodeV4,
  engine: ReturnType<typeof useCastIngestEngineV4>,
) {
  const origin = document.createElement('div')
  origin.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: 80,
      bottom: 60,
      width: 80,
      height: 60,
    }) as DOMRect
  document.body.appendChild(origin)
  act(() => {
    engine.beginDrag({
      source: { node: source, label: source.data.name },
      pointerEvent: {
        pointerId: 1,
        clientX: 0,
        clientY: 0,
      } as unknown as React.PointerEvent<Element>,
      originElement: origin,
    })
  })
  act(() => {
    window.dispatchEvent(
      new PointerEvent('pointermove', {
        pointerId: 1,
        clientX: 200,
        clientY: 160,
      }),
    )
  })
  act(() => {
    window.dispatchEvent(
      new PointerEvent('pointerup', {
        pointerId: 1,
        clientX: 200,
        clientY: 160,
      }),
    )
  })
}

/**
 * jsdom 没有 `elementFromPoint`（未实现），所以 `vi.spyOn` 会直接抛「属性不存在」。
 * 装一个可控的替身：引擎的命中路径全靠它。
 */
function stubHitTest(el: Element | null): void {
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    writable: true,
    value: () => el,
  })
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function renderEngine(
  nodes: readonly NodeV4[],
  edges: readonly NodeWorkflowEdgeV4[] = [],
) {
  const onConnect = vi.fn()
  const view = renderHook(() =>
    useCastIngestEngineV4({
      nodes,
      edges,
      onConnect,
      translateReason: (plan) =>
        plan.kind === 'rejected' ? (plan.reason ?? 'rejected') : 'ok',
    }),
  )
  return { view, onConnect }
}

describe('useCastIngestEngineV4 · 落点三态', () => {
  it('choose：一张图对角色卡同时点亮多个口 → ⛔ 不替用户挑，交回候选', () => {
    const card = mountCard('char')
    stubHitTest(card)
    const { view, onConnect } = renderEngine([loose, character])

    drag(loose, view.result.current)

    expect(onConnect).not.toHaveBeenCalled()
    const choice = view.result.current.dragState.pendingChoice
    expect(choice?.targetNodeId).toBe('char')
    expect((choice?.candidates.length ?? 0) > 1).toBe(true)

    act(() => {
      view.result.current.resolveChoice(NODE_SLOT_IDS.closeup)
    })
    expect(onConnect).toHaveBeenCalledWith('ref', 'char', NODE_SLOT_IDS.closeup)
    expect(view.result.current.dragState.pendingChoice).toBeNull()
  })

  it('拖一张图到镜头卡 → 直接落**参考**（spec §5 · 2026-09-10 定稿），不问', () => {
    const card = mountCard('shot')
    stubHitTest(card)
    const { view, onConnect } = renderEngine([image, shot])

    drag(image, view.result.current)

    expect(onConnect).toHaveBeenCalledWith(
      'img',
      'shot',
      NODE_SLOT_IDS.reference,
    )
    expect(view.result.current.dragState.pendingChoice).toBeNull()
  })

  it('single：只有一个口收得下 → 直接落，不问', () => {
    const card = mountCard('merge')
    stubHitTest(card)
    const video = node('clip', {
      kind: 'video',
      subtype: 'clip',
      url: 'https://cdn/a.mp4',
    })
    const { view, onConnect } = renderEngine([video, merge])

    drag(video, view.result.current)

    expect(onConnect).toHaveBeenCalledWith('clip', 'merge', NODE_SLOT_IDS.clip)
    expect(view.result.current.dragState.pendingChoice).toBeNull()
  })

  it('rejected：一个口都不亮 → 不落边，理由可见', () => {
    const card = mountCard('img')
    stubHitTest(card)
    // 镜头（video.shot）拖到图片素材卡上：图片家族没有收 video 的入口。
    const { view, onConnect } = renderEngine([shot, image])

    drag(shot, view.result.current)

    expect(onConnect).not.toHaveBeenCalled()
    expect(view.result.current.dragState.pendingChoice).toBeNull()
    expect(view.result.current.dragState.reason?.text).toBeTruthy()
  })

  it('cancelChoice 作废这一投，⛔ 不落一个默认槽', () => {
    const card = mountCard('char')
    stubHitTest(card)
    const { view, onConnect } = renderEngine([loose, character])

    drag(loose, view.result.current)
    expect(view.result.current.dragState.pendingChoice).not.toBeNull()

    act(() => {
      view.result.current.cancelChoice()
    })
    expect(view.result.current.dragState.pendingChoice).toBeNull()
    expect(onConnect).not.toHaveBeenCalled()
  })

  it('落在空白处：安静退回，不发边也不报理由', () => {
    stubHitTest(null)
    const { view, onConnect } = renderEngine([image, shot])

    drag(image, view.result.current)

    expect(onConnect).not.toHaveBeenCalled()
    expect(view.result.current.dragState.reason).toBeNull()
    expect(view.result.current.dragState.pendingChoice).toBeNull()
  })

  it('候选之外的槽点不动（引擎自己复核一次）', () => {
    const card = mountCard('char')
    stubHitTest(card)
    const { view, onConnect } = renderEngine(
      [loose, character],
      [edge('e1', 'ref', 'char', NODE_SLOT_IDS.reference)],
    )

    drag(loose, view.result.current)
    act(() => {
      view.result.current.resolveChoice(NODE_SLOT_IDS.clip)
    })
    expect(onConnect).not.toHaveBeenCalled()
  })
})
