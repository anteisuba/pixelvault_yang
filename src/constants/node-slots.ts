/**
 * v4 具名槽 · 端口表 · 连线矩阵（第三期 · 画布 C1）。
 * 依据 `docs/references/pages/node-canvas-v2.md` §3.2 端口表 / §3.3 合法矩阵。
 *
 * ── 为什么槽要单独成表 ────────────────────────────────────────────────
 * 现状每个节点**恒定一进一出、不分槽**（`NodeShell.tsx` 左右各一个 `Handle`），
 * 于是「这条边是首帧还是参考」只能靠下游收割逻辑猜。v4 把它写在边上（`edge.slot`）
 * 并在这里给出**唯一**的合法性判据：谁有哪些入口、每个入口收什么 kind、收几条。
 *
 * ── 一条贯穿的判断（§1.1）────────────────────────────────────────────
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
   * 入口槽，**自上而下就是这个数组的顺序**。⚠ §6 的自动排布要求「画布上左边那一摞
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

/** 每个 `kind.subtype` 的具名入口 / 出口（§3.2）。 */
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
    // 顺序 = §6 版式里源节点自上而下的顺序：首帧 → 尾帧 → 参考 → 语音 → 文本。
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
 * 这个槽走不走版本轮播（§1.4）。判据是**容量恰为 1**：`0..N` 的槽本来就是多值并列，
 * 轮播只对「只能有一个当前版、但历史版要留着」的槽有意义。
 */
export function slotSupportsVersions(spec: NodeSlotSpec): boolean {
  return spec.max === 1
}
