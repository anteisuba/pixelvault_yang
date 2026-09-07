/**
 * ScriptDoc → v4 整图投影（第三期 · 画布 C3b）。
 *
 * ⛔ **本片写好不接线** —— 生产调用方为 0，接线在 C3c（翻转到 v4 时把
 * `use-node-workflow.ts` 里那两处 `projectScriptDocToGraph(...)`（投影 / 重投影）
 * 换成这个函数）。旧的 v3 `projectScriptDocToGraph`（`node-workflow-script-doc.ts`）
 * 本片**不改不删**。
 *
 * ── 与 v3 投影的关系：同一张图的两种写法 ──────────────────────────────
 * 这里产出的节点集合 / 边槽 / 送进模型的文本，与「跑 v3 投影再
 * `migrateNodeWorkflowStateToV4`」逐项对齐（`node-workflow-script-doc-v4.test.ts`
 * 的等价测试锁住这条）。⚠ 因此**角色投影成 `image.character` 而不是文本节点**：
 * 角色卡是生成落点（它自己出图），把它降成一段文字会让「先出角色图再进镜头」
 * 整条路径消失，也让等价不可能成立。真正的文本节点有两处：
 *   · 每镜一个 `text.shotNote`（`defaultRole: script` → 连进镜头就是剧本正文）
 *   · 全局一个 `text.rule`（`defaultRole: style` → 风格约束段），只在
 *     `scriptDoc.styleNote` 有值时出现；v3 投影没有这个落点，⚠ 它是 v4 才有的
 *     新节点，等价夹具因此不带 `styleNote`（见测试里那条注释）。
 *
 * ── 三条纪律 ────────────────────────────────────────────────────────────
 * ① **创建顺序 = v3 投影的创建顺序**（角色 → 每镜的 文本/静帧/镜头/音色 → 成片）。
 *    `makeId` 的调用序因此一致，两条路径给同一个 doc 产出**同一批 id** ——
 *    等价测试才能逐个节点比对，而不是靠形状猜配对。
 * ② **每条边都带槽**（v4 边的 `slot` 必填），槽由端口表决定，⛔ 不在这里现推。
 * ③ **纯函数**：不读时钟（`now` 注入）、不生成随机 id（`makeId` 注入）、不碰 DOM。
 */

import {
  NODE_STUDIO_ID_PREFIXES,
  NODE_V4_SUBTYPE_LABELS,
} from '@/constants/node-studio'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_AUDIO_SUBTYPE_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
  NODE_V4_TEXT_SUBTYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import {
  NODE_SLOT_IDS,
  NODE_SLOT_OUTPUT_IDS,
  NODE_SLOT_TEXT_ROLE_IDS,
} from '@/constants/node-slots'
import { buildShotLabel, buildStableNodeName } from '@/lib/node-display-name'
import { composeShotTextBody } from '@/lib/node-workflow-prompt'
import { tidyShotLanes } from '@/lib/node-shot-layout'
import { reconcileStateSlots } from '@/lib/node-slot-binding'
import {
  NodeWorkflowStateV4Schema,
  type NodeV4,
  type NodeV4Data,
  type NodeWorkflowEdgeV4,
  type NodeWorkflowStateV4,
} from '@/types/node-workflow'
import type { ScriptDoc, ScriptDocShot } from '@/types/script-doc'

export interface ProjectScriptDocV4Options {
  /** 与 v3 投影同签名：按前缀发 id。⛔ 不在这里 `crypto.randomUUID`（纯函数）。 */
  makeId(prefix: string): string
  /**
   * 分镜静帧（包 3 / Q5「默认开 · 项目级可关」）。省略或 `true` = 开。
   * ⚠ 与 v3 投影的语义差一点：那边关掉只是「不再新建」，已存在的静帧照留；
   * 这里是**从零投影**（没有 existing state 可比），所以它就是纯粹的开关。
   */
  shotStills?: boolean
  /** 每个节点的 `createdAt`。注入才可断言。 */
  now?: string
  /** 跑一遍镜头带整理，给节点排出标准版式坐标。默认开。 */
  layout?: boolean
}

/**
 * 一镜的文本正文 = 场景 / 动作 / 镜头 / 构图 四段，空段跳过、换行相连。
 *
 * ⚠ 这一串必须与 `buildNodeWorkflowPrompt(shotText, …)` 的产出逐字相同：v3 那条
 * 路径上真正送进模型的就是它（`harvestUpstreamShotTextPrompt` 拼的那一段）。
 * 两处拼法一旦分家，v4 翻转当天用户就会发现镜头文字变了。
 *
 * ⚠ 顺序取自 `NODE_WORKFLOW_FIELDS_BY_NODE_TYPE[shotText]`（scene → action →
 * camera → composition），⛔ 别按 ScriptDoc 字段的声明顺序重排。
 */
export function buildShotTextBody(shot: ScriptDocShot): string {
  return composeShotTextBody([
    shot.sceneLabel,
    shot.summary,
    shot.camera,
    shot.composition,
  ])
}

interface Builder {
  readonly nodes: NodeV4[]
  readonly edges: NodeWorkflowEdgeV4[]
  readonly takenNames: Set<string>
  readonly takenLabels: Set<string>
}

function pushNode(
  builder: Builder,
  makeId: ProjectScriptDocV4Options['makeId'],
  data: NodeV4Data,
): string {
  const id = makeId(NODE_STUDIO_ID_PREFIXES.node)
  builder.nodes.push({ id, position: { x: 0, y: 0 }, data })
  return id
}

function connect(
  builder: Builder,
  makeId: ProjectScriptDocV4Options['makeId'],
  source: string,
  target: string,
  slot: NodeWorkflowEdgeV4['slot'],
): void {
  builder.edges.push({
    id: makeId(NODE_STUDIO_ID_PREFIXES.edge),
    source,
    sourceHandle: NODE_SLOT_OUTPUT_IDS.out,
    target,
    slot,
  })
}

function stableName(
  builder: Builder,
  kind: NodeV4Data['kind'],
  subtype: NodeV4Data['subtype'],
  shotNo: number | undefined,
  properName?: string,
): string {
  const name = buildStableNodeName(
    {
      kind,
      subtype,
      ...(shotNo === undefined ? {} : { shotNo }),
      ...(properName ? { properName } : {}),
    },
    {
      labelOf: (k, s) => NODE_V4_SUBTYPE_LABELS[`${k}.${s}`] ?? s,
      taken: builder.takenNames,
    },
  )
  builder.takenNames.add(name)
  return name
}

/**
 * 一份 ScriptDoc → 一整张 v4 图。
 *
 * ⚠ 返回的是**完整 state**而不是 v3 投影那样的增量补丁（`nodesToAdd` /
 * `edgesToRemove` …）：v4 的孤儿清理靠 `shotNo` 与槽的合法性回答，不再靠
 * `scriptRef` 反查（v4 节点上没有这个字段）。增量再投影是 C3c 的事，本片先把
 * 「一份剧本长成什么样」这一层定死。
 */
export function projectScriptDocToGraphV4(
  scriptDoc: ScriptDoc,
  options: ProjectScriptDocV4Options,
): NodeWorkflowStateV4 {
  const { makeId, now, shotStills, layout } = options
  const createdAt = now ?? new Date().toISOString()
  const wantsShotStills = shotStills !== false

  const builder: Builder = {
    nodes: [],
    edges: [],
    takenNames: new Set<string>(),
    takenLabels: new Set<string>(),
  }

  const base = (name: string, shotNo?: number) => ({
    name,
    status: 'idle' as const,
    ...(shotNo === undefined ? {} : { shotNo }),
    createdAt,
  })

  // ── 角色 → 角色卡（`image.character`）─────────────────────────────────
  // ⚠ 不带 `shotNo`：一张角色卡跨镜复用，钉在某一镜的带里就是把复用变成复制。
  const roleNodeId = new Map<string, string>()
  const roleNameById = new Map(
    scriptDoc.roles.map((role) => [role.id, role.name] as const),
  )
  for (const role of scriptDoc.roles) {
    const visualSeed = role.description || role.name
    const id = pushNode(builder, makeId, {
      ...base(
        stableName(
          builder,
          NODE_MEDIA_KIND_IDS.image,
          NODE_V4_IMAGE_SUBTYPE_IDS.character,
          undefined,
          role.name,
        ),
      ),
      kind: NODE_MEDIA_KIND_IDS.image,
      subtype: NODE_V4_IMAGE_SUBTYPE_IDS.character,
      prompt: visualSeed,
      characterName: role.name,
    })
    roleNodeId.set(role.id, id)
  }

  // ── 每镜 ──────────────────────────────────────────────────────────────
  const shotNodeIds: string[] = []
  scriptDoc.shots.forEach((shot, index) => {
    const shotNo = index + 1

    // ① 镜头文本（剧本正文）。`defaultRole: script` = 连进镜头的 `text` 槽时
    //    当正文用；同一份文本被别的镜头当风格约束时，角色写在**那条边**上。
    const shotTextId = pushNode(builder, makeId, {
      ...base(
        stableName(
          builder,
          NODE_MEDIA_KIND_IDS.text,
          NODE_V4_TEXT_SUBTYPE_IDS.shotNote,
          shotNo,
        ),
        shotNo,
      ),
      kind: NODE_MEDIA_KIND_IDS.text,
      subtype: NODE_V4_TEXT_SUBTYPE_IDS.shotNote,
      body: buildShotTextBody(shot),
      defaultRole: NODE_SLOT_TEXT_ROLE_IDS.script,
    })

    // ② 分镜静帧（`image.shot`）。
    const shotStillId = wantsShotStills
      ? pushNode(builder, makeId, {
          ...base(
            stableName(
              builder,
              NODE_MEDIA_KIND_IDS.image,
              NODE_V4_IMAGE_SUBTYPE_IDS.shot,
              shotNo,
            ),
            shotNo,
          ),
          kind: NODE_MEDIA_KIND_IDS.image,
          subtype: NODE_V4_IMAGE_SUBTYPE_IDS.shot,
          prompt: shot.summary,
        })
      : undefined

    // ③ 镜头本体（`video.shot`）。`label` 是**稳定名**——`@` 认的就是它，换序
    //    只动 `shotNo`（C1 契约修正 1）。
    const label = buildShotLabel(
      { given: shot.sceneLabel, prompt: shot.summary },
      builder.takenLabels,
    )
    builder.takenLabels.add(label)
    const shotId = pushNode(builder, makeId, {
      ...base(
        stableName(
          builder,
          NODE_MEDIA_KIND_IDS.video,
          NODE_V4_VIDEO_SUBTYPE_IDS.shot,
          shotNo,
        ),
        shotNo,
      ),
      kind: NODE_MEDIA_KIND_IDS.video,
      subtype: NODE_V4_VIDEO_SUBTYPE_IDS.shot,
      label,
      ...(shot.camera?.trim() ? { prompt: shot.camera.trim() } : {}),
      ...(shot.durationSeconds != null
        ? { params: { duration: String(shot.durationSeconds) } }
        : {}),
    })
    shotNodeIds.push(shotId)

    connect(builder, makeId, shotTextId, shotId, NODE_SLOT_IDS.text)
    if (shotStillId) {
      // 静帧作为画面参考骑进镜头（v3 那边 `isVisualReferenceNode` 认 role=shot，
      // 同一条语义在 v4 里就是 `reference` 槽）。
      connect(builder, makeId, shotStillId, shotId, NODE_SLOT_IDS.reference)
    }

    for (const roleId of shot.roleIds) {
      const characterId = roleNodeId.get(roleId)
      if (!characterId) continue
      connect(builder, makeId, characterId, shotId, NODE_SLOT_IDS.reference)
      if (shotStillId) {
        // 角色也进静帧的参考槽 —— 静帧是唯一读自己上游的图生成节点，没有这条边
        // 它只能从裸文本出图，脸就跑了。
        connect(
          builder,
          makeId,
          characterId,
          shotStillId,
          NODE_SLOT_IDS.reference,
        )
      }
    }

    // ④ 台词 → 音色节点（`audio.voice`）。⚠ 台词本身不写进节点：它住在
    //    ScriptDoc 与镜头提示词里，音色节点只是**音色身份**的供体（剧本后置）。
    for (const line of shot.dialogue) {
      const voiceName = roleNameById.get(line.speakerRoleId) ?? ''
      const voiceId = pushNode(builder, makeId, {
        ...base(
          stableName(
            builder,
            NODE_MEDIA_KIND_IDS.audio,
            NODE_V4_AUDIO_SUBTYPE_IDS.voice,
            shotNo,
            voiceName,
          ),
          shotNo,
        ),
        kind: NODE_MEDIA_KIND_IDS.audio,
        subtype: NODE_V4_AUDIO_SUBTYPE_IDS.voice,
        ...(voiceName ? { ownerName: voiceName } : {}),
      })
      connect(builder, makeId, voiceId, shotId, NODE_SLOT_IDS.voice)
    }
  })

  // ── 成片（`video.merge`）：两镜起才有意义 ─────────────────────────────
  if (shotNodeIds.length >= 2) {
    const mergeId = pushNode(builder, makeId, {
      ...base(
        stableName(
          builder,
          NODE_MEDIA_KIND_IDS.video,
          NODE_V4_VIDEO_SUBTYPE_IDS.merge,
          undefined,
        ),
      ),
      kind: NODE_MEDIA_KIND_IDS.video,
      subtype: NODE_V4_VIDEO_SUBTYPE_IDS.merge,
    })
    for (const shotId of shotNodeIds) {
      connect(builder, makeId, shotId, mergeId, NODE_SLOT_IDS.clip)
    }
  }

  // ── 风格约束（`text.rule`）：v4 才有的落点 ───────────────────────────
  // ⚠ 排在最后建，正是为了让「不带 styleNote 的 doc」与 v3 投影的 id 序列逐个
  // 对齐 —— 有它时它只在尾部多一个节点，前面的 id 一个都不挪。
  if (scriptDoc.styleNote?.trim() && shotNodeIds.length > 0) {
    const styleId = pushNode(builder, makeId, {
      ...base(
        stableName(
          builder,
          NODE_MEDIA_KIND_IDS.text,
          NODE_V4_TEXT_SUBTYPE_IDS.rule,
          undefined,
        ),
      ),
      kind: NODE_MEDIA_KIND_IDS.text,
      subtype: NODE_V4_TEXT_SUBTYPE_IDS.rule,
      body: scriptDoc.styleNote.trim(),
      defaultRole: NODE_SLOT_TEXT_ROLE_IDS.style,
    })
    for (const shotId of shotNodeIds) {
      connect(builder, makeId, styleId, shotId, NODE_SLOT_IDS.text)
    }
  }

  const state = NodeWorkflowStateV4Schema.parse({
    version: 4,
    nodes: builder.nodes,
    edges: builder.edges,
    scriptDoc,
  })
  // binding 从边表重算（迁移产物同款），渲染层因此只读 `slots`。
  const bound = reconcileStateSlots(state, { ...(now ? { now } : {}) })
  return layout === false ? bound : tidyShotLanes(bound)
}
