'use client'

/**
 * 视频节点的**两张菜单**（spec §5，画板 `VideoPopover.dc.html` 右半 /
 * `VideoSelected.dc.html` 底注）：提示词栏 `+` 的添加菜单、工具条的「⋯」更多菜单。
 *
 * 两张都只是 `DropdownMenuItem` 的列表：壳（`NodePromptBar` / `NodeToolbar`）负责
 * 弹层与定位，⛔ 这里不自己写浮层。
 *
 * ⚠ 候选**只列有产物的卡**：挂一张还没生成出来的空卡到首帧上，生成时那一格发不
 * 出去，用户却以为已经挂好了。
 *
 * ⛔ 「设为参考」不在 ⋯ 里：视频子型换不了 —— op 表明写「video 的子型决定的是完全
 * 不同的槽位形状，换它等于换一张卡」（`node-assistant-op-apply-v4.ts` setSubtype）。
 * 要它得先给 op 表开这条路，不在本片。
 */

import Image from 'next/image'
import { useTranslations } from 'next-intl'
import {
  AudioLines,
  Check,
  Copy,
  Film,
  GalleryVerticalEnd,
  Clapperboard,
  Eye,
  ImageIcon,
  SquarePen,
  Trash2,
  Upload,
} from '@/components/icons'

import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from '@/components/ui/dropdown-menu'
import {
  VIDEO_RAIL_GROUP_IDS,
  type VideoRailGroupId,
} from '@/lib/video-node-rail'

import { useBrokenThumbs } from '../chrome/NodeMediaMissing'

/** 一张可以挂到槽上的卡。 */
export interface VideoSlotCandidate {
  readonly id: string
  readonly name: string
  readonly group: VideoRailGroupId
  readonly thumbnailUrl?: string | undefined
  readonly attached?: boolean
  readonly blockedReason?: string | undefined
}

export interface VideoAddMenuItemsProps {
  /**
   * 这张卡收不收参考。⚠ 不收参考的卡（退役的 `merge`）：不列「图 / 视频 / 语音」三组 —— 列了
   * 点下去只会报「这个节点没有这个入口」。
   */
  readonly acceptsRefs?: boolean
  readonly canvasCandidates: readonly VideoSlotCandidate[]
  onPickSlotSource(group: VideoRailGroupId, nodeId: string): void
  /** 由宿主按 MIME 将上传文件送进这张卡可接收的槽。 */
  onUpload(): void
  onLibrary(): void
}

export function VideoAddMenuItems({
  acceptsRefs = true,
  canvasCandidates,
  onPickSlotSource,
  onUpload,
  onLibrary,
}: VideoAddMenuItemsProps) {
  const tVideo = useTranslations('StudioNode.v4.video')
  const tNode = useTranslations('StudioNode.v4')
  const thumbs = useBrokenThumbs()
  return (
    <>
      <DropdownMenuItem
        data-video-add="upload"
        onSelect={onUpload}
        className="h-9.5 cursor-pointer gap-2.5 rounded-lg px-2.5 text-2sm text-foreground hover:bg-surface-fill focus:bg-surface-fill"
      >
        <Upload aria-hidden className="size-4" />
        {tVideo('add.upload')}
        <DropdownMenuShortcut className="font-mono text-2xs tracking-normal text-muted-foreground/75">
          ⌘U
        </DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem
        data-video-add="library"
        onSelect={onLibrary}
        className="h-9.5 cursor-pointer gap-2.5 rounded-lg px-2.5 text-2sm text-foreground hover:bg-surface-fill focus:bg-surface-fill"
      >
        <ImageIcon aria-hidden className="size-4" />
        {tVideo('add.library')}
      </DropdownMenuItem>
      {acceptsRefs ? (
        <>
          <div className="flex justify-between px-2.5 pt-2.5 pb-1.5 text-2xs tracking-wide text-muted-foreground">
            <span>{tNode('addCanvasTitle')}</span>
            <span>{tNode('addCanvasHint')}</span>
          </div>
          {canvasCandidates.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 px-2.5 pb-2">
              {canvasCandidates.map((candidate) => (
                <DropdownMenuItem
                  key={candidate.id}
                  data-video-slot-candidate={candidate.id}
                  data-attached={candidate.attached ? 'true' : undefined}
                  aria-label={tNode('addCanvasAttach', {
                    name: candidate.name,
                  })}
                  aria-disabled={Boolean(
                    candidate.blockedReason && !candidate.attached,
                  )}
                  title={
                    candidate.attached
                      ? candidate.name
                      : (candidate.blockedReason ?? candidate.name)
                  }
                  onSelect={(event) => {
                    if (candidate.attached) return
                    if (candidate.blockedReason) {
                      event.preventDefault()
                      return
                    }
                    onPickSlotSource(candidate.group, candidate.id)
                  }}
                  className={`relative size-12 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-fill p-0 text-muted-foreground focus:bg-surface-fill ${candidate.blockedReason && !candidate.attached ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:ring-2 hover:ring-foreground focus:ring-2 focus:ring-foreground'}`}
                >
                  {thumbs.usable(candidate.thumbnailUrl) ? (
                    <Image
                      src={candidate.thumbnailUrl!}
                      alt=""
                      width={48}
                      height={48}
                      unoptimized
                      onError={() => thumbs.markBroken(candidate.thumbnailUrl!)}
                      className="size-full object-cover"
                    />
                  ) : candidate.group === VIDEO_RAIL_GROUP_IDS.voice ? (
                    <AudioLines aria-hidden className="m-auto size-4" />
                  ) : candidate.group === VIDEO_RAIL_GROUP_IDS.video ? (
                    <Film aria-hidden className="m-auto size-4" />
                  ) : (
                    <ImageIcon aria-hidden className="m-auto size-4" />
                  )}
                  {candidate.attached ? (
                    <span className="absolute top-0.75 right-0.75 flex size-4 items-center justify-center rounded-full bg-foreground text-card">
                      <Check aria-hidden className="size-2.5" />
                    </span>
                  ) : null}
                </DropdownMenuItem>
              ))}
            </div>
          ) : (
            <div className="px-2.5 pb-2 text-xs text-muted-foreground/75">
              {tNode('addCanvasEmpty')}
            </div>
          )}
        </>
      ) : null}
    </>
  )
}

export interface VideoMoreMenuItemsProps {
  /**
   * 「快速看」（spec §5，2026-09-10 owner 真机反馈第四条把它从双击挪过来）——
   * 没片的卡不给这一项。空格键是它的第二条路。
   */
  onQuickLook?: (() => void) | undefined
  onRename(): void
  onDuplicate(): void
  /** 「拆出当前版本」—— 只有两版起才给（⛔ 不摆一个按了什么都不变的项）。 */
  onSplitVersion?: (() => void) | undefined
  /**
   * 「加入剪辑台」（spec §6「入口」第三条）：开全屏模式并把这张卡先落进 V 轨。
   *
   * ⚠ 卡上还没有片时这一项**灰掉不藏**（`addToEditDeskDisabled`）：藏起来会让人
   * 以为这张卡不支持剪辑台，而它只是还没生成出来。
   */
  onAddToEditDesk(): void
  readonly addToEditDeskDisabled?: boolean | undefined
  /**
   * 「来源」那一行只读小字 —— 当前版的 `source.label`（今天只有剪辑台成片会写，
   * `source.kind === 'render'`）。自己生成的那几版没有来源，整行不出。
   * ⚠ 与音频卡同一条规矩（`AudioMoreMenuItems`）：⛔ 不做成可点的项。
   */
  sourceLabel?: string | undefined
  onDelete(): void
}

export function VideoMoreMenuItems({
  onQuickLook,
  onRename,
  onDuplicate,
  onSplitVersion,
  onAddToEditDesk,
  addToEditDeskDisabled,
  sourceLabel,
  onDelete,
}: VideoMoreMenuItemsProps) {
  const tVideo = useTranslations('StudioNode.v4.video')
  return (
    <>
      {onQuickLook ? (
        <DropdownMenuItem data-video-more="quick-look" onSelect={onQuickLook}>
          <Eye aria-hidden className="size-4" />
          {tVideo('more.quickLook')}
        </DropdownMenuItem>
      ) : null}
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
      <DropdownMenuItem
        data-video-more="edit-desk"
        disabled={addToEditDeskDisabled ?? false}
        onSelect={onAddToEditDesk}
      >
        <Clapperboard aria-hidden className="size-4" />
        {tVideo('more.addToEditDesk')}
      </DropdownMenuItem>
      {sourceLabel ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel data-video-more="source">
            <span className="block text-3xs font-normal text-muted-foreground">
              {tVideo('more.source')}
            </span>
            <span className="block truncate text-2xs font-normal text-foreground">
              {sourceLabel}
            </span>
          </DropdownMenuLabel>
        </>
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
