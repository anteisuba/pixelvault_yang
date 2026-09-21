import { describe, expect, it } from 'vitest'

import { ASSISTANT_OPERATOR_CANVAS_LIMITS } from '@/constants/assistant-operator'
import { getAvailableVideoModels, VIDEO_KIND } from '@/constants/models'
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
  it('视频目录的全部候选进入快照时仍满足请求契约', () => {
    const models = getAvailableVideoModels(VIDEO_KIND.GENERATE).map(
      (model) => model.id,
    )
    const snapshot = buildCanvasOperatorSnapshot({
      nodes: [
        {
          id: 'video',
          position: { x: 0, y: 0 },
          data: {
            kind: 'video',
            subtype: 'shot',
            name: '验收视频',
            label: '验收视频',
            status: 'idle',
            createdAt: '2026-09-21T00:00:00.000Z',
          },
        },
      ],
      edges: [],
      currentShotNo: null,
      availableModelsByNodeId: { video: [...models, ...models] },
    })
    const parsed = AssistantOperatorCanvasSnapshotSchema.safeParse(snapshot)
    expect(
      parsed.success,
      JSON.stringify({ count: models.length, issues: parsed.error?.issues }),
    ).toBe(true)
    const shot = snapshot.shots[0]
    expect(shot.expanded && shot.nodes[0].availableModels).toEqual(models)
  })
  it('保留节点位置，并按当前参考图顺序提供 @Image 到节点 id 的映射', () => {
    const node = imageNode('source', undefined)
    node.position = { x: 120, y: 240 }
    if (node.data.kind === 'image')
      node.data.url = 'https://example.com/hero.png'
    const snapshot = buildCanvasOperatorSnapshot({
      nodes: [node],
      edges: [],
      currentShotNo: null,
      referenceUrls: [
        'https://example.com/other.png',
        'https://example.com/hero.png',
      ],
    })
    const shot = snapshot.shots[0]
    expect(shot.expanded && shot.nodes[0]).toMatchObject({
      id: 'source',
      position: { x: 120, y: 240 },
      referenceImageIndex: 1,
    })
    expect(
      AssistantOperatorCanvasSnapshotSchema.safeParse(snapshot).success,
    ).toBe(true)
  })
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

/* ─────────────────────────────────────────────────────────────────────────
 * 剧本投影在快照里怎么看见（进度表 24）
 * ───────────────────────────────────────────────────────────────────────── */

function scriptNode(id: string, body: string): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'text',
      subtype: 'script',
      name: id,
      status: 'idle',
      createdAt: '2026-09-19T00:00:00.000Z',
      body,
    },
  } as NodeV4
}

function projectedShot(
  id: string,
  shotNo: number,
  shotKey: string,
  state: 'synced' | 'changed' | 'dropped',
): NodeV4 {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {
      kind: 'video',
      subtype: 'shot',
      name: id,
      label: id,
      status: 'idle',
      createdAt: '2026-09-19T00:00:00.000Z',
      shotNo,
      scriptShot: {
        scriptNodeId: 'sc_1',
        shotKey,
        projectedText: shotKey,
        state,
      },
    },
  } as NodeV4
}

describe('剧本投影在快照里（进度表 24）', () => {
  /**
   * ⭐ 汇总**跨折叠**统计：折叠的镜模型看不见，但「还有几面与剧本对不上」这句话
   * 它必须知道 —— 不然它会以为投影已经干净了，把重投影这一步跳过去。
   */
  it('⭐ 剧本卡带一份跨折叠的投影汇总', () => {
    const nodes = [
      scriptNode('sc_1', 'S01 甲\nS02 乙\nS03 丙'),
      projectedShot('v1', 1, 's1', 'synced'),
      projectedShot('v2', 2, 's2', 'changed'),
      // ⚠ 这一面在焦点之外（会被折叠），它的「标灰」仍要进汇总。
      projectedShot('v3', 40, 's3', 'dropped'),
    ]
    const snapshot = buildCanvasOperatorSnapshot({
      nodes,
      edges: [],
      currentShotNo: 1,
    })
    expect(AssistantOperatorCanvasSnapshotSchema.parse(snapshot)).toBeTruthy()
    const loose = snapshot.shots.find((shot) => shot.shotNo === null)
    expect(loose?.expanded).toBe(true)
    const card =
      loose?.expanded === true
        ? loose.nodes.find((node) => node.id === 'sc_1')
        : undefined
    expect(card?.scriptProjection).toEqual({
      shots: 3,
      projected: 3,
      changed: 1,
      dropped: 1,
    })
  })

  it('镜头卡带「我来自哪一段、变没变」', () => {
    const snapshot = buildCanvasOperatorSnapshot({
      nodes: [
        scriptNode('sc_1', 'S01 甲'),
        projectedShot('v1', 1, 's1', 'changed'),
      ],
      edges: [],
      currentShotNo: 1,
    })
    const shot = snapshot.shots.find((item) => item.shotNo === 1)
    const node =
      shot?.expanded === true
        ? shot.nodes.find((item) => item.id === 'v1')
        : undefined
    expect(node?.fromScript).toEqual({
      nodeId: 'sc_1',
      shotKey: 's1',
      state: 'changed',
    })
  })

  it('没有剧本关系的节点不带这两格（⛔ 不摆空对象）', () => {
    const snapshot = buildCanvasOperatorSnapshot({
      nodes: [imageNode('i_1', 1)],
      edges: [],
      currentShotNo: 1,
    })
    const shot = snapshot.shots.find((item) => item.shotNo === 1)
    const node = shot?.expanded === true ? shot.nodes[0] : undefined
    expect(node).not.toHaveProperty('scriptProjection')
    expect(node).not.toHaveProperty('fromScript')
  })
})
