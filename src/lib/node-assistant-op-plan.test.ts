import { describe, expect, it } from 'vitest'

import {
  NODE_ASSISTANT_OP_REJECT_REASON_IDS,
  NODE_ASSISTANT_OPS,
} from '@/constants/node-assistant-ops'
import { NODE_STUDIO_INGEST_REJECT_REASON_IDS } from '@/constants/node-studio'
import {
  NODE_IMAGE_ROLE_IDS,
  NODE_REVIEW_STATE_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  NodeAssistantOpBatchSchema,
  type NodeAssistantOpBatch,
} from '@/types/node-assistant-ops'
import type {
  NodeWorkflowEdge,
  NodeWorkflowModelOptionsByType,
  NodeWorkflowNode,
} from '@/types/node-workflow'

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

/**
 * `set_model` 的取值范围夹具。
 *
 * `freeTier` / `sourceType: 'saved'` 决定 `isRunnableModelOption` —— 一个**不能跑**
 * 的选项（工作区内置、没有 key 覆盖）用来验 `modelNeedsKey`：那条路和「id 根本
 * 不存在」是两句不同的话。
 */
const RUNNABLE_IMAGE_OPTION = {
  optionId: 'workspace:gemini-3.1-flash-image-preview',
  modelId: 'gemini-3.1-flash-image-preview',
  adapterType: AI_ADAPTER_TYPES.GEMINI,
  providerConfig: { label: 'Gemini', baseUrl: 'https://gemini.example' },
  requestCount: 1,
  sourceType: 'workspace' as const,
  freeTier: true,
}

const LOCKED_IMAGE_OPTION = {
  optionId: 'workspace:flux-2-pro',
  modelId: 'flux-2-pro',
  adapterType: AI_ADAPTER_TYPES.FAL,
  providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
  requestCount: 4,
  sourceType: 'workspace' as const,
}

/** Seedance 2.0：契约里五个档位全支持，能力表给 480p/720p/1080p + 4–15 秒。 */
const SEEDANCE_OPTION = {
  optionId: 'workspace:seedance-2.0',
  modelId: 'seedance-2.0',
  adapterType: AI_ADAPTER_TYPES.FAL,
  providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
  requestCount: 5,
  sourceType: 'workspace' as const,
  freeTier: true,
}

/** Kling V3 Pro：能力表给了 `['1080p']`，而**契约写死 `resolution: false`**。 */
const KLING_MODEL = {
  optionId: 'workspace:kling-v3-pro',
  modelId: 'kling-v3-pro',
  adapterType: AI_ADAPTER_TYPES.FAL,
  providerConfig: { label: 'fal.ai', baseUrl: 'https://fal.run' },
}

const MODEL_OPTIONS: NodeWorkflowModelOptionsByType = {
  [NODE_TYPE_IDS.image]: [RUNNABLE_IMAGE_OPTION, LOCKED_IMAGE_OPTION],
  [NODE_TYPE_IDS.seedance]: [SEEDANCE_OPTION],
}

/** 第四个入参（模型选项表）在绝大多数用例里是同一份，包一层省得每处重复。 */
function planOps(
  ops: NodeAssistantOpBatch,
  nodes: readonly NodeWorkflowNode[],
  edges: readonly NodeWorkflowEdge[],
  modelOptions: NodeWorkflowModelOptionsByType = MODEL_OPTIONS,
) {
  return planNodeAssistantOps(ops, nodes, edges, modelOptions)
}

describe('planNodeAssistantOps · 新建与批内引用', () => {
  it('新建的节点可以被同一批的连线引用（判据：加一个角色并连到镜头）', () => {
    const shot = makeNode('shot-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.shot,
    })
    const plan = planOps(
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
    const plan = planOps(
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
    const plan = planOps(
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
    const plan = planOps(
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
    const plan = planOps(
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
    const plan = planOps(
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
    const plan = planOps(
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
    const plan = planOps(
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
    const plan = planOps(
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
    const plan = planOps(
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
    const plan = planOps(
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
    const plan = planOps(
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
    const plan = planOps(
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
    const plan = planOps(
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
      const plan = planOps(
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
    const plan = planOps(
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
    const plan = planOps(
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
    const plan = planOps(
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
    const plan = planOps(
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
    const plan = planOps(
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
    const plan = planOps(
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
    const plan = planOps(
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
    const plan = planOps(
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
      const plan = planOps(
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
      const plan = planOps(
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
    const rejected = planOps(
      batch({ op: 'set_image_category', target: 'img-1', category: 'custom' }),
      [looseImage()],
      [],
    )
    expect(rejected.ops[0]).toMatchObject({
      status: 'rejected',
      reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.missingCategoryLabel,
    })

    const ready = planOps(
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
    const plan = planOps(
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
    const plan = planOps(
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
    const plan = planOps(
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

describe('planNodeAssistantOps · set_model', () => {
  const looseImage = () => makeNode('img-1', NODE_TYPE_IDS.image)

  it('从可选列表里挑一个能跑的 → ready，并把整条选项带出去', () => {
    const plan = planOps(
      batch({
        op: 'set_model',
        target: 'img-1',
        model: RUNNABLE_IMAGE_OPTION.modelId,
      }),
      [looseImage()],
      [],
    )
    expect(plan.ops[0]).toMatchObject({ status: 'ready' })
    // 执行层要的是整条选项（optionId / adapterType / providerConfig），
    // 载荷里只有一个 id —— 这正是「查表只发生一次」的判据。
    expect(plan.ops[0]?.modelOption).toEqual(RUNNABLE_IMAGE_OPTION)
  })

  it('编一个列表里没有的 id → unknownModel（真机上它编过「Animagine XL」）', () => {
    const plan = planOps(
      batch({ op: 'set_model', target: 'img-1', model: 'Animagine XL' }),
      [looseImage()],
      [],
    )
    expect(plan.ops[0]).toMatchObject({
      status: 'rejected',
      reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.unknownModel,
    })
  })

  it('id 是真的但缺 key → modelNeedsKey（与「不存在」分开说）', () => {
    const plan = planOps(
      batch({
        op: 'set_model',
        target: 'img-1',
        model: LOCKED_IMAGE_OPTION.modelId,
      }),
      [looseImage()],
      [],
    )
    expect(plan.ops[0]).toMatchObject({
      status: 'rejected',
      reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.modelNeedsKey,
    })
  })

  it('身份卡与镜头文本不选模型 → notModelTargetable', () => {
    const plan = planOps(
      batch(
        {
          op: 'set_model',
          target: 'card-1',
          model: RUNNABLE_IMAGE_OPTION.modelId,
        },
        {
          op: 'set_model',
          target: 'text-1',
          model: RUNNABLE_IMAGE_OPTION.modelId,
        },
      ),
      [
        makeNode('card-1', NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.character,
        }),
        makeNode('text-1', NODE_TYPE_IDS.shotText),
      ],
      [],
    )
    for (const entry of plan.ops) {
      expect(entry).toMatchObject({
        status: 'rejected',
        reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.notModelTargetable,
      })
    }
  })

  it('目标不存在 → unknownNode', () => {
    const plan = planOps(
      batch({ op: 'set_model', target: 'ghost', model: 'whatever' }),
      [],
      [],
    )
    expect(plan.ops[0]).toMatchObject({
      status: 'rejected',
      reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.unknownNode,
    })
  })

  it('换完模型，同一批后面的 set_params 按新模型的档位判', () => {
    const plan = planOps(
      batch(
        {
          op: 'set_model',
          target: 'vid-1',
          model: SEEDANCE_OPTION.modelId,
        },
        { op: 'set_params', target: 'vid-1', resolution: '1080p' },
      ),
      [makeNode('vid-1', NODE_TYPE_IDS.seedance)],
      [],
    )
    // 没有模拟的话第二条会因为「还没选模型」被拒 —— 那是提案发出前的旧图。
    expect(plan.ops.map((entry) => entry.status)).toEqual(['ready', 'ready'])
  })
})

describe('planNodeAssistantOps · set_params', () => {
  const videoNode = (model: unknown = SEEDANCE_OPTION) =>
    makeNode('vid-1', NODE_TYPE_IDS.seedance, { model })

  it('合法档位 → ready', () => {
    const plan = planOps(
      batch({
        op: 'set_params',
        target: 'vid-1',
        aspectRatio: '16:9',
        resolution: '720p',
        duration: 6,
        generateAudio: true,
        seed: 42,
      }),
      [videoNode()],
      [],
    )
    expect(plan.ops[0]).toMatchObject({ status: 'ready' })
  })

  it('时长 auto 也收 —— 与合成台的自动档同一个值', () => {
    const plan = planOps(
      batch({ op: 'set_params', target: 'vid-1', duration: 'auto' }),
      [videoNode()],
      [],
    )
    expect(plan.ops[0]).toMatchObject({ status: 'ready' })
  })

  it('图片节点的档位不在节点上 → notParameterizable', () => {
    const plan = planOps(
      batch({ op: 'set_params', target: 'img-1', aspectRatio: '16:9' }),
      [makeNode('img-1', NODE_TYPE_IDS.image)],
      [],
    )
    expect(plan.ops[0]).toMatchObject({
      status: 'rejected',
      reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.notParameterizable,
    })
  })

  it('一个档位都没带 → emptyParams（落下去什么都不会变）', () => {
    const plan = planOps(
      batch({ op: 'set_params', target: 'vid-1' }),
      [videoNode()],
      [],
    )
    expect(plan.ops[0]).toMatchObject({
      status: 'rejected',
      reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.emptyParams,
    })
  })

  it('没选模型就没有档位可言 → noModel', () => {
    const plan = planOps(
      batch({ op: 'set_params', target: 'vid-1', resolution: '720p' }),
      // ⚠ 不能写 `videoNode(undefined)` —— 默认参数会把 undefined 换回
      // SEEDANCE_OPTION，那样这条用例永远是绿的却什么都没验。
      [makeNode('vid-1', NODE_TYPE_IDS.seedance)],
      [],
    )
    expect(plan.ops[0]).toMatchObject({
      status: 'rejected',
      reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.noModel,
    })
  })

  // ⚠ 这条正是「两问合一问」存在的理由：Kling 的能力表**给了** ['1080p']，
  // 而契约写死 `resolution: false`。只问能力表就会放过一个点了不起作用的值。
  it('模型契约里写死不支持的档位 → unsupportedParam', () => {
    const plan = planOps(
      batch({ op: 'set_params', target: 'vid-1', resolution: '1080p' }),
      [videoNode(KLING_MODEL)],
      [],
    )
    expect(plan.ops[0]).toMatchObject({
      status: 'rejected',
      reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.unsupportedParam,
    })
  })

  it('值不在当前模型给的档位里 → unknownParamValue（⛔ 不做就近匹配）', () => {
    const plan = planOps(
      batch(
        { op: 'set_params', target: 'vid-1', resolution: '4k' },
        { op: 'set_params', target: 'vid-1', duration: 99 },
        { op: 'set_params', target: 'vid-1', aspectRatio: '21:9' },
        { op: 'set_params', target: 'vid-1', seed: -1 },
      ),
      [videoNode()],
      [],
    )
    for (const entry of plan.ops) {
      expect(entry).toMatchObject({
        status: 'rejected',
        reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.unknownParamValue,
      })
    }
  })

  it('允许集之外的字段（负面提示词）根本不在 op 上 —— schema 直接吃不下', () => {
    const parsed = NodeAssistantOpBatchSchema.safeParse({
      ops: [
        {
          op: 'set_params',
          target: 'vid-1',
          negativePrompt: '模糊、低画质',
          seed: 7,
        },
      ],
    })
    expect(parsed.success).toBe(true)
    // 多余的键被 zod 剥掉，不会顺着补丁写进节点 —— 这正是「没读侧的字段一个都
    // 不许写」在类型层的落点。
    expect(parsed.success && parsed.data.ops[0]).not.toHaveProperty(
      'negativePrompt',
    )
  })
})

describe('planNodeAssistantOps · attach_asset', () => {
  const card = (data: Record<string, unknown> = {}) =>
    makeNode('card-1', NODE_TYPE_IDS.image, {
      role: NODE_IMAGE_ROLE_IDS.character,
      ...data,
    })
  const photo = (id = 'img-1', url = 'https://cdn.example.com/a.png') =>
    makeNode(id, NODE_TYPE_IDS.image, { mediaUrl: url })

  it('把散图挂进角色卡 → ready，媒体在规划期就定下来', () => {
    const plan = planOps(
      batch({ op: 'attach_asset', target: 'card-1', source: 'img-1' }),
      [card(), photo()],
      [],
    )
    expect(plan.ops[0]).toMatchObject({
      status: 'ready',
      mediaUrl: 'https://cdn.example.com/a.png',
      source: { kind: 'existing', nodeId: 'img-1' },
      target: { kind: 'existing', nodeId: 'card-1' },
    })
  })

  it('镜头图不收图集 → notAttachable（那条路是连线）', () => {
    const plan = planOps(
      batch({ op: 'attach_asset', target: 'shot-1', source: 'img-1' }),
      [
        makeNode('shot-1', NODE_TYPE_IDS.image, {
          role: NODE_IMAGE_ROLE_IDS.shot,
        }),
        photo(),
      ],
      [],
    )
    expect(plan.ops[0]).toMatchObject({
      status: 'rejected',
      reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.notAttachable,
    })
  })

  it('源节点身上没有媒体 → noMedia（本批刚建的节点必然落这条）', () => {
    const plan = planOps(
      batch(
        { op: 'add_node', intent: 'image.asset', ref: 'new' },
        { op: 'attach_asset', target: 'card-1', source: 'new' },
      ),
      [card()],
      [],
    )
    expect(plan.ops[1]).toMatchObject({
      status: 'rejected',
      reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.noMedia,
    })
  })

  it('同一张图挂两次 → duplicate（词表与人手落卡那处同一套）', () => {
    const plan = planOps(
      batch(
        { op: 'attach_asset', target: 'card-1', source: 'img-1' },
        { op: 'attach_asset', target: 'card-1', source: 'img-1' },
      ),
      [card(), photo()],
      [],
    )
    expect(plan.ops.map((entry) => entry.status)).toEqual(['ready', 'rejected'])
    expect(plan.ops[1]?.reason).toBe(
      NODE_STUDIO_INGEST_REJECT_REASON_IDS.duplicate,
    )
  })

  it('挂满了 → capacityFull，并带出 n/m', () => {
    const plan = planOps(
      batch({ op: 'attach_asset', target: 'card-1', source: 'img-9' }),
      [
        card({
          referenceAssets: [
            {
              id: 'r1',
              url: 'https://cdn.example.com/1.png',
              role: 'identity',
            },
            {
              id: 'r2',
              url: 'https://cdn.example.com/2.png',
              role: 'identity',
            },
            {
              id: 'r3',
              url: 'https://cdn.example.com/3.png',
              role: 'identity',
            },
          ],
        }),
        photo('img-9', 'https://cdn.example.com/9.png'),
      ],
      [],
    )
    expect(plan.ops[0]).toMatchObject({
      status: 'rejected',
      reason: NODE_STUDIO_INGEST_REJECT_REASON_IDS.capacityFull,
      capacity: { current: 3, limit: 3 },
    })
  })

  it('同一批连挂三张后第四张才满 —— 记账必须跟着模拟图走', () => {
    const plan = planOps(
      batch(
        { op: 'attach_asset', target: 'card-1', source: 'img-1' },
        { op: 'attach_asset', target: 'card-1', source: 'img-2' },
        { op: 'attach_asset', target: 'card-1', source: 'img-3' },
        { op: 'attach_asset', target: 'card-1', source: 'img-4' },
      ),
      [
        card(),
        photo('img-1', 'https://cdn.example.com/1.png'),
        photo('img-2', 'https://cdn.example.com/2.png'),
        photo('img-3', 'https://cdn.example.com/3.png'),
        photo('img-4', 'https://cdn.example.com/4.png'),
      ],
      [],
    )
    expect(plan.ops.map((entry) => entry.status)).toEqual([
      'ready',
      'ready',
      'ready',
      'rejected',
    ])
    expect(plan.ops[3]).toMatchObject({
      reason: NODE_STUDIO_INGEST_REJECT_REASON_IDS.capacityFull,
      capacity: { current: 3, limit: 3 },
    })
  })

  it('分类写错 → unknownCategory；custom 缺名字 → missingCategoryLabel', () => {
    const plan = planOps(
      batch(
        {
          op: 'attach_asset',
          target: 'card-1',
          source: 'img-1',
          role: 'nonsense',
        },
        {
          op: 'attach_asset',
          target: 'card-1',
          source: 'img-1',
          role: 'custom',
        },
      ),
      [card(), photo()],
      [],
    )
    expect(plan.ops[0]?.reason).toBe(
      NODE_ASSISTANT_OP_REJECT_REASON_IDS.unknownCategory,
    )
    expect(plan.ops[1]?.reason).toBe(
      NODE_ASSISTANT_OP_REJECT_REASON_IDS.missingCategoryLabel,
    )
  })

  it('挂自己 → 用连线那套词表说 typeMismatch', () => {
    const plan = planOps(
      batch({ op: 'attach_asset', target: 'card-1', source: 'card-1' }),
      [card({ mediaUrl: 'https://cdn.example.com/self.png' })],
      [],
    )
    expect(plan.ops[0]).toMatchObject({
      status: 'rejected',
      reason: NODE_STUDIO_INGEST_REJECT_REASON_IDS.typeMismatch,
    })
  })

  it('目标不存在 → unknownNode', () => {
    const plan = planOps(
      batch({ op: 'attach_asset', target: 'ghost', source: 'img-1' }),
      [photo()],
      [],
    )
    expect(plan.ops[0]).toMatchObject({
      status: 'rejected',
      reason: NODE_ASSISTANT_OP_REJECT_REASON_IDS.unknownNode,
    })
  })

  it('本批新建的角色卡也能立刻收图', () => {
    const plan = planOps(
      batch(
        { op: 'add_node', intent: 'organize.character', ref: 'c1' },
        { op: 'attach_asset', target: 'c1', source: 'img-1', onStage: true },
      ),
      [photo()],
      [],
    )
    expect(plan.ops.map((entry) => entry.status)).toEqual(['ready', 'ready'])
    expect(plan.ops[1]?.target).toEqual({ kind: 'pending', ref: 'c1' })
  })
})

describe('planNodeAssistantOps · 穷尽断言', () => {
  // ⚠ 这条守的是一个**静默失败**：漏写 case 的 op 既不 ready 也不 rejected，
  // 而是直接从 plan 里消失 —— 用户看到助手说「已经改好了」，画布上什么都没变。
  // 编译期由 `const unhandled: never = op` 拦，运行期由这条抛出兜底。
  it('词表里的每个 op 都有 case（漏一个就在这里炸）', () => {
    for (const op of NODE_ASSISTANT_OPS) {
      // 一份**并集载荷**：每条 case 只读自己那几个字段，多出来的一概不看。
      // 目标写不存在的节点，所以除了 add_node 之外全会走到「拒绝」那一支 ——
      // 走得到就说明 case 存在。真漏了 case，这里抛的是
      // `Unhandled node assistant op`，而不是安静地少一条。
      const plan = planOps(
        {
          ops: [
            {
              op,
              intent: 'image.asset',
              target: 'ghost',
              source: 'ghost',
              name: 'x',
              prompt: 'x',
              category: 'identity',
              model: 'x',
              state: 'rejected',
            } as never,
          ],
        },
        [],
        [],
      )
      expect(plan.ops).toHaveLength(1)
    }
  })
})
