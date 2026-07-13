import {
  NODE_IMAGE_ROLE_IDS,
  NODE_TYPE_IDS,
  type NodeImageRole,
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

export const CANVAS_ADD_INTENT_IDS = {
  imageAsset: 'image.asset',
  imageShot: 'image.shot',
  imageKeyframe: 'image.keyframe',
  videoGenerate: 'video.generate',
  videoReference: 'video.reference',
  videoMerge: 'video.merge',
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
    | 'imageKeyframe'
    | 'videoGenerate'
    | 'videoReference'
    | 'videoMerge'
    | 'audioVoiceProfile'
    | 'organizeCharacter'
    | 'organizeScene'
  nodeType: NodeWorkflowNodeType
  role?: NodeImageRole
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
  },
  {
    id: CANVAS_ADD_INTENT_IDS.imageShot,
    group: CANVAS_ADD_GROUP_IDS.image,
    labelKey: 'imageShot',
    nodeType: NODE_TYPE_IDS.image,
    role: NODE_IMAGE_ROLE_IDS.shot,
  },
  {
    id: CANVAS_ADD_INTENT_IDS.imageKeyframe,
    group: CANVAS_ADD_GROUP_IDS.image,
    labelKey: 'imageKeyframe',
    nodeType: NODE_TYPE_IDS.image,
    role: NODE_IMAGE_ROLE_IDS.frame,
  },
  {
    id: CANVAS_ADD_INTENT_IDS.videoGenerate,
    group: CANVAS_ADD_GROUP_IDS.video,
    labelKey: 'videoGenerate',
    nodeType: NODE_TYPE_IDS.seedance,
  },
  {
    id: CANVAS_ADD_INTENT_IDS.videoReference,
    group: CANVAS_ADD_GROUP_IDS.video,
    labelKey: 'videoReference',
    nodeType: NODE_TYPE_IDS.videoReference,
  },
  {
    id: CANVAS_ADD_INTENT_IDS.videoMerge,
    group: CANVAS_ADD_GROUP_IDS.video,
    labelKey: 'videoMerge',
    nodeType: NODE_TYPE_IDS.videoMerge,
  },
  {
    id: CANVAS_ADD_INTENT_IDS.audioVoiceProfile,
    group: CANVAS_ADD_GROUP_IDS.audio,
    labelKey: 'audioVoiceProfile',
    nodeType: NODE_TYPE_IDS.voice,
  },
  {
    id: CANVAS_ADD_INTENT_IDS.organizeCharacter,
    group: CANVAS_ADD_GROUP_IDS.organize,
    labelKey: 'organizeCharacter',
    nodeType: NODE_TYPE_IDS.image,
    role: NODE_IMAGE_ROLE_IDS.character,
  },
  {
    id: CANVAS_ADD_INTENT_IDS.organizeScene,
    group: CANVAS_ADD_GROUP_IDS.organize,
    labelKey: 'organizeScene',
    nodeType: NODE_TYPE_IDS.image,
    role: NODE_IMAGE_ROLE_IDS.background,
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
