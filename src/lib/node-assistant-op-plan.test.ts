import { describe, expect, it } from 'vitest'

import { NODE_ASSISTANT_OP_REJECT_REASON_IDS } from '@/constants/node-assistant-ops'
import { NODE_STUDIO_INGEST_REJECT_REASON_IDS } from '@/constants/node-studio'
import {
  NODE_IMAGE_ROLE_IDS,
  NODE_REVIEW_STATE_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import type { NodeAssistantOpBatch } from '@/types/node-assistant-ops'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import { planNodeAssistantOps } from './node-assistant-op-plan'

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

function makeEdge(
  id: string,
  source: string,
  target: string,
): NodeWorkflowEdge {
  return { id, source, target } as NodeWorkflowEdge
}

function batch(...ops: NodeAssistantOpBatch['ops']): NodeAssistantOpBatch {
  return { ops }
}

const GEMINI_MODEL = {
  adapterType: AI_ADAPTER_TYPES.GEMINI,
  modelId: 'gemini-3.1-flash-image-preview',
  apiKeyId: 'key-1',
}

describe('planNodeAssistantOps · 新建与批内引用', () => {
  it('新建的节点可以被同一批的连线引用（判据：加一个角色并连到镜头）', () => {
    const shot = makeNode('shot-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.shot,
    })
    const plan = planNodeAssistantOps(
      batch(
        {
          op: 'add_node',
          intent: 'organize.character',
          ref: 'c1',
          name: '小林',
        },
        { op: 'connect', source: 'c1', target: 'shot-1' },
      ),
      [shot],
      [],
    )

    expect(plan.ops.map((entry) => entry.status)).toEqual(['ready', 'ready'])
    expect(plan.readyStructuralCount).toBe(2)
    expect(plan.readyGenerateCount).toBe(0)
    expect(plan.ops[1]?.source).toEqual({ kind: 'pending', ref: 'c1' })
    expect(plan.ops[1]?.target).toEqual({ kind: 'existing', nodeId: 'shot-1' })
  })

  it('引用不存在的节点 → unknownNode', () => {
    const plan = planNodeAssistantOps(
      batch({ op: 'connect', source: 'ghost', target: 'also-ghost' }),
      [],
      [],
    )
    expect(plan.ops[0]).toMatchObject({
      status: 'rejected',
      reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.unknownNode,
    })
    expect(plan.rejectedCount).toBe(1)
  })

  it('别名撞车 → duplicateRef，且不覆盖先声明的那个', () => {
    const plan = planNodeAssistantOps(
      batch(
        { op: 'add_node', intent: 'organize.character', ref: 'c1', name: 'A' },
        { op: 'add_node', intent: 'organize.scene', ref: 'c1', name: 'B' },
      ),
      [],
      [],
    )
    expect(plan.ops[0]?.status).toBe('ready')
    expect(plan.ops[1]).toMatchObject({
      status: 'rejected',
      reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.duplicateRef,
    })
  })

  it('别名与画布上已有节点 id 同名 → duplicateRef（引用会指向不明）', () => {
    const existing = makeNode('hero', NODE_TYPE_IDS.seedance)
    const plan = planNodeAssistantOps(
      batch({ op: 'add_node', intent: 'organize.character', ref: 'hero' }),
      [existing],
      [],
    )
    expect(plan.ops[0]).toMatchObject({
      status: 'rejected',
      reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.duplicateRef,
    })
  })
})

describe('planNodeAssistantOps · 连线走 evaluateCastIngest', () => {
  it('自环被拒（沿用人手那套词表）', () => {
    const video = makeNode('v1', NODE_TYPE_IDS.seedance)
    const plan = planNodeAssistantOps(
      batch({ op: 'connect', source: 'v1', target: 'v1' }),
      [video],
      [],
    )
    expect(plan.ops[0]).toMatchObject({
      status: 'rejected',
      reason: NODE_STUDIO_INGEST_REJECT_REASON_IDS.typeMismatch,
    })
  })

  it('图上已有的边不再连一次 → duplicate', () => {
    const character = makeNode('c1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.character,
    })
    const video = makeNode('v1', NODE_TYPE_IDS.seedance)
    const plan = planNodeAssistantOps(
      batch({ op: 'connect', source: 'c1', target: 'v1' }),
      [character, video],
      [makeEdge('e1', 'c1', 'v1')],
    )
    expect(plan.ops[0]).toMatchObject({
      status: 'rejected',
      reason: NODE_STUDIO_INGEST_REJECT_REASON_IDS.duplicate,
    })
  })

  it('同一批里连两次同一对 → 第二条 duplicate（证明模拟真的在推进）', () => {
    const character = makeNode('c1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.character,
    })
    const video = makeNode('v1', NODE_TYPE_IDS.seedance)
    const plan = planNodeAssistantOps(
      batch(
        { op: 'connect', source: 'c1', target: 'v1' },
        { op: 'connect', source: 'c1', target: 'v1' },
      ),
      [character, video],
      [],
    )
    expect(plan.ops[0]?.status).toBe('ready')
    expect(plan.ops[1]).toMatchObject({
      status: 'rejected',
      reason: NODE_STUDIO_INGEST_REJECT_REASON_IDS.duplicate,
    })
  })

  it('参考位满 → capacityFull 并带上 n/m', () => {
    const video = makeNode('v1', NODE_TYPE_IDS.seedance, {
      model: GEMINI_MODEL,
    })
    const upstream = Array.from({ length: 20 }, (_, index) =>
      makeNode(`u${index}`, NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.background,
      }),
    )
    const character = makeNode('c1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.character,
    })
    const plan = planNodeAssistantOps(
      batch({ op: 'connect', source: 'c1', target: 'v1' }),
      [...upstream, character, video],
      upstream.map((node, index) => makeEdge(`e${index}`, node.id, 'v1')),
    )

    const entry = plan.ops[0]
    expect(entry?.status).toBe('rejected')
    expect(entry?.reason).toBe(
      NODE_STUDIO_INGEST_REJECT_REASON_IDS.capacityFull,
    )
    expect(entry?.capacity?.limit).toBeGreaterThan(0)
    expect(entry?.capacity?.current).toBeGreaterThanOrEqual(
      entry?.capacity?.limit ?? 0,
    )
  })
})

describe('planNodeAssistantOps · 审核态', () => {
  it('助手写 approved 一律拒 —— 即使目标图完全正常（§4.2 Q4 无开关）', () => {
    const shot = makeNode('shot-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.shot,
      mediaUrl: 'https://cdn/shot.png',
    })
    const plan = planNodeAssistantOps(
      batch({
        op: 'set_review_state',
        target: 'shot-1',
        state: NODE_REVIEW_STATE_IDS.approved,
      }),
      [shot],
      [],
    )
    expect(plan.ops[0]).toMatchObject({
      status: 'rejected',
      reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.approvalForbidden,
    })
  })

  it('自批的理由不会被「没有媒体」盖掉（先判禁令再判落点）', () => {
    const empty = makeNode('shot-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.shot,
    })
    const plan = planNodeAssistantOps(
      batch({
        op: 'set_review_state',
        target: 'shot-1',
        state: NODE_REVIEW_STATE_IDS.approved,
      }),
      [empty],
      [],
    )
    expect(plan.ops[0]?.reason).toBe(
      NODE_ASSISTANT_OP_REJECT_REASON_IDS.approvalForbidden,
    )
  })

  it('被拒的自批 op 仍然带着目标 —— 卡上要说清它想动的是哪一张', () => {
    // 真机上抓到的：拒绝分支忘了把 target 带上，卡片于是显示「已删除节点」，
    // 而那个节点好端端地在画布上。
    const shot = makeNode('shot-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.shot,
      mediaUrl: 'https://cdn/shot.png',
    })
    const plan = planNodeAssistantOps(
      batch({
        op: 'set_review_state',
        target: 'shot-1',
        state: NODE_REVIEW_STATE_IDS.approved,
      }),
      [shot],
      [],
    )
    expect(plan.ops[0]?.target).toEqual({ kind: 'existing', nodeId: 'shot-1' })
  })

  it('打回一张有图的节点 → ready，并把落点 URL 定下来', () => {
    const shot = makeNode('shot-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.shot,
      mediaUrl: 'https://cdn/shot.png',
    })
    const plan = planNodeAssistantOps(
      batch({
        op: 'set_review_state',
        target: 'shot-1',
        state: NODE_REVIEW_STATE_IDS.rejected,
        reason: '人物脸崩了',
      }),
      [shot],
      [],
    )
    expect(plan.ops[0]).toMatchObject({
      status: 'ready',
      mediaUrl: 'https://cdn/shot.png',
    })
  })

  it('目标身上没有媒体 → noMedia（审核态按 URL 键控，无从标起）', () => {
    const shot = makeNode('shot-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.shot,
    })
    const plan = planNodeAssistantOps(
      batch({
        op: 'set_review_state',
        target: 'shot-1',
        state: NODE_REVIEW_STATE_IDS.awaitingReview,
      }),
      [shot],
      [],
    )
    expect(plan.ops[0]).toMatchObject({
      status: 'rejected',
      reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.noMedia,
    })
  })
})

describe('planNodeAssistantOps · 触发生成', () => {
  it('文本节点不能生成 → notGeneratable', () => {
    const shotText = makeNode('t1', NODE_TYPE_IDS.shotText)
    const plan = planNodeAssistantOps(
      batch({ op: 'generate', target: 't1' }),
      [shotText],
      [],
    )
    expect(plan.ops[0]).toMatchObject({
      status: 'rejected',
      reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.notGeneratable,
    })
  })

  it('卡片不能生成 → notGeneratable（助手要出图得落在图片节点上）', () => {
    // 卡片是身份档案夹，自己不产图；助手的产物落在图片节点，卡片只负责引用。
    // ⚠ 卡片的 media kind 也是 image，只按 kind 判会让助手把结果写进卡片。
    for (const node of [
      makeNode('c1', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.character,
        model: GEMINI_MODEL,
      }),
      makeNode('c2', NODE_TYPE_IDS.image, {
        role: NODE_IMAGE_ROLE_IDS.background,
        model: GEMINI_MODEL,
      }),
      makeNode('c3', NODE_TYPE_IDS.characterImage, { model: GEMINI_MODEL }),
      makeNode('c4', NODE_TYPE_IDS.backgroundImage, { model: GEMINI_MODEL }),
    ]) {
      const plan = planNodeAssistantOps(
        batch({ op: 'generate', target: node.id }),
        [node],
        [],
      )
      expect(plan.ops[0], node.id).toMatchObject({
        status: 'rejected',
        reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.notGeneratable,
      })
    }
  })

  it('没选模型 → noModel（与人手点生成时的拦法一致）', () => {
    const shot = makeNode('shot-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.shot,
    })
    const plan = planNodeAssistantOps(
      batch({ op: 'generate', target: 'shot-1' }),
      [shot],
      [],
    )
    expect(plan.ops[0]).toMatchObject({
      status: 'rejected',
      reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.noModel,
    })
  })

  it('可生成时单独计数 —— 结构操作与烧钱操作不混在一个批次里', () => {
    const shot = makeNode('shot-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.shot,
      model: GEMINI_MODEL,
    })
    const plan = planNodeAssistantOps(
      batch(
        { op: 'rename', target: 'shot-1', name: '雨夜开场镜' },
        { op: 'generate', target: 'shot-1' },
      ),
      [shot],
      [],
    )
    expect(plan.readyStructuralCount).toBe(1)
    expect(plan.readyGenerateCount).toBe(1)
    expect(plan.rejectedCount).toBe(0)
  })
})

describe('planNodeAssistantOps · 改名', () => {
  it('改名不存在的节点 → unknownNode', () => {
    const plan = planNodeAssistantOps(
      batch({ op: 'rename', target: 'ghost', name: '新名字' }),
      [],
      [],
    )
    expect(plan.ops[0]).toMatchObject({
      status: 'rejected',
      reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.unknownNode,
    })
  })
})

describe('planNodeAssistantOps · 改提示词（切片 5 第一批）', () => {
  it('改已有节点的提示词 → ready，且归自动落一档', () => {
    const shot = makeNode('shot-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.shot,
      prompt: '旧的提示词',
    })
    const plan = planNodeAssistantOps(
      batch({ op: 'set_prompt', target: 'shot-1', prompt: '黄昏，逆光，中景' }),
      [shot],
      [],
    )
    expect(plan.ops[0]).toMatchObject({
      status: 'ready',
      target: { kind: 'existing', nodeId: 'shot-1' },
    })
    expect(plan.readyStructuralCount).toBe(1)
    expect(plan.readyGenerateCount).toBe(0)
  })

  it('能改本批刚建出来的节点（别名解析）', () => {
    const plan = planNodeAssistantOps(
      batch(
        { op: 'add_node', intent: 'image.shot', ref: 's1' },
        { op: 'set_prompt', target: 's1', prompt: '雨夜，霓虹反光' },
      ),
      [],
      [],
    )
    expect(plan.ops.map((entry) => entry.status)).toEqual(['ready', 'ready'])
    expect(plan.ops[1]?.target).toEqual({ kind: 'pending', ref: 's1' })
  })

  it('目标不存在 → unknownNode', () => {
    const plan = planNodeAssistantOps(
      batch({ op: 'set_prompt', target: 'ghost', prompt: '随便什么' }),
      [],
      [],
    )
    expect(plan.ops[0]).toMatchObject({
      status: 'rejected',
      reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.unknownNode,
    })
  })
})

describe('planNodeAssistantOps · 标图片分类（切片 5 第一批）', () => {
  const looseImage = () => makeNode('img-1', NODE_TYPE_IDS.image)

  it('把散图标成关键帧首帧 → ready', () => {
    const plan = planNodeAssistantOps(
      batch({
        op: 'set_image_category',
        target: 'img-1',
        category: 'frameStart',
      }),
      [looseImage()],
      [],
    )
    expect(plan.ops[0]).toMatchObject({ status: 'ready' })
    expect(plan.readyStructuralCount).toBe(1)
  })

  it('镜头图（image + role=shot）也能标 —— 与人手工具条那条路一致', () => {
    const shot = makeNode('shot-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.shot,
    })
    const plan = planNodeAssistantOps(
      batch({ op: 'set_image_category', target: 'shot-1', category: 'style' }),
      [shot],
      [],
    )
    expect(plan.ops[0]).toMatchObject({ status: 'ready' })
  })

  const notCategorizable: {
    label: string
    type: NodeWorkflowNode['type']
    data: Record<string, unknown>
  }[] = [
    {
      label: '角色卡',
      type: NODE_TYPE_IDS.image,
      data: { role: NODE_IMAGE_ROLE_IDS.character },
    },
    {
      label: '背景卡',
      type: NODE_TYPE_IDS.image,
      data: { role: NODE_IMAGE_ROLE_IDS.background },
    },
    { label: '视频节点', type: NODE_TYPE_IDS.seedance, data: {} },
    { label: '镜头文本', type: NODE_TYPE_IDS.shotText, data: {} },
  ]

  for (const entry of notCategorizable) {
    it(`${entry.label}身上没有分类这回事 → notCategorizable`, () => {
      const plan = planNodeAssistantOps(
        batch({
          op: 'set_image_category',
          target: 'n-1',
          category: 'identity',
        }),
        [makeNode('n-1', entry.type, entry.data)],
        [],
      )
      expect(plan.ops[0]).toMatchObject({
        status: 'rejected',
        reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.notCategorizable,
      })
    })
  }

  // ⛔ 收窄不猜：模糊匹配一个分类的代价是关键帧首尾接反。
  it.each(['FrameStart', 'first-frame', '首帧', 'unset'])(
    '不在 11 个里的分类值 %s → unknownCategory',
    (category) => {
      const plan = planNodeAssistantOps(
        batch({ op: 'set_image_category', target: 'img-1', category }),
        [looseImage()],
        [],
      )
      expect(plan.ops[0]).toMatchObject({
        status: 'rejected',
        reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.unknownCategory,
      })
    },
  )

  it('custom 缺 label → missingCategoryLabel；给了 label → ready', () => {
    const rejected = planNodeAssistantOps(
      batch({ op: 'set_image_category', target: 'img-1', category: 'custom' }),
      [looseImage()],
      [],
    )
    expect(rejected.ops[0]).toMatchObject({
      status: 'rejected',
      reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.missingCategoryLabel,
    })

    const ready = planNodeAssistantOps(
      batch({
        op: 'set_image_category',
        target: 'img-1',
        category: 'custom',
        label: '道具·手电',
      }),
      [looseImage()],
      [],
    )
    expect(ready.ops[0]).toMatchObject({ status: 'ready' })
  })

  it('目标不存在 → unknownNode（先说找不到，再谈分类对不对）', () => {
    const plan = planNodeAssistantOps(
      batch({
        op: 'set_image_category',
        target: 'ghost',
        category: 'nonsense',
      }),
      [],
      [],
    )
    expect(plan.ops[0]).toMatchObject({
      status: 'rejected',
      reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.unknownNode,
    })
  })

  it('同一批里标完再标一次，第二次读到的是模拟图上的新值', () => {
    const plan = planNodeAssistantOps(
      batch(
        {
          op: 'set_image_category',
          target: 'img-1',
          category: 'custom',
          label: '临时',
        },
        { op: 'set_image_category', target: 'img-1', category: 'frameEnd' },
      ),
      [looseImage()],
      [],
    )
    expect(plan.ops.map((entry) => entry.status)).toEqual(['ready', 'ready'])
    expect(plan.readyStructuralCount).toBe(2)
  })

  it('本批新建的散图可以立刻标首尾帧 —— 关键帧入口退役后的那条路', () => {
    const plan = planNodeAssistantOps(
      batch(
        { op: 'add_node', intent: 'image.asset', ref: 'k1' },
        { op: 'set_image_category', target: 'k1', category: 'frameStart' },
      ),
      [],
      [],
    )
    expect(plan.ops.map((entry) => entry.status)).toEqual(['ready', 'ready'])
    expect(plan.ops[1]?.target).toEqual({ kind: 'pending', ref: 'k1' })
  })
})
