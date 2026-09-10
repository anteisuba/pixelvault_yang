/**
 * v4 具名槽 · 端口表 · 连线矩阵（第三期 · 画布 C1）。
 * 依据 `docs/references/pages/node-canvas-v2.md` §9.3 端口表 / §9.4 合法矩阵。
 *
 * ── 为什么槽要单独成表 ────────────────────────────────────────────────
 * v3 的每个节点**恒定一进一出、不分槽**（卡壳左右各一个 `Handle`），
 * 于是「这条边是首帧还是参考」只能靠下游收割逻辑猜。v4 把它写在边上（`edge.slot`）
 * 并在这里给出**唯一**的合法性判据：谁有哪些入口、每个入口收什么 kind、收几条。
 *
 * ── 一条贯穿的判断（§9.1）────────────────────────────────────────────
 * **子型 = 节点的身份，槽 = 它在某条边里的用途，两者不合并。** 同一张关键帧既可
 * 以是 S02 的 `firstFrame`，也可以是 S03 的 `reference`——把「首帧」写成节点子型，
 * 复用就退化成复制。所以这张表是「(源 kind) × (目标节点, 槽)」，不是「源类型 ×
 * 目标类型」。
 *
 * ⛔ 这里只放**静态**判据。`0..N` 槽的实际上限跟模型走
 * （`resolveReferenceAssetLimit`，`src/constants/node-studio.ts`），由调用方在
 * `canConnect` 的 `capacity` 里传进来覆盖，不硬编码在表里。
 */

import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_AUDIO_SUBTYPE_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
  NODE_V4_TEXT_SUBTYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
  type NodeV4Subtype,
  type NodeWorkflowMediaKind,
} from '@/constants/node-types'

export const NODE_SLOT_IDS = {
  /** 视频镜头的首帧（0..1，轮播槽）。 */
  firstFrame: 'firstFrame',
  /** 视频镜头的尾帧（0..1，轮播槽）。 */
  lastFrame: 'lastFrame',
  /** 参考素材（0..N）。image 家族只收 image，`video.shot` 还收 video。 */
  reference: 'reference',
  /** 语音 / 音色输入（0..N on `video.shot`）。 */
  voice: 'voice',
  /** 文本输入：台词 / 剧本 / 上下文。 */
  text: 'text',
  /** 音色参考（`audio.voice`，0..1，轮播槽）。 */
  timbre: 'timbre',
  /** 面部特写子参考（`image.character`，0..N）。 */
  closeup: 'closeup',
  /** 合并节点的待接片段（2..9）。 */
  clip: 'clip',
  /** 文本节点的「从这些素材写文本」入口（0..N，任意 kind）。 */
  source: 'source',
} as const

export const NODE_SLOTS = [
  NODE_SLOT_IDS.firstFrame,
  NODE_SLOT_IDS.lastFrame,
  NODE_SLOT_IDS.reference,
  NODE_SLOT_IDS.voice,
  NODE_SLOT_IDS.text,
  NODE_SLOT_IDS.timbre,
  NODE_SLOT_IDS.closeup,
  NODE_SLOT_IDS.clip,
  NODE_SLOT_IDS.source,
] as const

export type NodeSlotId = (typeof NODE_SLOTS)[number]

/**
 * 出口 handle。`tailFrame` 是接续镜的出口（S02 的产物末帧直连 S03 的 `firstFrame`），
 * 只有 `video.shot` 有。⚠ 抽帧那一半（`planVideoFrames` 的显式时间戳档）挂在 C4，
 * 这里先把 handle 的名字定死，免得两处各起各的。
 */
export const NODE_SLOT_OUTPUT_IDS = {
  out: 'out',
  tailFrame: 'tailFrame',
} as const

export const NODE_SLOT_OUTPUTS = [
  NODE_SLOT_OUTPUT_IDS.out,
  NODE_SLOT_OUTPUT_IDS.tailFrame,
] as const

export type NodeSlotOutputId = (typeof NODE_SLOT_OUTPUTS)[number]

/**
 * 卡上**真正画出来**的两颗端口（spec §1.13，画板 `ConnectLines.dc.html` 方向 A）：
 * 左一入口、右一出口，不再按槽分口。
 *
 * ⚠ 与上面的槽表不是一回事：槽仍然是**边的属性**（`edge.slot`），只是不再各有
 * 一个 handle —— 线松在卡上任何位置都算连上，落进哪个槽由**来源 kind** 推
 * （`planV4ConnectDrop`）。渲染层因此把所有边的 `targetHandle` 统一写成
 * `input`、`sourceHandle` 统一写成 `output`：存量里 `sourceHandle = 'tailFrame'`
 * 的接续边照样画得出来（数据不动，只是不再有第二个口）。
 */
export const NODE_PORT_HANDLE_IDS = {
  input: 'in',
  output: NODE_SLOT_OUTPUT_IDS.out,
} as const

/**
 * `text` 槽的角色（第三期 · C1 契约修正 2，owner 定）。
 *
 * ── 为什么槽要再分角色 ──────────────────────────────────────────────────
 * `video.shot.text` 原本是一个 0..N 的口袋：剧本、风格约束、角色描述全塞进去，
 * 提示词编译时分不出「这段是要拍的内容」还是「这段是不许违反的约束」——于是约束
 * 会被当成画面描述念出来。角色是**边的属性**（同一个文本节点可以在 A 镜当剧本、
 * 在 B 镜当风格约束），所以它住在槽的版本上，不住在节点身份里。
 *
 * 三档就是三种编译去向：`script` 进正文、`style` 进约束段、`character` 进角色段。
 */
export const NODE_SLOT_TEXT_ROLE_IDS = {
  /** 要拍的内容本身。一个镜头只能有一份（0..1）。 */
  script: 'script',
  /** 风格 / 规则约束，可叠加（0..N）。 */
  style: 'style',
  /** 角色描述，可叠加（0..N）。 */
  character: 'character',
} as const

export const NODE_SLOT_TEXT_ROLES = [
  NODE_SLOT_TEXT_ROLE_IDS.script,
  NODE_SLOT_TEXT_ROLE_IDS.style,
  NODE_SLOT_TEXT_ROLE_IDS.character,
] as const

export type NodeSlotTextRole = (typeof NODE_SLOT_TEXT_ROLES)[number]

/** 缺省角色：不带 `role` 的文本连线一律按剧本算（迁移与旧 op 的落点）。 */
export const NODE_SLOT_TEXT_ROLE_FALLBACK: NodeSlotTextRole =
  NODE_SLOT_TEXT_ROLE_IDS.script

/** 端口表里一个入口槽的完整定义。 */
export interface NodeSlotSpec {
  readonly slot: NodeSlotId
  /** 最少几条边这个槽才算填好（生成前置校验读它；`clip` 是唯一 >0 的）。 */
  readonly min: number
  /** 静态容量上限；`null` = 不设静态上限（跟模型走，由调用方传 `capacity`）。 */
  readonly max: number | null
  /** 这个槽收哪些源 kind。 */
  readonly sourceKinds: readonly NodeWorkflowMediaKind[]
  /** 更窄的子型门（只有 `closeup` 有：只收 reference / character 两种图）。 */
  readonly sourceSubtypes?: readonly NodeV4Subtype[]
  /**
   * 按角色分的容量（只有 `text` 槽有）。有这张表时 `canConnect` 的容量判据走它，
   * 顶层 `max` 只描述整个槽的总量。⚠ 三档不是同一个口袋：`script` 0..1 是「一个
   * 镜头只拍一份内容」，`style` / `character` 0..N 是可叠加的约束。
   */
  readonly byRole?: Readonly<
    Record<
      NodeSlotTextRole,
      { readonly min: number; readonly max: number | null }
    >
  >
}

/** `${kind}.${subtype}`——端口表的键。 */
export type NodeV4TypeKey = `${NodeWorkflowMediaKind}.${NodeV4Subtype}`

export function nodeV4TypeKey(
  kind: NodeWorkflowMediaKind,
  subtype: NodeV4Subtype,
): NodeV4TypeKey {
  return `${kind}.${subtype}`
}

const ANY_KIND = [
  NODE_MEDIA_KIND_IDS.text,
  NODE_MEDIA_KIND_IDS.image,
  NODE_MEDIA_KIND_IDS.audio,
  NODE_MEDIA_KIND_IDS.video,
] as const

const TEXT_SOURCE_SLOT: NodeSlotSpec = {
  slot: NODE_SLOT_IDS.source,
  min: 0,
  max: null,
  sourceKinds: ANY_KIND,
}

const SINGLE_TEXT_SLOT: NodeSlotSpec = {
  slot: NODE_SLOT_IDS.text,
  min: 0,
  max: 1,
  sourceKinds: [NODE_MEDIA_KIND_IDS.text],
}

const IMAGE_REFERENCE_SLOT: NodeSlotSpec = {
  slot: NODE_SLOT_IDS.reference,
  min: 0,
  max: null,
  sourceKinds: [NODE_MEDIA_KIND_IDS.image],
}

/** 无入口的叶子源（外来参考图 / 参考片段）。 */
const LEAF: readonly NodeSlotSpec[] = []

export interface NodeV4PortSpec {
  /**
   * 入口槽，**自上而下就是这个数组的顺序**。⚠ §9.1 的自动排布要求「画布上左边那一摞
   * 源节点的顺序」= 「槽的顺序」，两处不许各排各的——所以顺序是这张表的一部分。
   */
  readonly inputs: readonly NodeSlotSpec[]
  readonly outputs: readonly NodeSlotOutputId[]
}

const IMAGE_GENERATED_PORTS: NodeV4PortSpec = {
  inputs: [IMAGE_REFERENCE_SLOT, SINGLE_TEXT_SLOT],
  outputs: [NODE_SLOT_OUTPUT_IDS.out],
}

const TEXT_PORTS: NodeV4PortSpec = {
  inputs: [TEXT_SOURCE_SLOT],
  outputs: [NODE_SLOT_OUTPUT_IDS.out],
}

/** 每个 `kind.subtype` 的具名入口 / 出口（§9.3）。 */
export const NODE_V4_PORTS = {
  [`${NODE_MEDIA_KIND_IDS.text}.${NODE_V4_TEXT_SUBTYPE_IDS.script}`]:
    TEXT_PORTS,
  [`${NODE_MEDIA_KIND_IDS.text}.${NODE_V4_TEXT_SUBTYPE_IDS.shotNote}`]:
    TEXT_PORTS,
  [`${NODE_MEDIA_KIND_IDS.text}.${NODE_V4_TEXT_SUBTYPE_IDS.rule}`]: TEXT_PORTS,

  [`${NODE_MEDIA_KIND_IDS.image}.${NODE_V4_IMAGE_SUBTYPE_IDS.character}`]: {
    inputs: [
      IMAGE_REFERENCE_SLOT,
      {
        slot: NODE_SLOT_IDS.closeup,
        min: 0,
        max: null,
        sourceKinds: [NODE_MEDIA_KIND_IDS.image],
        // 特写只收「外来参考图」与「角色图」两种子型：镜头图 / 背景 / 生成落点
        // 挂上来在收割时会被静默丢弃，正是恒真矩阵那条注释记下的代价。
        sourceSubtypes: [
          NODE_V4_IMAGE_SUBTYPE_IDS.reference,
          NODE_V4_IMAGE_SUBTYPE_IDS.character,
        ],
      },
      {
        slot: NODE_SLOT_IDS.voice,
        min: 0,
        max: null,
        sourceKinds: [NODE_MEDIA_KIND_IDS.audio],
      },
      SINGLE_TEXT_SLOT,
    ],
    outputs: [NODE_SLOT_OUTPUT_IDS.out],
  },
  [`${NODE_MEDIA_KIND_IDS.image}.${NODE_V4_IMAGE_SUBTYPE_IDS.background}`]:
    IMAGE_GENERATED_PORTS,
  [`${NODE_MEDIA_KIND_IDS.image}.${NODE_V4_IMAGE_SUBTYPE_IDS.shot}`]:
    IMAGE_GENERATED_PORTS,
  [`${NODE_MEDIA_KIND_IDS.image}.${NODE_V4_IMAGE_SUBTYPE_IDS.result}`]:
    IMAGE_GENERATED_PORTS,
  [`${NODE_MEDIA_KIND_IDS.image}.${NODE_V4_IMAGE_SUBTYPE_IDS.reference}`]: {
    inputs: LEAF,
    outputs: [NODE_SLOT_OUTPUT_IDS.out],
  },

  [`${NODE_MEDIA_KIND_IDS.audio}.${NODE_V4_AUDIO_SUBTYPE_IDS.voice}`]: {
    inputs: [
      SINGLE_TEXT_SLOT,
      {
        slot: NODE_SLOT_IDS.timbre,
        min: 0,
        max: 1,
        sourceKinds: [NODE_MEDIA_KIND_IDS.audio],
      },
    ],
    outputs: [NODE_SLOT_OUTPUT_IDS.out],
  },
  [`${NODE_MEDIA_KIND_IDS.audio}.${NODE_V4_AUDIO_SUBTYPE_IDS.ambience}`]: {
    inputs: [SINGLE_TEXT_SLOT],
    outputs: [NODE_SLOT_OUTPUT_IDS.out],
  },

  [`${NODE_MEDIA_KIND_IDS.video}.${NODE_V4_VIDEO_SUBTYPE_IDS.shot}`]: {
    // 顺序 = §9.3 版式里源节点自上而下的顺序：首帧 → 尾帧 → 参考 → 语音 → 文本。
    inputs: [
      {
        slot: NODE_SLOT_IDS.firstFrame,
        min: 0,
        max: 1,
        sourceKinds: [NODE_MEDIA_KIND_IDS.image],
      },
      {
        slot: NODE_SLOT_IDS.lastFrame,
        min: 0,
        max: 1,
        sourceKinds: [NODE_MEDIA_KIND_IDS.image],
      },
      {
        slot: NODE_SLOT_IDS.reference,
        min: 0,
        max: null,
        sourceKinds: [NODE_MEDIA_KIND_IDS.image, NODE_MEDIA_KIND_IDS.video],
      },
      {
        slot: NODE_SLOT_IDS.voice,
        min: 0,
        max: null,
        sourceKinds: [NODE_MEDIA_KIND_IDS.audio],
      },
      {
        slot: NODE_SLOT_IDS.text,
        min: 0,
        max: null,
        sourceKinds: [NODE_MEDIA_KIND_IDS.text],
        byRole: {
          [NODE_SLOT_TEXT_ROLE_IDS.script]: { min: 0, max: 1 },
          [NODE_SLOT_TEXT_ROLE_IDS.style]: { min: 0, max: null },
          [NODE_SLOT_TEXT_ROLE_IDS.character]: { min: 0, max: null },
        },
      },
    ],
    outputs: [NODE_SLOT_OUTPUT_IDS.out, NODE_SLOT_OUTPUT_IDS.tailFrame],
  },
  [`${NODE_MEDIA_KIND_IDS.video}.${NODE_V4_VIDEO_SUBTYPE_IDS.clip}`]: {
    inputs: LEAF,
    outputs: [NODE_SLOT_OUTPUT_IDS.out],
  },
  [`${NODE_MEDIA_KIND_IDS.video}.${NODE_V4_VIDEO_SUBTYPE_IDS.merge}`]: {
    inputs: [
      {
        slot: NODE_SLOT_IDS.clip,
        min: 2,
        max: 9,
        sourceKinds: [NODE_MEDIA_KIND_IDS.video],
      },
    ],
    outputs: [NODE_SLOT_OUTPUT_IDS.out],
  },
} as const satisfies Partial<Record<NodeV4TypeKey, NodeV4PortSpec>>

export function getNodeV4Ports(
  kind: NodeWorkflowMediaKind,
  subtype: NodeV4Subtype,
): NodeV4PortSpec | undefined {
  return (NODE_V4_PORTS as Partial<Record<string, NodeV4PortSpec>>)[
    nodeV4TypeKey(kind, subtype)
  ]
}

export function getNodeV4Slot(
  kind: NodeWorkflowMediaKind,
  subtype: NodeV4Subtype,
  slot: NodeSlotId,
): NodeSlotSpec | undefined {
  return getNodeV4Ports(kind, subtype)?.inputs.find(
    (input) => input.slot === slot,
  )
}

/**
 * 这个槽走不走版本轮播（§9.2）。判据是**容量恰为 1**：`0..N` 的槽本来就是多值并列，
 * 轮播只对「只能有一个当前版、但历史版要留着」的槽有意义。
 */
export function slotSupportsVersions(spec: NodeSlotSpec): boolean {
  return spec.max === 1
}

/**
 * 这个槽在某个角色下的容量。没有 `byRole` 的槽（所有非文本槽）回落到顶层
 * `min`/`max`——⛔ 不给它们编一份假的角色表，那会让「角色只对文本槽有意义」这条
 * 事实在两处各写各的。
 */
export function resolveSlotRoleCapacity(
  spec: NodeSlotSpec,
  role: NodeSlotTextRole = NODE_SLOT_TEXT_ROLE_FALLBACK,
): { readonly min: number; readonly max: number | null } {
  return spec.byRole?.[role] ?? { min: spec.min, max: spec.max }
}

/**
 * `@` 引用可以携带的**槽角色**（spec §1.7 / §8.2：`@首帧 xxx` / `@尾帧` /
 * `@语音` / `@参考`，无前缀 = 参考）。角色就是槽 id 的一个子集——⛔ 不另起一套
 * 名字，否则 S4 把 mention 写进 `slots` 时要多一张翻译表。
 */
export const NODE_MENTION_ROLES = [
  NODE_SLOT_IDS.firstFrame,
  NODE_SLOT_IDS.lastFrame,
  NODE_SLOT_IDS.voice,
  NODE_SLOT_IDS.reference,
] as const

export type NodeMentionRole = (typeof NODE_MENTION_ROLES)[number]

/**
 * 正文里能打出来的角色前缀 → 角色。**三语全收**：用户可能在 zh 界面里打英文
 * 前缀，也可能把 ja 写的正文粘进 zh 项目——解析靠一张固定表，⛔ 不靠当前 locale
 * （那会让同一段文字在不同界面语言下解析出不同的槽）。
 */
export const NODE_MENTION_ROLE_LABELS: Readonly<
  Record<string, NodeMentionRole>
> = {
  首帧: NODE_SLOT_IDS.firstFrame,
  尾帧: NODE_SLOT_IDS.lastFrame,
  语音: NODE_SLOT_IDS.voice,
  参考: NODE_SLOT_IDS.reference,
  開始フレーム: NODE_SLOT_IDS.firstFrame,
  終了フレーム: NODE_SLOT_IDS.lastFrame,
  音声: NODE_SLOT_IDS.voice,
  参照: NODE_SLOT_IDS.reference,
  first: NODE_SLOT_IDS.firstFrame,
  last: NODE_SLOT_IDS.lastFrame,
  voice: NODE_SLOT_IDS.voice,
  ref: NODE_SLOT_IDS.reference,
}

/**
 * 一条边**是怎么建出来的**（spec §8.2）。今天只有一档：`mention` = 正文里的
 * `@` 建的。
 *
 * ── 为什么边要记来路 ──────────────────────────────────────────────────
 * 「退格删 @ 即断槽」要求反向也成立：正文里没人指着的边该断。但手拖进首帧的那张
 * 图**没有** @ 指着它，若不分来路，第一次改正文就会把它一起删掉。所以 `@` 建的边
 * 打这个标，断槽只断打了标的那些。
 * ⛔ 不做成「所有边都记来路」：其余三条路（拖入 / 连线 / 助手 op）之间没有需要
 * 区分的行为，多一个字段就是多一处要同步的事实。
 */
export const NODE_EDGE_VIA_IDS = {
  mention: 'mention',
} as const

export const NODE_EDGE_VIAS = [NODE_EDGE_VIA_IDS.mention] as const

export type NodeEdgeVia = (typeof NODE_EDGE_VIAS)[number]
