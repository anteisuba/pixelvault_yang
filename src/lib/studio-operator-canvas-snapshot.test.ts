import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ASSISTANT_OPERATOR_CANVAS_LIMITS,
  ASSISTANT_OPERATOR_LIMITS,
} from '@/constants/assistant-operator'
import {
  AI_MODELS,
  getAvailableVideoModels,
  VIDEO_KIND,
} from '@/constants/models'
import { NODE_V4_PROMPT_MAX_LENGTH } from '@/constants/node-studio'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import { planV4Generation } from '@/hooks/node/use-node-media-generation-v4'
import {
  buildCanvasGenerationRequest,
  buildCanvasOperatorSnapshot,
  readCanvasNodeGenerationState,
} from '@/lib/studio-operator-canvas-snapshot'
import {
  AssistantOperatorCanvasNodeSchema,
  AssistantOperatorCanvasSnapshotSchema,
  type AssistantOperatorCanvasSnapshot,
} from '@/types/assistant-operator'
import type {
  NodeV4,
  NodeV4ImageData,
  NodeWorkflowEdgeV4,
} from '@/types/node-workflow'

function imageNode(
  id: string,
  shotNo: number | undefined,
  data: Partial<NodeV4ImageData> = {},
): NodeV4 {
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
      ...data,
    },
  } as NodeV4
}

function snapshotNode(snapshot: AssistantOperatorCanvasSnapshot, id: string) {
  return snapshot.shots
    .flatMap((shot) => (shot.expanded ? shot.nodes : []))
    .find((node) => node.id === id)
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
  it('图片参数与当前模型的可选档位进入助手快照，不带渠道私有配置', () => {
    const node = imageNode('portrait', undefined, {
      model: {
        optionId: 'saved:openai',
        modelId: AI_MODELS.OPENAI_GPT_IMAGE_25_SUNBURST,
        adapterType: AI_ADAPTER_TYPES.OPENAI,
        providerConfig: {
          label: 'Private route',
          baseUrl: 'https://private.example',
        },
        apiKeyId: 'private-key-id',
      },
      params: {
        aspectRatio: '3:4',
        quality: 'high',
        resolution: '2K',
        count: 2,
      },
    })
    const snapshot = buildCanvasOperatorSnapshot({
      nodes: [node],
      edges: [],
      currentShotNo: null,
    })
    const value = snapshotNode(snapshot, node.id)!
    expect(value.parameters).toMatchObject({
      values: {
        aspectRatio: '3:4',
        quality: 'high',
        resolution: '2K',
        count: 2,
      },
      options: { quality: ['auto', 'low', 'medium', 'high', 'xhigh', 'max'] },
    })
    expect(value.parameters?.options.aspectRatio).toContain('3:4')
    expect(
      AssistantOperatorCanvasSnapshotSchema.safeParse(snapshot).success,
    ).toBe(true)
    expect(JSON.stringify(snapshot)).not.toContain('private')
    expect(buildCanvasGenerationRequest(value)).toMatchObject({
      count: 2,
      specs: { aspectRatio: '3:4', quality: 'high', resolution: '2K' },
      canvasNode: { id: node.id },
    })
  })

  it('未设置的图片参数只补发送口已有的默认值，不猜画质与分辨率', () => {
    const node = imageNode('portrait', undefined)
    const state = readCanvasNodeGenerationState(node)
    expect(state.parameters?.values).toEqual({ aspectRatio: '1:1', count: 1 })
    expect(state.parameters?.options.quality).toEqual([])
    expect(buildCanvasGenerationRequest(state)).toBeNull()
    expect(
      readCanvasNodeGenerationState(
        imageNode('grid', undefined, {
          params: { count: 4, storyboardGrid: true },
        }),
      ).parameters?.values.count,
    ).toBe(1)
  })

  it('换模型遗留的视频参数按实际发送值进入确认卡，节点原值不变', () => {
    const params = {
      aspectRatio: '21:9',
      resolution: '4k',
      duration: '3',
      seed: 0,
      generateAudio: false,
    }
    const originalParams = { ...params }
    const node: NodeV4 = {
      id: 'video',
      position: { x: 0, y: 0 },
      data: {
        kind: 'video',
        subtype: 'shot',
        name: '换模型后的镜头',
        label: '换模型后的镜头',
        status: 'idle',
        createdAt: '2026-09-30T00:00:00Z',
        model: {
          modelId: AI_MODELS.MINIMAX_H3_MAX_TURBO,
          optionId: 'workspace:minimax',
          adapterType: AI_ADAPTER_TYPES.FAL,
          providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
        },
        params,
      },
    }
    const plan = planV4Generation(node.id, { nodes: [node], edges: [] })!
    expect(plan).toMatchObject({
      aspectRatio: '16:9',
      resolution: '1080p',
      duration: 5,
    })
    const snapshot = buildCanvasOperatorSnapshot({
      nodes: [node],
      edges: [],
      currentShotNo: null,
    })
    const state = snapshotNode(snapshot, node.id)!
    expect(state.parameters?.values).toEqual({
      ...params,
      aspectRatio: plan.aspectRatio,
      resolution: plan.resolution,
      duration: String(plan.duration),
    })
    expect(buildCanvasGenerationRequest(state)?.specs).toEqual({
      aspectRatio: plan.aspectRatio,
      resolution: plan.resolution,
      durationSeconds: plan.duration,
    })
    expect(readCanvasNodeGenerationState(node).parameters).toEqual(
      state.parameters,
    )
    expect(node.data.kind === 'video' && node.data.params).toEqual(
      originalParams,
    )
  })

  it('实际视频目录的参数选项全部满足画布快照契约', () => {
    for (const model of getAvailableVideoModels(VIDEO_KIND.GENERATE)) {
      const node: NodeV4 = {
        id: model.id,
        position: { x: 0, y: 0 },
        data: {
          kind: 'video',
          subtype: 'shot',
          name: model.id,
          label: model.id,
          status: 'idle',
          createdAt: '2026-09-30T00:00:00Z',
          model: {
            modelId: model.id,
            optionId: `workspace:${model.id}`,
            adapterType: model.adapterType,
            providerConfig: model.providerConfig,
          },
        },
      }
      const snapshot = buildCanvasOperatorSnapshot({
        nodes: [node],
        edges: [],
        currentShotNo: null,
      })
      const result = AssistantOperatorCanvasSnapshotSchema.safeParse(snapshot)
      expect(snapshotNode(snapshot, node.id)?.parameters?.values).toEqual({})
      expect(
        result.success,
        `${model.id}: ${result.success ? '' : result.error.message}`,
      ).toBe(true)
    }
  })
  it('画布已有 24 个散节点时，新建节点的真实 id 和模型仍进入下一轮快照', () => {
    const nodes = Array.from({ length: 24 }, (_, index) =>
      imageNode(`existing-${index}`, undefined),
    )
    const created = imageNode('created-real-id', undefined, {
      name: '正面全身立绘',
    })
    const snapshot = buildCanvasOperatorSnapshot({
      nodes: [...nodes, created],
      edges: [],
      currentShotNo: null,
      selectedNodeIds: ['existing-23'],
      availableModelsByNodeId: {
        'created-real-id': ['gpt-image-2.5-sunburst'],
      },
    })

    expect(snapshotNode(snapshot, 'created-real-id')).toMatchObject({
      id: 'created-real-id',
      name: '正面全身立绘',
      availableModels: ['gpt-image-2.5-sunburst'],
    })
    expect(snapshotNode(snapshot, 'existing-23')).toBeDefined()
    const shot = snapshot.shots[0]
    expect(shot.expanded && shot.nodes).toHaveLength(25)
    expect(
      AssistantOperatorCanvasSnapshotSchema.safeParse(snapshot).success,
    ).toBe(true)
  })

  it('截取快照时优先保留选中节点、新节点及其实际输入，余量取最近节点', () => {
    const nodes = Array.from({ length: 60 }, (_, index) =>
      imageNode(`node-${index}`, undefined),
    )
    const snapshot = buildCanvasOperatorSnapshot({
      nodes,
      edges: [
        edge('selected-ref', 'node-1', 'node-0'),
        edge('new-ref', 'node-2', 'node-59'),
      ],
      currentShotNo: null,
      selectedNodeIds: ['node-0'],
    })

    for (const id of ['node-0', 'node-1', 'node-2', 'node-58', 'node-59']) {
      expect(snapshotNode(snapshot, id), id).toBeDefined()
    }
    expect(snapshotNode(snapshot, 'node-3')).toBeUndefined()
    expect(snapshotNode(snapshot, 'node-59')?.inputs).toEqual([
      { slot: 'reference', from: 'node-2', edgeId: 'new-ref' },
    ])
    const shot = snapshot.shots[0]
    expect(shot.expanded && shot.nodes).toHaveLength(40)
  })

  it('卡停在失败态时带上失败原因；重新生成后不再带', () => {
    const failure = {
      errorCode: 'content_filtered',
      error: `Your request was rejected by the safety system. ${'x'.repeat(400)}`,
    }
    const snapshot = buildCanvasOperatorSnapshot({
      nodes: [
        imageNode('failed', undefined, {
          status: 'failed',
          generationFailure: failure,
        }),
        imageNode('retrying', undefined, {
          status: 'running',
          generationFailure: failure,
        }),
      ],
      edges: [],
      currentShotNo: null,
      selectedNodeIds: [],
    })

    expect(snapshotNode(snapshot, 'failed')?.lastFailure).toEqual({
      code: 'content_filtered',
      message: failure.error.slice(
        0,
        ASSISTANT_OPERATOR_CANVAS_LIMITS.failureMessageChars,
      ),
    })
    expect(snapshotNode(snapshot, 'retrying')?.lastFailure).toBeUndefined()
    expect(
      AssistantOperatorCanvasSnapshotSchema.safeParse(snapshot).success,
    ).toBe(true)
  })

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
  /** 镜头里的卡超过 `expandAllShotsUpToNodes` 时才按焦点折叠 —— 用填充卡撑过阈值。 */
  const fillers = (shotNo: number, count: number) =>
    Array.from({ length: count }, (_, index) =>
      imageNode(`filler-${shotNo}-${index}`, shotNo),
    )

  it('镜头里的卡不多时每一面都展开（十镜剧本逐镜改词要看得见每张卡）', () => {
    const snapshot = buildCanvasOperatorSnapshot({
      nodes: Array.from({ length: 10 }, (_, index) =>
        imageNode(`node-${index + 1}`, index + 1),
      ),
      edges: [],
      currentShotNo: null,
    })
    expect(snapshot.shots.every((shot) => shot.expanded)).toBe(true)
  })

  it('⭐ 焦点镜与左右各一展开，其余每面只出一行标题', () => {
    const nodes = [1, 2, 3, 4, 5].flatMap((shotNo) => [
      imageNode(`node-${shotNo}`, shotNo),
      ...fillers(shotNo, 12),
    ])
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
      nodeCount: 13,
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
      nodes: [1, 2, 3, 4].flatMap((shotNo) => [
        imageNode(`node-${shotNo}`, shotNo),
        ...fillers(shotNo, 16),
      ]),
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
    expect(b?.inputs).toEqual([{ slot: 'reference', from: 'a', edgeId: 'e1' }])
    expect(b?.availableModels).toEqual(['seedream-4'])
    // 产出地址不暴露给 op；referenceUrls 只承载实际参考输入。
    expect(Object.keys(b ?? {})).not.toContain('url')
  })

  it('图片复核参考按实际槽版本顺序，排除停用来源并去重，不混入助手附件', () => {
    const sources = [
      imageNode('a', 1, { url: 'https://example.com/a.png' }),
      imageNode('b', 1, { url: 'https://example.com/b.png' }),
      imageNode('duplicate', 1, { url: 'https://example.com/a.png' }),
      imageNode('disabled-version', 1, {
        url: 'https://example.com/disabled-version.png',
      }),
      imageNode('blocked-node', 1, {
        url: 'https://example.com/blocked-node.png',
        blocked: true,
      }),
    ]
    const target = imageNode('target', 1, {
      slots: {
        reference: {
          slot: 'reference',
          cur: 'v1',
          versions: [
            'b',
            'a',
            'disabled-version',
            'blocked-node',
            'duplicate',
          ].map((sourceNodeId, index) => ({
            id: `v${index}`,
            edgeId: `e-${sourceNodeId}`,
            sourceNodeId,
            addedAt: '2026-09-19T00:00:00.000Z',
            blocked: sourceNodeId === 'disabled-version',
          })),
        },
      },
    })
    const emptyTarget = imageNode('empty', 1, {
      slots: { reference: { slot: 'reference', cur: null, versions: [] } },
    })
    const snapshot = buildCanvasOperatorSnapshot({
      nodes: [...sources, target, emptyTarget],
      edges: [
        ...sources.map((source) => edge(`e-${source.id}`, source.id, 'target')),
        edge('stale', 'a', 'empty'),
      ],
      currentShotNo: 1,
      referenceUrls: ['https://example.com/unrelated-attachment.png'],
    })
    expect(snapshotNode(snapshot, 'target')).toMatchObject({
      referenceUrls: ['https://example.com/b.png', 'https://example.com/a.png'],
      reviewContextComplete: true,
    })
    expect(snapshotNode(snapshot, 'empty')).toMatchObject({
      referenceUrls: [],
      referencePromptContext: '',
      reviewContextComplete: true,
    })
    expect(
      AssistantOperatorCanvasSnapshotSchema.safeParse(snapshot).success,
    ).toBe(true)
  })

  it('跨折叠镜读取角色卡与未停用特写，保持真实输入顺序', () => {
    const snapshot = buildCanvasOperatorSnapshot({
      nodes: [
        imageNode('character', 1, {
          subtype: 'character',
          url: 'https://example.com/character.png',
        }),
        imageNode('face', 1, { url: 'https://example.com/face.png' }),
        imageNode('blocked-face', 1, {
          url: 'https://example.com/blocked-face.png',
          blocked: true,
        }),
        imageNode('shot-2', 2),
        ...fillers(2, 60),
        imageNode('shot-3', 3),
        imageNode('target', 4),
        imageNode('shot-5', 5),
      ],
      edges: [
        edge('main', 'character', 'target'),
        { ...edge('closeup', 'face', 'character'), slot: 'closeup' },
        { ...edge('blocked', 'blocked-face', 'character'), slot: 'closeup' },
      ],
      currentShotNo: 4,
    })
    expect(snapshot.shots.find((shot) => shot.shotNo === 1)?.expanded).toBe(
      false,
    )
    expect(snapshotNode(snapshot, 'target')).toMatchObject({
      referenceUrls: [
        'https://example.com/character.png',
        'https://example.com/face.png',
      ],
      reviewContextComplete: true,
    })
    expect(snapshotNode(snapshot, 'target')?.referencePromptContext).toContain(
      'Image 1 = "character"\nImage 2 = "face"',
    )
  })

  it('图片提示词保留全文，复核上下文读取上游全文，文本节点也给全文', () => {
    const ownPrompt = `  ${'原始提示词'.repeat(3000)}\n不要改动脸  `
    const upstream = `${'上游内容'.repeat(200)}\n腿部尚未认可`
    const snapshot = buildCanvasOperatorSnapshot({
      nodes: [
        scriptNode('script', upstream),
        imageNode('target', undefined, { prompt: ownPrompt }),
      ],
      edges: [{ ...edge('text-input', 'script', 'target'), slot: 'text' }],
      currentShotNo: null,
    })
    expect(snapshotNode(snapshot, 'target')).toMatchObject({
      text: ownPrompt,
      referenceUrls: [],
      referencePromptContext: upstream,
      reviewContextComplete: true,
    })
    expect(snapshotNode(snapshot, 'script')?.text).toBe(upstream)
    expect(snapshotNode(snapshot, 'script')).not.toHaveProperty('referenceUrls')
    expect(snapshotNode(snapshot, 'script')).not.toHaveProperty(
      'reviewContextComplete',
    )
    expect(
      AssistantOperatorCanvasSnapshotSchema.safeParse(snapshot).success,
    ).toBe(true)
  })

  it('⭐ 文本节点不论选没选中都给全文；只有超过节点上限才标明读不全', () => {
    const long = `${'第一幕铺垫。'.repeat(120)}\n结尾：列车进站`
    const huge = '长'.repeat(NODE_V4_PROMPT_MAX_LENGTH + 5)
    const nodes = [
      scriptNode('selected', long),
      scriptNode('mentioned', long),
      scriptNode('other', long),
      scriptNode('huge', huge),
    ]
    const snapshot = buildCanvasOperatorSnapshot({
      nodes,
      edges: [],
      currentShotNo: null,
      selectedNodeIds: ['selected'],
      mentionedNodeIds: ['mentioned'],
    })
    expect(snapshotNode(snapshot, 'selected')).toMatchObject({ text: long })
    expect(snapshotNode(snapshot, 'selected')).not.toHaveProperty(
      'textTruncated',
    )
    expect(snapshotNode(snapshot, 'mentioned')?.text).toBe(long)
    expect(snapshotNode(snapshot, 'other')?.text).toBe(long)
    expect(snapshotNode(snapshot, 'other')).not.toHaveProperty('textTruncated')
    expect(snapshotNode(snapshot, 'huge')).toMatchObject({
      textTruncated: true,
    })
    expect(snapshotNode(snapshot, 'huge')?.text).toHaveLength(
      NODE_V4_PROMPT_MAX_LENGTH,
    )
    expect(
      AssistantOperatorCanvasSnapshotSchema.safeParse(snapshot).success,
    ).toBe(true)
  })

  it('上游文字超出复核容量时明确不完整，不截断为已检查全文', () => {
    const snapshot = buildCanvasOperatorSnapshot({
      nodes: [
        scriptNode(
          'script',
          '长'.repeat(ASSISTANT_OPERATOR_LIMITS.maxMessageChars + 1),
        ),
        imageNode('target', undefined),
      ],
      edges: [{ ...edge('text-input', 'script', 'target'), slot: 'text' }],
      currentShotNo: null,
    })
    expect(snapshotNode(snapshot, 'target')).toMatchObject({
      referenceUrls: [],
      reviewContextComplete: false,
    })
    expect(snapshotNode(snapshot, 'target')).not.toHaveProperty(
      'referencePromptContext',
    )
    expect(
      AssistantOperatorCanvasSnapshotSchema.safeParse(snapshot).success,
    ).toBe(true)
  })

  it.each(['too-many', 'invalid-url'])(
    '参考超限或 URL 无效时不以部分列表冒充完整：%s',
    (issue) => {
      const sources =
        issue === 'too-many'
          ? Array.from(
              { length: ASSISTANT_OPERATOR_LIMITS.maxSnapshotReferences + 1 },
              (_, index) =>
                imageNode(`source-${index}`, 1, {
                  url: `https://example.com/${index}.png`,
                }),
            )
          : [imageNode('source', 1, { url: 'invalid-url' })]
      const snapshot = buildCanvasOperatorSnapshot({
        nodes: [...sources, imageNode('target', 1)],
        edges: sources.map((source) =>
          edge(`e-${source.id}`, source.id, 'target'),
        ),
        currentShotNo: 1,
      })
      expect(snapshotNode(snapshot, 'target')?.reviewContextComplete).toBe(
        false,
      )
      expect(snapshotNode(snapshot, 'target')).not.toHaveProperty(
        'referenceUrls',
      )
      expect(
        AssistantOperatorCanvasSnapshotSchema.safeParse(snapshot).success,
      ).toBe(true)
    },
  )

  it('只读图片叶子不编译生成输入，旧快照缺字段仍表示未核对', () => {
    const snapshot = buildCanvasOperatorSnapshot({
      nodes: [
        imageNode('leaf', undefined, {
          subtype: 'reference',
          url: 'https://example.com/leaf.png',
        }),
      ],
      edges: [],
      currentShotNo: null,
    })
    expect(snapshotNode(snapshot, 'leaf')).toMatchObject({
      referenceUrls: [],
      referencePromptContext: '',
      reviewContextComplete: true,
    })
    const legacy = AssistantOperatorCanvasNodeSchema.parse({
      id: 'legacy',
      name: 'legacy',
      kind: 'image',
      subtype: 'shot',
    })
    expect(legacy.referenceUrls).toBeUndefined()
    expect(legacy.reviewContextComplete).toBeUndefined()
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
      titles: ['甲', '乙', '丙'],
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

describe('剪辑台那一块（v2 第 2 片）', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  function videoNode(id: string, durationSec: number): NodeV4 {
    return {
      id,
      position: { x: 0, y: 0 },
      data: {
        kind: 'video',
        subtype: 'shot',
        name: id,
        status: 'idle',
        createdAt: '2026-10-07T00:00:00.000Z',
        url: `https://cdn.test.com/${id}.mp4`,
        durationSec,
      },
    } as NodeV4
  }

  it('carries the timeline and the cards that can go on it, and passes the request schema', () => {
    const nodes = [videoNode('v1', 4), videoNode('v2', 3), imageNode('i1', 1)]
    const snapshot = buildCanvasOperatorSnapshot({
      nodes,
      edges: [],
      currentShotNo: null,
      edit: {
        name: '成片',
        tracks: {
          video: [
            {
              id: 'c1',
              sourceNodeId: 'v1',
              in: 0,
              out: 4,
              speed: 1,
              muted: false,
            },
          ],
          audio: [],
          music: [],
          text: [],
        },
        settings: { aspect: '16:9', resolution: '1080p' },
      },
    })

    expect(
      snapshot.editDesk?.timeline?.clips.map((clip) => clip.clipId),
    ).toEqual(['c1'])
    // 只有带产物的视频 / 音频剪得进去，图片卡不在里面。
    expect(snapshot.editDesk?.assets).toEqual([
      {
        nodeId: 'v1',
        name: 'v1',
        kind: 'video',
        track: 'video',
        durationSec: 4,
      },
      {
        nodeId: 'v2',
        name: 'v2',
        kind: 'video',
        track: 'video',
        durationSec: 3,
      },
    ])
    expect(
      AssistantOperatorCanvasSnapshotSchema.safeParse(snapshot).success,
    ).toBe(true)
  })

  it('says the timeline is missing when there are cards but no cut yet', () => {
    const snapshot = buildCanvasOperatorSnapshot({
      nodes: [videoNode('v1', 4)],
      edges: [],
      currentShotNo: null,
    })
    expect(snapshot.editDesk?.timeline).toBeNull()
    expect(snapshot.editDesk?.assets).toHaveLength(1)
  })

  it('carries the address of each video it can take frames from, and only those (2b)', () => {
    vi.stubEnv('NEXT_PUBLIC_STORAGE_BASE_URL', 'https://cdn.test.com')
    const offCdn = videoNode('v3', 2)
    const snapshot = buildCanvasOperatorSnapshot({
      nodes: [
        videoNode('v1', 4),
        {
          ...offCdn,
          data: { ...offCdn.data, url: 'https://fal.media/v3.mp4' },
        },
      ] as NodeV4[],
      edges: [],
      currentShotNo: null,
    })
    expect(snapshot.editDesk?.videoUrls).toEqual([
      { nodeId: 'v1', url: 'https://cdn.test.com/v1.mp4' },
    ])
    expect(
      AssistantOperatorCanvasSnapshotSchema.safeParse(snapshot).success,
    ).toBe(true)
  })

  it('adds the take a clip still uses when it is not the card current one (4a)', () => {
    vi.stubEnv('NEXT_PUBLIC_STORAGE_BASE_URL', 'https://cdn.test.com')
    const base = videoNode('v1', 4)
    const v1 = {
      ...base,
      data: {
        ...base.data,
        url: 'https://cdn.test.com/new.mp4',
        outputs: {
          versions: [
            {
              id: 'ver1',
              url: 'https://cdn.test.com/old.mp4',
              createdAt: '2026-10-07T00:00:00.000Z',
            },
            {
              id: 'ver2',
              url: 'https://cdn.test.com/new.mp4',
              createdAt: '2026-10-07T00:00:00.000Z',
            },
          ],
          cur: 1,
        },
      },
    } as NodeV4
    const snapshot = buildCanvasOperatorSnapshot({
      nodes: [v1],
      edges: [],
      currentShotNo: null,
      edit: {
        name: '成片',
        tracks: {
          video: [
            {
              id: 'old',
              sourceNodeId: 'v1',
              sourceVersionId: 'ver1',
              in: 0,
              out: 4,
              speed: 1,
              muted: false,
            },
            {
              id: 'new',
              sourceNodeId: 'v1',
              sourceVersionId: 'ver2',
              in: 0,
              out: 4,
              speed: 1,
              muted: false,
            },
          ],
          audio: [],
          music: [],
          text: [],
        },
        settings: { aspect: '16:9', resolution: '1080p' },
      },
    })
    expect(snapshot.editDesk?.videoUrls).toEqual([
      { nodeId: 'v1', url: 'https://cdn.test.com/new.mp4' },
      { nodeId: 'v1', clipId: 'old', url: 'https://cdn.test.com/old.mp4' },
    ])
    expect(
      AssistantOperatorCanvasSnapshotSchema.safeParse(snapshot).success,
    ).toBe(true)
  })

  it('leaves the block out when nothing can be cut', () => {
    const snapshot = buildCanvasOperatorSnapshot({
      nodes: [imageNode('i1', 1)],
      edges: [],
      currentShotNo: null,
    })
    expect(snapshot).not.toHaveProperty('editDesk')
  })
})
