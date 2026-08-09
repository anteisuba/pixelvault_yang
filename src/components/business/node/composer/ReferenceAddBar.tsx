'use client'

import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  NODE_IMAGE_ROLE_IDS,
  NODE_TYPE_IDS,
  type NodeImageRole,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'

/**
 * ＋添加位 —— 从退役的 `ReferenceManagerPanel` 原样提取。
 *
 * ⚠ 它**不属于槽架**：`report §8.12` 的 composer 解剖把「＋参考」放在**能力 chip
 * 行**，腰带只回答「挂了什么、满没满、会不会发」。两件事混在一个组件里，正是旧件
 * 1084 行的由来。
 *
 * 逻辑一行未改：spawnReference / AssetSelectorDialog 通道不变。
 */

/** What the ＋添加位 hands back to the composer: which node type to autospawn,
 *  its image role, and which media library to open. The composer resolves an
 *  asset then calls `spawnReference`. */
export interface AddReferenceRequest {
  nodeType: NodeWorkflowNodeType
  role?: NodeImageRole
  mediaType: 'image' | 'voice' | 'video'
  /** Autospawn target override — defaults to the video node, but ＋配音 on a
   *  character row targets the CHARACTER node so the voice becomes its 音色. */
  targetNodeId?: string
}

interface AddSpawnConfig {
  nodeType: NodeWorkflowNodeType
  mediaType: 'image' | 'voice' | 'video'
  role?: NodeImageRole
}

export const ADD_SPAWN_CONFIG: Record<
  'character' | 'scene' | 'shotImage' | 'video' | 'voice',
  AddSpawnConfig
> = {
  character: {
    nodeType: NODE_TYPE_IDS.image,
    mediaType: 'image',
    role: NODE_IMAGE_ROLE_IDS.character,
  },
  scene: {
    nodeType: NODE_TYPE_IDS.image,
    mediaType: 'image',
    role: NODE_IMAGE_ROLE_IDS.background,
  },
  shotImage: {
    nodeType: NODE_TYPE_IDS.image,
    mediaType: 'image',
    role: NODE_IMAGE_ROLE_IDS.shot,
  },
  video: { nodeType: NODE_TYPE_IDS.videoReference, mediaType: 'video' },
  voice: { nodeType: NODE_TYPE_IDS.voice, mediaType: 'voice' },
}

/** 按媒体类型分三组（图片/音频/视频）；图片组内保留角色/场景/镜头图三个 role 化
 *  子按钮 —— 不因为「只剩三个添加位」就丢掉 role 区分，那会是真的功能倒退。 */
const ADD_GROUPS: ReadonlyArray<{
  key: 'image' | 'voice' | 'video'
  buttons: ReadonlyArray<{
    key: 'character' | 'scene' | 'shotImage' | 'video' | 'voice'
    config: AddSpawnConfig
  }>
}> = [
  {
    key: 'image',
    buttons: [
      { key: 'character', config: ADD_SPAWN_CONFIG.character },
      { key: 'scene', config: ADD_SPAWN_CONFIG.scene },
      { key: 'shotImage', config: ADD_SPAWN_CONFIG.shotImage },
    ],
  },
  { key: 'voice', buttons: [{ key: 'voice', config: ADD_SPAWN_CONFIG.voice }] },
  { key: 'video', buttons: [{ key: 'video', config: ADD_SPAWN_CONFIG.video }] },
]

export function ReferenceAddBar({
  availableMediaKinds,
  onAddReference,
}: {
  availableMediaKinds?: Readonly<Record<'image' | 'voice' | 'video', boolean>>
  onAddReference(request: AddReferenceRequest): void
}) {
  const tc = useTranslations('StudioNode.videoComposer')

  const fire = (config: AddSpawnConfig) =>
    onAddReference({
      nodeType: config.nodeType,
      role: config.role,
      mediaType: config.mediaType,
    })

  return (
    <div className="space-y-1.5">
      {ADD_GROUPS.filter(
        (group) => availableMediaKinds?.[group.key] ?? true,
      ).map((group) => (
        <div key={group.key} className="flex flex-wrap items-center gap-1.5">
          <span className="text-3xs font-semibold uppercase tracking-nav-dense text-node-subtle">
            {tc(`references.addGroups.${group.key}`)}
          </span>
          {group.buttons.map((button) => (
            <button
              key={button.key}
              type="button"
              onClick={() => fire(button.config)}
              className="nodrag flex items-center gap-1 rounded-full border border-dashed border-node-panel-inner px-2 py-1 text-2xs font-semibold text-node-muted transition-colors hover:border-node-edge hover:text-node-foreground"
            >
              <Plus className="size-3" />
              {tc(`references.addButtons.${button.key}`)}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}
