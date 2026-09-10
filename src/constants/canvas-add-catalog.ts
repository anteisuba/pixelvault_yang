import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_AUDIO_SUBTYPE_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
  NODE_V4_TEXT_SUBTYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
  type NodeV4Subtype,
  type NodeWorkflowMediaKind,
} from '@/constants/node-types'

/**
 * ＋添加 菜单的**词表**（C3c-③d-4 按 8e-9 重组）。
 *
 * ── 分组就是 v4 的四类 ──────────────────────────────────────────────────
 * 文本 / 图片 / 声音 / 视频。⛔ 不再有 `organize` 那一组 —— 它是 v3 时代「角色卡
 * 与场景卡不是图片，是组织手段」的说法，而 v4 里角色和背景**就是** `image` 的两个
 * 子型（`image.character` / `image.background`）。把它们从图片组里拆出去，用户在
 * 「我要加一张角色图」时要先想明白这算图片还是组织。
 *
 * ── 每一项就是一个 v4 身份 ──────────────────────────────────────────────
 * `{kind, subtype}` 是这一项的**全部**定义。v3 的 `nodeType` / `role` 两栏随翻转
 * 删掉：菜单曾经说 legacy 词表、v4 身份在另一头按 role 推，两边没有东西钉在一起，
 * 推错了也没人喊（真机 ②「选镜头图落成了 result」）。现在没有第二头可推。
 *
 * ── 文案 ────────────────────────────────────────────────────────────────
 * 走 i18n（`StudioNode.addCatalog.<labelKey>`），⛔ 不拿 `NODE_V4_SUBTYPE_LABELS`
 * 当文案：那张表是**稳定名**的构件（`buildStableNodeName` 用它拼「镜头图 3」这类
 * id 化的名字），它一改，存量节点的名字就跟着漂。
 *
 * ⚠ 这里**没有**「关键帧」项（2026-08-09 退役，owner 拍板「连根拔」）：首/尾帧不是
 * 一种节点，而是一张图**连进镜头的哪个口**（`firstFrame` / `lastFrame` 槽）。造得出
 * 「注定没有槽的关键帧」的入口本身就是双轨的根。
 */

export const CANVAS_ADD_GROUP_IDS = {
  text: 'text',
  image: 'image',
  audio: 'audio',
  video: 'video',
} as const

export type CanvasAddGroupId =
  (typeof CANVAS_ADD_GROUP_IDS)[keyof typeof CANVAS_ADD_GROUP_IDS]

/**
 * 意图 id = `<kind>.<subtype>`。
 *
 * ⚠ 它同时是**助手 `add_node` 的载荷词表**（见 `node-assistant-ops`），所以形状要
 * 让模型一眼读得懂它建的是什么，⛔ 不用 `organize.scene` 这种只有我们自己懂的内部
 * 分类（真机抓到过：模型要「背景节点」时选了散图）。
 */
export const CANVAS_ADD_INTENT_IDS = {
  textScript: 'text.script',
  textRule: 'text.rule',
  textNote: 'text.note',
  imageShot: 'image.shot',
  imageCharacter: 'image.character',
  imageBackground: 'image.background',
  imageResult: 'image.result',
  audioVoice: 'audio.voice',
  audioTimbre: 'audio.timbre',
  videoShot: 'video.shot',
  videoClip: 'video.clip',
} as const

export type CanvasAddIntentId =
  (typeof CANVAS_ADD_INTENT_IDS)[keyof typeof CANVAS_ADD_INTENT_IDS]

export type CanvasAddLabelKey =
  | 'textScript'
  | 'textRule'
  | 'textNote'
  | 'imageShot'
  | 'imageCharacter'
  | 'imageBackground'
  | 'imageResult'
  | 'audioVoice'
  | 'audioTimbre'
  | 'videoShot'
  | 'videoClip'

export interface CanvasAddCatalogItem {
  id: CanvasAddIntentId
  group: CanvasAddGroupId
  labelKey: CanvasAddLabelKey
  /** 这一项落成的 v4 身份 —— 这一栏就是它的**全部**定义。 */
  v4: { kind: NodeWorkflowMediaKind; subtype: NodeV4Subtype }
}

export interface CanvasAddCatalogGroup {
  id: CanvasAddGroupId
  items: readonly CanvasAddCatalogItem[]
}

const CATALOG_ITEMS: readonly CanvasAddCatalogItem[] = [
  {
    id: CANVAS_ADD_INTENT_IDS.textScript,
    group: CANVAS_ADD_GROUP_IDS.text,
    labelKey: 'textScript',
    v4: {
      kind: NODE_MEDIA_KIND_IDS.text,
      subtype: NODE_V4_TEXT_SUBTYPE_IDS.script,
    },
  },
  {
    id: CANVAS_ADD_INTENT_IDS.textRule,
    group: CANVAS_ADD_GROUP_IDS.text,
    labelKey: 'textRule',
    v4: {
      kind: NODE_MEDIA_KIND_IDS.text,
      subtype: NODE_V4_TEXT_SUBTYPE_IDS.rule,
    },
  },
  {
    id: CANVAS_ADD_INTENT_IDS.textNote,
    group: CANVAS_ADD_GROUP_IDS.text,
    labelKey: 'textNote',
    v4: {
      kind: NODE_MEDIA_KIND_IDS.text,
      subtype: NODE_V4_TEXT_SUBTYPE_IDS.shotNote,
    },
  },
  {
    id: CANVAS_ADD_INTENT_IDS.imageShot,
    group: CANVAS_ADD_GROUP_IDS.image,
    labelKey: 'imageShot',
    v4: {
      kind: NODE_MEDIA_KIND_IDS.image,
      subtype: NODE_V4_IMAGE_SUBTYPE_IDS.shot,
    },
  },
  {
    id: CANVAS_ADD_INTENT_IDS.imageCharacter,
    group: CANVAS_ADD_GROUP_IDS.image,
    labelKey: 'imageCharacter',
    v4: {
      kind: NODE_MEDIA_KIND_IDS.image,
      subtype: NODE_V4_IMAGE_SUBTYPE_IDS.character,
    },
  },
  {
    id: CANVAS_ADD_INTENT_IDS.imageBackground,
    group: CANVAS_ADD_GROUP_IDS.image,
    labelKey: 'imageBackground',
    v4: {
      kind: NODE_MEDIA_KIND_IDS.image,
      subtype: NODE_V4_IMAGE_SUBTYPE_IDS.background,
    },
  },
  {
    id: CANVAS_ADD_INTENT_IDS.imageResult,
    group: CANVAS_ADD_GROUP_IDS.image,
    labelKey: 'imageResult',
    v4: {
      kind: NODE_MEDIA_KIND_IDS.image,
      subtype: NODE_V4_IMAGE_SUBTYPE_IDS.result,
    },
  },
  {
    id: CANVAS_ADD_INTENT_IDS.audioVoice,
    group: CANVAS_ADD_GROUP_IDS.audio,
    labelKey: 'audioVoice',
    v4: {
      kind: NODE_MEDIA_KIND_IDS.audio,
      subtype: NODE_V4_AUDIO_SUBTYPE_IDS.voice,
    },
  },
  {
    id: CANVAS_ADD_INTENT_IDS.audioTimbre,
    group: CANVAS_ADD_GROUP_IDS.audio,
    labelKey: 'audioTimbre',
    // 「音色」建出来的仍是一个 `audio.voice` 节点 —— 音色是它的**用法**（连进
    // `timbre` 口），不是第四个子型。⛔ 不为一个用法造一个子型。
    v4: {
      kind: NODE_MEDIA_KIND_IDS.audio,
      subtype: NODE_V4_AUDIO_SUBTYPE_IDS.voice,
    },
  },
  {
    id: CANVAS_ADD_INTENT_IDS.videoShot,
    group: CANVAS_ADD_GROUP_IDS.video,
    labelKey: 'videoShot',
    v4: {
      kind: NODE_MEDIA_KIND_IDS.video,
      subtype: NODE_V4_VIDEO_SUBTYPE_IDS.shot,
    },
  },
  {
    id: CANVAS_ADD_INTENT_IDS.videoClip,
    group: CANVAS_ADD_GROUP_IDS.video,
    labelKey: 'videoClip',
    v4: {
      kind: NODE_MEDIA_KIND_IDS.video,
      subtype: NODE_V4_VIDEO_SUBTYPE_IDS.clip,
    },
  },
] as const

/** 分组顺序 = 依赖顺序：先有字，再有图，再有声，最后合成动的。 */
const GROUP_ORDER: readonly CanvasAddGroupId[] = [
  CANVAS_ADD_GROUP_IDS.text,
  CANVAS_ADD_GROUP_IDS.image,
  CANVAS_ADD_GROUP_IDS.audio,
  CANVAS_ADD_GROUP_IDS.video,
]

export const CANVAS_ADD_CATALOG: readonly CanvasAddCatalogGroup[] =
  GROUP_ORDER.map((id) => ({
    id,
    items: CATALOG_ITEMS.filter((item) => item.group === id),
  }))

const CATALOG_ITEM_BY_ID = new Map(
  CATALOG_ITEMS.map((item) => [item.id, item] as const),
)

export function getCanvasAddCatalogItem(
  intentId: CanvasAddIntentId,
): CanvasAddCatalogItem {
  const item = CATALOG_ITEM_BY_ID.get(intentId)
  if (!item) {
    throw new Error(`Unknown canvas add intent: ${intentId}`)
  }
  return item
}

const CATALOG_ITEM_BY_V4 = new Map(
  CATALOG_ITEMS.map((item) => [`${item.v4.kind}.${item.v4.subtype}`, item]),
)

/**
 * v4 身份 → 添加菜单里的那一项（③e 提案卡用它取「新建了什么」的说法）。
 *
 * ⚠ 找不到时返回 `undefined` 而不是抛：助手的 `add_node` 收的是**全部** kind ×
 * subtype 组合，而菜单只摆了其中 12 项（`image.reference` 这类只由派生产生，
 * 菜单里没有）。抛错会让整张对话白屏，缺一个词只是少一个更好听的说法。
 */
export function findCanvasAddCatalogItemByV4(
  kind: NodeWorkflowMediaKind,
  subtype: NodeV4Subtype,
): CanvasAddCatalogItem | undefined {
  return CATALOG_ITEM_BY_V4.get(`${kind}.${subtype}`)
}
