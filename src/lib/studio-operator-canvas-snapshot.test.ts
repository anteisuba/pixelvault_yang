import { describe, expect, it } from 'vitest'

import { ASSISTANT_OPERATOR_CANVAS_LIMITS } from '@/constants/assistant-operator'
import { buildCanvasOperatorSnapshot } from '@/lib/studio-operator-canvas-snapshot'
import { AssistantOperatorCanvasSnapshotSchema } from '@/types/assistant-operator'
import type { NodeV4, NodeWorkflowEdgeV4 } from '@/types/node-workflow'

function imageNode(id: string, shotNo: number | undefined): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'image',
      subtype: 'shot',
      name: id,
      status: 'idle',
      createdAt: '2026-09-19T00:00:00.000Z',
      ...(shotNo === undefined ? {} : { shotNo }),
    },
  } as NodeV4
}

function edge(id: string, source: string, target: string): NodeWorkflowEdgeV4 {
  return {
    id,
    source,
    sourceHandle: 'out',
    target,
    slot: 'reference',
  } as NodeWorkflowEdgeV4
}

describe('buildCanvasOperatorSnapshot', () => {
  /**
   * ⭐ 分层是这份快照**存在的理由**（进度表 22）：焦点那面镜与左右各一完整，
   * 其余每面一行。断不出这一条的话，一张六十镜的画布会把整轮步数烧在读上下文上。
   */
  it('⭐ 焦点镜与左右各一展开，其余每面只出一行标题', () => {
    const nodes = [1, 2, 3, 4, 5].map((shotNo) =>
      imageNode(`node-${shotNo}`, shotNo),
    )
    const snapshot = buildCanvasOperatorSnapshot({
      nodes,
      edges: [],
      currentShotNo: 3,
    })

    expect(snapshot.shots.map((shot) => [shot.shotNo, shot.expanded])).toEqual([
      [1, false],
      [2, true],
      [3, true],
      [4, true],
      [5, false],
    ])
    // 折叠的那两面只有节点数，⛔ 没有节点表。
    const collapsed = snapshot.shots.find((shot) => shot.shotNo === 1)
    expect(collapsed).toEqual({
      expanded: false,
      shotNo: 1,
      title: 'S1',
      nodeCount: 1,
    })
    expect(
      AssistantOperatorCanvasSnapshotSchema.safeParse(snapshot).success,
    ).toBe(true)
  })

  /**
   * ⚠ 焦点缺席时展开**最前面**三面 —— 一张刚打开的画布上用户还没点任何东西，
   * 「一面都看不见」会让第一句话必然是一次白问。
   */
  it('没有焦点时展开最前面三面，⛔ 不是一面都不展开', () => {
    const snapshot = buildCanvasOperatorSnapshot({
      nodes: [1, 2, 3, 4].map((shotNo) => imageNode(`node-${shotNo}`, shotNo)),
      edges: [],
      currentShotNo: null,
    })
    expect(
      snapshot.shots.filter((shot) => shot.expanded).map((s) => s.shotNo),
    ).toEqual([1, 2, 3])
  })

  /** ⚠ 散节点永远展开：用户提到它们时用的是名字，折叠掉就指认不了。 */
  it('未归镜的散节点排在最后且永远展开', () => {
    const snapshot = buildCanvasOperatorSnapshot({
      nodes: [
        imageNode('shot-1', 1),
        imageNode('shot-2', 2),
        imageNode('shot-3', 3),
        imageNode('shot-4', 4),
        imageNode('loose', undefined),
      ],
      edges: [],
      currentShotNo: 1,
    })
    const last = snapshot.shots.at(-1)
    expect(last?.shotNo).toBeNull()
    expect(last?.expanded).toBe(true)
    expect(last?.expanded === true ? last.nodes.map((n) => n.id) : []).toEqual([
      'loose',
    ])
  })

  /**
   * ⚠ 展开的节点带**槽与来源**：模型要能说出「第二镜的参考位接的是第一镜」，
   * 那句话的全部依据就是这一格。
   */
  it('展开的节点带上接进来的槽与来源节点', () => {
    const snapshot = buildCanvasOperatorSnapshot({
      nodes: [imageNode('a', 1), imageNode('b', 1)],
      edges: [edge('e1', 'a', 'b')],
      currentShotNo: 1,
      availableModelsByNodeId: { b: ['seedream-4'] },
    })
    const shot = snapshot.shots[0]
    expect(shot.expanded).toBe(true)
    if (!shot.expanded) throw new Error('expected an expanded shot')
    const b = shot.nodes.find((node) => node.id === 'b')
    expect(b?.inputs).toEqual([{ slot: 'reference', from: 'a' }])
    expect(b?.availableModels).toEqual(['seedream-4'])
    // ⛔ 快照里没有 URL —— 画布的 op 一律认节点 id（见文件头注）。
    expect(Object.keys(b ?? {})).not.toContain('url')
  })

  /** ⚠ 上限守的是步数预算，不是内存：越界就截断，⛔ 不整条拒。 */
  it('镜数与每镜节点数都封顶', () => {
    const many = ASSISTANT_OPERATOR_CANVAS_LIMITS.maxNodesPerShot + 5
    const snapshot = buildCanvasOperatorSnapshot({
      nodes: Array.from({ length: many }, (_, index) =>
        imageNode(`node-${index}`, 1),
      ),
      edges: [],
      currentShotNo: 1,
    })
    const shot = snapshot.shots[0]
    if (!shot.expanded) throw new Error('expected an expanded shot')
    expect(shot.nodes).toHaveLength(
      ASSISTANT_OPERATOR_CANVAS_LIMITS.maxNodesPerShot,
    )
    expect(
      AssistantOperatorCanvasSnapshotSchema.safeParse(snapshot).success,
    ).toBe(true)
  })
})
