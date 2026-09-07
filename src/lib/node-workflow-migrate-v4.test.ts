import { describe, expect, it } from 'vitest'

import {
  NODE_IMAGE_ROLE_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
  NODE_TYPES,
} from '@/constants/node-types'
import { NodeWorkflowStateV4Schema } from '@/types/node-workflow'

import {
  buildV3BackupKey,
  migrateNodeWorkflowStateToV4,
  resolveV4Identity,
  type V3State,
} from '@/lib/node-workflow-migrate-v4'

const NOW = '2026-09-06T00:00:00.000Z'

/**
 * v3 夹具。形状与 `src/lib/node-workflow-migrate-image-roles.test.ts` /
 * `-planner.test.ts` 的 `makeNode` 同源（`{ id, type, position, data }`），并且
 * 故意把 12 个 legacy type **全**摆进来——迁移的账目要能对到每一种。
 */
function node(
  id: string,
  type: string,
  data: Record<string, unknown> = {},
): V3State['nodes'] extends (infer T)[] ? T : never {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { prompt: '', status: NODE_STATUS_IDS.idle, ...data },
  } as never
}

function edge(id: string, source: string, target: string) {
  return { id, source, target }
}

function fullFixture(): V3State {
  return {
    scriptDoc: {
      shots: [{ id: 'shot_a' }, { id: 'shot_b' }],
    },
    nodes: [
      node('n_composer', NODE_TYPE_IDS.composer),
      node('n_agent', NODE_TYPE_IDS.agent),
      node('n_text', NODE_TYPE_IDS.shotText, {
        prompt: '控制室广角，雨夜',
        scriptRef: { kind: 'shotText', sourceId: 'shot_a' },
      }),
      node('n_script', NODE_TYPE_IDS.shotText, { prompt: '全片剧本' }),
      node('n_shot', NODE_TYPE_IDS.shot, { mediaUrl: 'https://x/1.png' }),
      node('n_char', NODE_TYPE_IDS.characterImage, {
        characterName: '西格莉卡',
      }),
      node('n_bg', NODE_TYPE_IDS.backgroundImage),
      node('n_frame', NODE_TYPE_IDS.frameImage, {
        mediaUrl: 'https://x/2.png',
      }),
      node('n_img_shot', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.shot,
      }),
      node('n_img_frame', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.frame,
      }),
      node('n_img_closeup', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.closeup,
      }),
      node('n_img_loose', NODE_TYPE_IDS.image),
      node('n_voice', NODE_TYPE_IDS.voice, {
        voiceSampleUrl: 'https://x/a.mp3',
        audioOwnerName: '西格莉卡',
      }),
      node('n_video', NODE_TYPE_IDS.seedance, {
        scriptRef: { kind: 'seedance', sourceId: 'shot_a' },
        duration: '7',
        aspectRatio: '16:9',
      }),
      node('n_video_b', NODE_TYPE_IDS.seedance, {
        scriptRef: { kind: 'seedance', sourceId: 'shot_b' },
      }),
      node('n_clip', NODE_TYPE_IDS.videoReference),
      node('n_merge', NODE_TYPE_IDS.videoMerge),
    ],
    edges: [
      edge('e_text', 'n_text', 'n_video'),
      edge('e_frame', 'n_frame', 'n_video'),
      edge('e_imgframe', 'n_img_frame', 'n_video_b'),
      edge('e_voice', 'n_voice', 'n_video'),
      edge('e_clipref', 'n_clip', 'n_video'),
      edge('e_charref', 'n_char', 'n_shot'),
      edge('e_closeup', 'n_img_closeup', 'n_char'),
      edge('e_merge_a', 'n_video', 'n_merge'),
      edge('e_merge_b', 'n_video_b', 'n_merge'),
      // 两端里有一端是被剥除的退役 planner —— 这条边必须被丢弃并计数。
      edge('e_dangling', 'n_composer', 'n_video'),
    ],
  }
}

describe('migrateNodeWorkflowStateToV4', () => {
  it('迁移结果能被 v4 schema parse', () => {
    const { state } = migrateNodeWorkflowStateToV4(fullFixture(), { now: NOW })
    expect(NodeWorkflowStateV4Schema.safeParse(state).success).toBe(true)
    expect(state.version).toBe(4)
  })

  it('节点账目对得上：只少了 composer / agent 两个退役 planner', () => {
    const { state, stats } = migrateNodeWorkflowStateToV4(fullFixture(), {
      now: NOW,
    })
    expect(stats.nodesIn).toBe(17)
    expect(stats.droppedRetiredNodes).toBe(2)
    expect(stats.nodesOut).toBe(stats.nodesIn - stats.droppedRetiredNodes)
    expect(state.nodes).toHaveLength(stats.nodesOut)
    // id 一个不改（边、op、快照都靠它）。
    expect(state.nodes.map((n) => n.id)).not.toContain('n_composer')
  })

  it('边账目对得上：只丢了两端接不上的那一条', () => {
    const { state, stats } = migrateNodeWorkflowStateToV4(fullFixture(), {
      now: NOW,
    })
    expect(stats.edgesIn).toBe(10)
    expect(stats.droppedEdges).toBe(1)
    expect(stats.edgesOut).toBe(9)
    expect(state.edges).toHaveLength(9)
    expect(state.edges.map((e) => e.id)).not.toContain('e_dangling')
  })

  it('legacy type 零残留：v4 里只有 kind + subtype', () => {
    const { state } = migrateNodeWorkflowStateToV4(fullFixture(), { now: NOW })
    const serialized = JSON.stringify(state)
    for (const legacy of NODE_TYPES) {
      // `shot` / `image` / `voice` 同时也是 v4 的合法 kind/subtype 词，只查
      // 「有没有节点还带 type 字段」这条更硬的判据。
      expect(state.nodes.every((n) => !(legacy in n))).toBe(true)
    }
    expect(state.nodes.every((n) => !('type' in n))).toBe(true)
    expect(serialized).not.toContain('"type":"seedance"')
    expect(serialized).not.toContain('"type":"videoMerge"')
    expect(serialized).not.toContain('"role":"frame"')
    expect(serialized).not.toContain('voiceSampleUrl')
    // §9.3 另删：两个零消费者的桩。
    expect(serialized).not.toContain('parentId')
    expect(serialized).not.toContain('collapsed')
  })

  it('每个 legacy type 都映到 §9.3 表上的那一格', () => {
    const { state } = migrateNodeWorkflowStateToV4(fullFixture(), { now: NOW })
    const byId = new Map(state.nodes.map((n) => [n.id, n.data]))
    expect(byId.get('n_text')).toMatchObject({
      kind: 'text',
      subtype: 'shotNote',
    })
    expect(byId.get('n_script')).toMatchObject({
      kind: 'text',
      subtype: 'script',
    })
    expect(byId.get('n_shot')).toMatchObject({ kind: 'image', subtype: 'shot' })
    expect(byId.get('n_char')).toMatchObject({
      kind: 'image',
      subtype: 'character',
    })
    expect(byId.get('n_bg')).toMatchObject({
      kind: 'image',
      subtype: 'background',
    })
    // frameImage → image.shot（「首帧」是槽义不是身份）。
    expect(byId.get('n_frame')).toMatchObject({
      kind: 'image',
      subtype: 'shot',
    })
    expect(byId.get('n_img_closeup')).toMatchObject({
      kind: 'image',
      subtype: 'reference',
    })
    expect(byId.get('n_img_loose')).toMatchObject({
      kind: 'image',
      subtype: 'result',
    })
    expect(byId.get('n_voice')).toMatchObject({
      kind: 'audio',
      subtype: 'voice',
      // 两个 deprecated 字段合流进 url 后删除。
      url: 'https://x/a.mp3',
      ownerName: '西格莉卡',
    })
    expect(byId.get('n_video')).toMatchObject({
      kind: 'video',
      subtype: 'shot',
    })
    expect(byId.get('n_clip')).toMatchObject({ kind: 'video', subtype: 'clip' })
    expect(byId.get('n_merge')).toMatchObject({
      kind: 'video',
      subtype: 'merge',
    })
  })

  it('帧义搬到边的槽上，其余边按 kind 推导', () => {
    const { state } = migrateNodeWorkflowStateToV4(fullFixture(), { now: NOW })
    const slotOf = (id: string) => state.edges.find((e) => e.id === id)?.slot
    expect(slotOf('e_frame')).toBe('firstFrame')
    expect(slotOf('e_imgframe')).toBe('firstFrame')
    expect(slotOf('e_text')).toBe('text')
    expect(slotOf('e_voice')).toBe('voice')
    expect(slotOf('e_clipref')).toBe('reference')
    expect(slotOf('e_charref')).toBe('reference')
    expect(slotOf('e_closeup')).toBe('closeup')
    expect(slotOf('e_merge_a')).toBe('clip')
  })

  it('镜头标签：v3 没有这个字段 → 取显示名 / 提示词前 8 字，兜底「镜头」', () => {
    const { state } = migrateNodeWorkflowStateToV4(
      {
        nodes: [
          node('v_named', NODE_TYPE_IDS.seedance, { shotName: '有人还在' }),
          node('v_prompt', NODE_TYPE_IDS.seedance, {
            prompt: '雨夜里她回头看了一眼空荡的走廊',
          }),
          node('v_bare', NODE_TYPE_IDS.seedance),
        ],
      },
      { now: NOW },
    )
    const labelOf = (id: string) => {
      const data = state.nodes.find((n) => n.id === id)?.data
      return data?.kind === 'video' ? data.label : undefined
    }
    expect(labelOf('v_named')).toBe('有人还在')
    expect(labelOf('v_prompt')).toBe('雨夜里她回头看了')
    expect(labelOf('v_bare')).toBe('镜头')
  })

  it('v3 的 shotText 连进来默认是剧本档', () => {
    const { state } = migrateNodeWorkflowStateToV4(fullFixture(), { now: NOW })
    const text = state.nodes.find((n) => n.id === 'n_text')?.data
    expect(text?.kind).toBe('text')
    expect(text?.kind === 'text' ? text.defaultRole : undefined).toBe('script')
  })

  it('imageCategory 的 frameEnd 落尾帧槽，字段本身消失', () => {
    const state: V3State = {
      nodes: [
        node('i', NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.shot,
          imageCategory: 'frameEnd',
        }),
        node('v', NODE_TYPE_IDS.seedance),
      ],
      edges: [edge('e', 'i', 'v')],
    }
    const migrated = migrateNodeWorkflowStateToV4(state, { now: NOW })
    expect(migrated.state.edges[0]?.slot).toBe('lastFrame')
    expect(JSON.stringify(migrated.state)).not.toContain('imageCategory')
  })

  it('名字创建即持久化，同名自动追加序号，镜号进名字', () => {
    const { state } = migrateNodeWorkflowStateToV4(fullFixture(), { now: NOW })
    const names = state.nodes.map((n) => n.data.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names.every((name) => name.length > 0)).toBe(true)
    const video = state.nodes.find((n) => n.id === 'n_video')
    expect(video?.data.shotNo).toBe(1)
    expect(video?.data.name).toBe('S01·镜头')
    // 专有名优先。
    expect(state.nodes.find((n) => n.id === 'n_char')?.data.name).toBe(
      '西格莉卡',
    )
  })

  it('空 state 迁移成空的 v4 图，不炸也不编造节点', () => {
    const { state, stats } = migrateNodeWorkflowStateToV4({}, { now: NOW })
    expect(state).toMatchObject({ version: 4, nodes: [], edges: [] })
    expect(stats.nodesIn).toBe(0)
  })

  it('纯函数：同一份输入两次迁移结果逐字相同', () => {
    const a = migrateNodeWorkflowStateToV4(fullFixture(), { now: NOW })
    const b = migrateNodeWorkflowStateToV4(fullFixture(), { now: NOW })
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state))
  })
})

describe('migrateNodeWorkflowStateToV4 · C3c-① A 上传回填字段与两个迁移缺口', () => {
  it('videoThumbnailUrl / sizeBytes / mediaWidth / mediaHeight / imageSource 一路搬进 v4', () => {
    const { state } = migrateNodeWorkflowStateToV4(
      {
        nodes: [
          node('n_clip', NODE_TYPE_IDS.videoReference, {
            mediaUrl: 'https://x/a.mp4',
            videoThumbnailUrl: 'https://x/a.webp',
            sizeBytes: 1234,
            mediaWidth: 1920,
            mediaHeight: 1080,
          }),
          node('n_img', NODE_TYPE_IDS.shot, {
            mediaUrl: 'https://x/b.png',
            mediaWidth: 1024,
            mediaHeight: 1024,
            imageSource: 'existing',
          }),
        ],
      },
      { now: NOW },
    )
    const clip = state.nodes.find((item) => item.id === 'n_clip')
    const image = state.nodes.find((item) => item.id === 'n_img')
    expect(clip?.data).toMatchObject({
      videoThumbnailUrl: 'https://x/a.webp',
      sizeBytes: 1234,
      mediaWidth: 1920,
      mediaHeight: 1080,
    })
    expect(image?.data).toMatchObject({
      mediaWidth: 1024,
      mediaHeight: 1024,
      imageSource: 'existing',
    })
  })

  it('坏值不落库，也不让整份 parse 失败', () => {
    const { state } = migrateNodeWorkflowStateToV4(
      {
        nodes: [
          node('n_img', NODE_TYPE_IDS.shot, {
            mediaWidth: -3,
            mediaHeight: 0,
            sizeBytes: 'big',
            imageSource: 'nonsense',
            videoThumbnailUrl: '   ',
          }),
        ],
      },
      { now: NOW },
    )
    const data = state.nodes[0]?.data as Record<string, unknown>
    expect(data.mediaWidth).toBeUndefined()
    expect(data.mediaHeight).toBeUndefined()
    expect(data.sizeBytes).toBeUndefined()
    expect(data.imageSource).toBeUndefined()
    expect(data.videoThumbnailUrl).toBeUndefined()
  })

  it('缺口①：v3 四栏合成 Markdown 正文（`prompt` 空也不丢字）', () => {
    const { state } = migrateNodeWorkflowStateToV4(
      {
        nodes: [
          node('n_text', NODE_TYPE_IDS.shotText, {
            prompt: '',
            scene: '走廊·夜',
            action: '她回头',
            camera: '缓慢推入',
            composition: '中近景',
          }),
        ],
      },
      { now: NOW },
    )
    const data = state.nodes[0]?.data
    expect(data?.kind === 'text' ? data.body : '').toBe(
      '走廊·夜\n她回头\n缓慢推入\n中近景',
    )
  })

  it('缺口②：台词 id 反查到所属镜头的镜号', () => {
    const { state } = migrateNodeWorkflowStateToV4(
      {
        scriptDoc: {
          shots: [
            { id: 'shot_a', dialogue: [{ id: 'line_1' }] },
            { id: 'shot_b', dialogue: [{ id: 'line_2' }] },
          ],
        },
        nodes: [
          node('n_voice', NODE_TYPE_IDS.voice, {
            scriptRef: { kind: 'dialogue', sourceId: 'line_2' },
          }),
        ],
      },
      { now: NOW },
    )
    expect(state.nodes[0]?.data.shotNo).toBe(2)
  })
})

describe('resolveV4Identity', () => {
  it('composer / agent 整节点剥除', () => {
    expect(
      resolveV4Identity({
        id: 'a',
        type: NODE_TYPE_IDS.composer,
        position: { x: 0, y: 0 },
        data: {},
      }),
    ).toBeNull()
    expect(
      resolveV4Identity({
        id: 'b',
        type: NODE_TYPE_IDS.agent,
        position: { x: 0, y: 0 },
        data: {},
      }),
    ).toBeNull()
  })
})

describe('buildV3BackupKey', () => {
  it('key 含 projectId + 时间戳，同项目重跑不互相覆盖', () => {
    const a = buildV3BackupKey('p1', new Date('2026-09-06T01:00:00.000Z'))
    const b = buildV3BackupKey('p1', new Date('2026-09-06T02:00:00.000Z'))
    expect(a).toBe('backups/node-workflow-v3/p1/2026-09-06T01:00:00.000Z.json')
    expect(a).not.toBe(b)
  })
})
