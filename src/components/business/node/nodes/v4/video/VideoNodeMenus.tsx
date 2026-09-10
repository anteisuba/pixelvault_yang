'use client'

/**
 * 视频节点的**两张菜单**（spec §5，画板 `VideoPopover.dc.html` 右半 /
 * `VideoSelected.dc.html` 底注）：提示词栏 `+` 的添加菜单、工具条的「⋯」更多菜单。
 *
 * 两张都只是 `DropdownMenuItem` 的列表：壳（`NodePromptBar` / `NodeToolbar`）负责
 * 弹层与定位，⛔ 这里不自己写浮层。
 *
 * ── `+` 里那三组为什么是子菜单 ────────────────────────────────────────
 * 2026-09-10 owner 定稿把四个槽子菜单收成**与参考轨一样的三组**（图 · 视频 ·
 * 语音）：首帧 / 尾帧不再是入口，它们是图的**角色**，挂上去之后在轨上点图改。
 * 每一组展开仍是**候选卡 + 上传**，⛔ 不是一个直接弹文件选择框的按钮 —— 那会把
 * 「画布上已经有那张图」这条主路径埋掉。
 *
 * ⚠ 候选**只列有产物的卡**：挂一张还没生成出来的空卡到首帧上，生成时那一格发不
 * 出去，用户却以为已经挂好了。
 *
 * ⛔ 「设为参考」不在 ⋯ 里：视频子型换不了 —— op 表明写「video 的子型决定的是完全
 * 不同的槽位形状，换它等于换一张卡」（`node-assistant-op-apply-v4.ts` setSubtype）。
 * 要它得先给 op 表开这条路，不在本片。
 */

import { useTranslations } from 'next-intl'
import {
  AtSign,
  Copy,
  Film,
  GalleryVerticalEnd,
  Library,
  Mic,
  PictureInPicture2,
  Scissors,
  SquarePen,
  Trash2,
  Upload,
} from 'lucide-react'

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { NODE_SLOT_IDS } from '@/constants/node-slots'
import {
  VIDEO_RAIL_GROUP_IDS,
  type VideoRailGroupId,
} from '@/lib/video-node-rail'

/** 一张可以挂到槽上的卡。 */
export interface VideoSlotCandidate {
  readonly id: string
  readonly name: string
}

/**
 * `+` 里那三组的顺序、落点与图标 —— **与参考轨同一份顺序**（图 · 视频 · 语音）。
 * 落点：图 / 视频都进 `reference`（图默认作参考），语音进 `voice`。
 */
export const VIDEO_RAIL_PICKERS = [
  {
    group: VIDEO_RAIL_GROUP_IDS.image,
    slot: NODE_SLOT_IDS.reference,
    icon: PictureInPicture2,
  },
  {
    group: VIDEO_RAIL_GROUP_IDS.video,
    slot: NODE_SLOT_IDS.reference,
    icon: Film,
  },
  { group: VIDEO_RAIL_GROUP_IDS.voice, slot: NODE_SLOT_IDS.voice, icon: Mic },
] as const

export interface VideoAddMenuItemsProps {
  candidatesOf(group: VideoRailGroupId): readonly VideoSlotCandidate[]
  onPickSlotSource(group: VideoRailGroupId, nodeId: string): void
  /** 上传一份新素材并落进这一组（kind 由组决定）。 */
  onUploadForSlot(group: VideoRailGroupId): void
  /** 「上传视频 / 图」—— 落进这张卡自己（成片或封面），⛔ 不落槽。 */
  onUpload(): void
  onMention(): void
  onLibrary(): void
}

export function VideoAddMenuItems({
  candidatesOf,
  onPickSlotSource,
  onUploadForSlot,
  onUpload,
  onMention,
  onLibrary,
}: VideoAddMenuItemsProps) {
  const tVideo = useTranslations('StudioNode.v4.video')
  return (
    <>
      <DropdownMenuItem data-video-add="upload" onSelect={onUpload}>
        <Upload aria-hidden className="size-4" />
        {tVideo('add.upload')}
      </DropdownMenuItem>
      {VIDEO_RAIL_PICKERS.map(({ group, icon: Icon }) => {
        const candidates = candidatesOf(group)
        return (
          <DropdownMenuSub key={group}>
            <DropdownMenuSubTrigger data-video-add-group={group}>
              <Icon aria-hidden className="size-4" />
              {tVideo(`rail.group.${group}`)}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {candidates.map((candidate) => (
                <DropdownMenuItem
                  key={candidate.id}
                  data-video-slot-candidate={candidate.id}
                  onSelect={() => onPickSlotSource(group, candidate.id)}
                >
                  {candidate.name}
                </DropdownMenuItem>
              ))}
              {candidates.length > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem
                data-video-slot-upload={group}
                onSelect={() => onUploadForSlot(group)}
              >
                <Upload aria-hidden className="size-4" />
                {tVideo('add.uploadForSlot')}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )
      })}
      <DropdownMenuItem data-video-add="mention" onSelect={onMention}>
        <AtSign aria-hidden className="size-4" />
        {tVideo('add.mention')}
      </DropdownMenuItem>
      <DropdownMenuItem data-video-add="library" onSelect={onLibrary}>
        <Library aria-hidden className="size-4" />
        {tVideo('add.library')}
      </DropdownMenuItem>
    </>
  )
}

export interface VideoMoreMenuItemsProps {
  onRename(): void
  onDuplicate(): void
  /** 「拆出当前版本」—— 只有两版起才给（⛔ 不摆一个按了什么都不变的项）。 */
  onSplitVersion?: (() => void) | undefined
  onDelete(): void
}

export function VideoMoreMenuItems({
  onRename,
  onDuplicate,
  onSplitVersion,
  onDelete,
}: VideoMoreMenuItemsProps) {
  const tVideo = useTranslations('StudioNode.v4.video')
  return (
    <>
      <DropdownMenuItem data-video-more="rename" onSelect={onRename}>
        <SquarePen aria-hidden className="size-4" />
        {tVideo('more.rename')}
      </DropdownMenuItem>
      {/* ⋯ 的文案按**这一类卡**写（S5c 尾项）。⛔ 共用键的语义不动。 */}
      <DropdownMenuItem data-video-more="duplicate" onSelect={onDuplicate}>
        <Copy aria-hidden className="size-4" />
        {tVideo('more.duplicate')}
      </DropdownMenuItem>
      {onSplitVersion ? (
        <DropdownMenuItem data-video-more="split" onSelect={onSplitVersion}>
          <GalleryVerticalEnd aria-hidden className="size-4" />
          {tVideo('more.splitVersion')}
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        data-video-more="delete"
        variant="destructive"
        onSelect={onDelete}
      >
        <Trash2 aria-hidden className="size-4" />
        {tVideo('more.delete')}
      </DropdownMenuItem>
    </>
  )
}

/** 工具条「抽帧」那颗键的图标 —— 与菜单里同一套 lucide 词表，⛔ 不各挑各的。 */
export const VIDEO_EXTRACT_ICON = Scissors
