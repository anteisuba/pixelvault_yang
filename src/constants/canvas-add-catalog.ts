import {
  NODE_IMAGE_ROLE_IDS,
  NODE_MEDIA_KIND_IDS,
  NODE_TYPE_IDS,
  NODE_V4_AUDIO_SUBTYPE_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
  NODE_V4_TEXT_SUBTYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
  type NodeImageRole,
  type NodeV4Subtype,
  type NodeWorkflowMediaKind,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'

export const CANVAS_ADD_GROUP_IDS = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  organize: 'organize',
} as const

export type CanvasAddGroupId =
  (typeof CANVAS_ADD_GROUP_IDS)[keyof typeof CANVAS_ADD_GROUP_IDS]

/**
 * ⚠ 这里**没有** `imageKeyframe`（2026-08-09 退役，owner 拍板「连根拔」）。
 *
 * 那一项建出来的是 `image` + `role: frame` —— 一个**带不了首/尾语义**的关键帧：
 * 该族的详情面板没有分类下拉，无媒体时也没有任何 UI 能标，于是两张关键帧接进
 * 同一个视频时，发给模型的图例双双自称「首帧」（`resolveKeyframeLegendCategory`
 * 的兜底）。语义的唯一载体是 `imageCategory`（frameStart / frameEnd），所以造得
 * 出「注定没有分类的关键帧」的入口本身就是双轨的根。
 *
 * 替代路径今天就能走：**加一张「图片素材」→ ⤢ 详情面板的分类下拉选「首帧 / 尾帧」**
 * （`LooseImageDetailBody` 的那颗下拉无媒体也渲染）。
 *
 * 存量 `role: frame` / 旧 `frameImage` 节点仍被 `isKeyframeNode` 认作关键帧、
 * 照旧发送 —— 这一刀只关创建口，不动存量图。
 */
export const CANVAS_ADD_INTENT_IDS = {
  imageAsset: 'image.asset',
  imageShot: 'image.shot',
  videoGenerate: 'video.generate',
  videoReference: 'video.reference',
  videoMerge: 'video.merge',
  /**
   * 手动镜头文本（2026-08-02）。此前 shotText **只由剧本笺投影产出**，加号菜单
   * 有意不暴露它。owner 拍板「助手这边只是自动生成，不用助手则用户手动输入然后
   * 生成 —— 是一种东西」后，手动这条路必须有入口。
   * 手工建的节点没有 `scriptRef`，因此不受投影管辖（投影的孤儿清扫只认有 ref
   * 的节点），字段就存在它自己身上。
   */
  videoShotText: 'video.shot-text',
  audioVoiceProfile: 'audio.voice-profile',
  organizeCharacter: 'organize.character',
  organizeScene: 'organize.scene',
} as const

export type CanvasAddIntentId =
  (typeof CANVAS_ADD_INTENT_IDS)[keyof typeof CANVAS_ADD_INTENT_IDS]

export interface CanvasAddCatalogItem {
  id: CanvasAddIntentId
  group: CanvasAddGroupId
  labelKey:
    | 'imageAsset'
    | 'imageShot'
    | 'videoGenerate'
    | 'videoReference'
    | 'videoMerge'
    | 'videoShotText'
    | 'audioVoiceProfile'
    | 'organizeCharacter'
    | 'organizeScene'
  nodeType: NodeWorkflowNodeType
  role?: NodeImageRole
  /**
   * 这一项**应该**落成的 v4 身份（node-canvas-v2 §1）。
   *
   * ⚠ 真机 ②：菜单里选「镜头图」落成了 `image.result` —— 加号菜单说的是 legacy
   * 词表（type + role），v4 身份是另一头按 role 推的，两边没有任何东西把它们钉在
   * 一起，推错了也没人喊。这一栏就是那颗钉子：`NODE_V4_SUBTYPE_LABELS` 的键
   * （`${kind}.${subtype}`）在这里写死，建点路径落出来的身份必须与它逐项相等
   * （见 `use-node-workflow.test.ts` 的词表守卫用例）。
   */
  v4: { kind: NodeWorkflowMediaKind; subtype: NodeV4Subtype }
}

export interface CanvasAddCatalogGroup {
  id: CanvasAddGroupId
  items: readonly CanvasAddCatalogItem[]
}

const CATALOG_ITEMS: readonly CanvasAddCatalogItem[] = [
  {
    id: CANVAS_ADD_INTENT_IDS.imageAsset,
    group: CANVAS_ADD_GROUP_IDS.image,
    labelKey: 'imageAsset',
    nodeType: NODE_TYPE_IDS.image,
    v4: {
      kind: NODE_MEDIA_KIND_IDS.image,
      subtype: NODE_V4_IMAGE_SUBTYPE_IDS.result,
    },
  },
  {
    id: CANVAS_ADD_INTENT_IDS.imageShot,
    group: CANVAS_ADD_GROUP_IDS.image,
    labelKey: 'imageShot',
    nodeType: NODE_TYPE_IDS.image,
    role: NODE_IMAGE_ROLE_IDS.shot,
    v4: {
      kind: NODE_MEDIA_KIND_IDS.image,
      subtype: NODE_V4_IMAGE_SUBTYPE_IDS.shot,
    },
  },
  {
    id: CANVAS_ADD_INTENT_IDS.videoGenerate,
    group: CANVAS_ADD_GROUP_IDS.video,
    labelKey: 'videoGenerate',
    nodeType: NODE_TYPE_IDS.seedance,
    v4: {
      kind: NODE_MEDIA_KIND_IDS.video,
      subtype: NODE_V4_VIDEO_SUBTYPE_IDS.shot,
    },
  },
  {
    id: CANVAS_ADD_INTENT_IDS.videoReference,
    group: CANVAS_ADD_GROUP_IDS.video,
    labelKey: 'videoReference',
    nodeType: NODE_TYPE_IDS.videoReference,
    v4: {
      kind: NODE_MEDIA_KIND_IDS.video,
      subtype: NODE_V4_VIDEO_SUBTYPE_IDS.clip,
    },
  },
  {
    id: CANVAS_ADD_INTENT_IDS.videoShotText,
    group: CANVAS_ADD_GROUP_IDS.video,
    labelKey: 'videoShotText',
    nodeType: NODE_TYPE_IDS.shotText,
    // 手工建的镜头文本没有 `scriptRef` → v4 身份是 `text.script`（剧本），
    // 不是 `text.shotNote`（那是剧本笺投影出来的）。
    v4: {
      kind: NODE_MEDIA_KIND_IDS.text,
      subtype: NODE_V4_TEXT_SUBTYPE_IDS.script,
    },
  },
  {
    id: CANVAS_ADD_INTENT_IDS.videoMerge,
    group: CANVAS_ADD_GROUP_IDS.video,
    labelKey: 'videoMerge',
    nodeType: NODE_TYPE_IDS.videoMerge,
    v4: {
      kind: NODE_MEDIA_KIND_IDS.video,
      subtype: NODE_V4_VIDEO_SUBTYPE_IDS.merge,
    },
  },
  {
    id: CANVAS_ADD_INTENT_IDS.audioVoiceProfile,
    group: CANVAS_ADD_GROUP_IDS.audio,
    labelKey: 'audioVoiceProfile',
    nodeType: NODE_TYPE_IDS.voice,
    v4: {
      kind: NODE_MEDIA_KIND_IDS.audio,
      subtype: NODE_V4_AUDIO_SUBTYPE_IDS.voice,
    },
  },
  {
    id: CANVAS_ADD_INTENT_IDS.organizeCharacter,
    group: CANVAS_ADD_GROUP_IDS.organize,
    labelKey: 'organizeCharacter',
    nodeType: NODE_TYPE_IDS.image,
    role: NODE_IMAGE_ROLE_IDS.character,
    v4: {
      kind: NODE_MEDIA_KIND_IDS.image,
      subtype: NODE_V4_IMAGE_SUBTYPE_IDS.character,
    },
  },
  {
    id: CANVAS_ADD_INTENT_IDS.organizeScene,
    group: CANVAS_ADD_GROUP_IDS.organize,
    labelKey: 'organizeScene',
    nodeType: NODE_TYPE_IDS.image,
    role: NODE_IMAGE_ROLE_IDS.background,
    v4: {
      kind: NODE_MEDIA_KIND_IDS.image,
      subtype: NODE_V4_IMAGE_SUBTYPE_IDS.background,
    },
  },
] as const

export const CANVAS_ADD_CATALOG: readonly CanvasAddCatalogGroup[] = [
  {
    id: CANVAS_ADD_GROUP_IDS.image,
    items: CATALOG_ITEMS.filter(
      (item) => item.group === CANVAS_ADD_GROUP_IDS.image,
    ),
  },
  {
    id: CANVAS_ADD_GROUP_IDS.video,
    items: CATALOG_ITEMS.filter(
      (item) => item.group === CANVAS_ADD_GROUP_IDS.video,
    ),
  },
  {
    id: CANVAS_ADD_GROUP_IDS.audio,
    items: CATALOG_ITEMS.filter(
      (item) => item.group === CANVAS_ADD_GROUP_IDS.audio,
    ),
  },
  {
    id: CANVAS_ADD_GROUP_IDS.organize,
    items: CATALOG_ITEMS.filter(
      (item) => item.group === CANVAS_ADD_GROUP_IDS.organize,
    ),
  },
] as const

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
