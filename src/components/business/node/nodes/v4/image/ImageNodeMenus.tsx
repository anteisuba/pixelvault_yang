'use client'

/**
 * 图片节点的**三张菜单**（spec §3，画板 `ImageToolbar.dc.html` / `ImageStates.dc.html`）：
 * 工具条的「编辑」子菜单、「⋯」更多菜单、提示词栏 `+` 的添加菜单。
 *
 * 三张都只是 `DropdownMenuItem` 的**列表**：壳（`NodeToolbar` / `NodePromptBar`）
 * 负责弹层与定位，⛔ 这里不自己写浮层。
 *
 * ── 编辑子菜单接的是**现有**图片编辑（⛔ 不新写一套）─────────────────────
 * 四项映射到 `READY_CANVAS_IMAGE_EDIT_CAPABILITY_IDS` 里已经跑得通的四条能力，
 * 宿主是既有的 `CanvasImageEditWorkspace`（它把结果落成派生节点并聚焦过去）。
 * ⚠ 「扩图」在能力表里没有独立条目，最接近的是 `upscale`；真正的 outpaint 要等
 * 能力表补，⛔ 不在这里假装它已经有了。
 */

import { useTranslations } from 'next-intl'
import {
  Copy,
  Crop,
  Image as ImageIcon,
  Layers,
  Library,
  Paintbrush,
  Pencil,
  Scissors,
  Trash2,
  Upload,
  UserRound,
} from 'lucide-react'

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import type { ReadyCanvasImageEditCapabilityId } from '@/types/canvas-image-edit'

/** 编辑子菜单的四项 → 现有能力 id。⛔ 值域不自己造，来自 `canvas-image-edit`。 */
export const IMAGE_EDIT_MENU_TASKS: readonly {
  readonly id: string
  readonly task: ReadyCanvasImageEditCapabilityId
}[] = [
  { id: 'inpaint', task: 'inpaint' },
  { id: 'expand', task: 'upscale' },
  { id: 'cutout', task: 'remove-background' },
  { id: 'background', task: 'object-replace' },
]

const EDIT_ICONS = {
  inpaint: Paintbrush,
  expand: Crop,
  cutout: Layers,
  background: ImageIcon,
} as const

export function ImageEditMenuItems({
  onPick,
}: {
  onPick(task: ReadyCanvasImageEditCapabilityId): void
}) {
  const t = useTranslations('StudioNode.v4.image')
  return (
    <>
      {IMAGE_EDIT_MENU_TASKS.map(({ id, task }) => {
        const Icon = EDIT_ICONS[id as keyof typeof EDIT_ICONS]
        return (
          <DropdownMenuItem
            key={id}
            data-image-edit-task={id}
            onSelect={() => onPick(task)}
          >
            <Icon aria-hidden className="size-4" />
            {t(`edit.${id}`)}
          </DropdownMenuItem>
        )
      })}
    </>
  )
}

export function ImageMoreMenuItems({
  onRename,
  onDuplicate,
  onSplitVersion,
  onSetCharacter,
  onDelete,
}: {
  onRename(): void
  onDuplicate(): void
  /** 「拆出当前版本」（spec §3）。⚠ 只有一版时调用方传 `undefined`（拆无可拆）。 */
  onSplitVersion?: (() => void) | undefined
  /**
   * 「设为角色卡」。⚠ 已经是角色卡的那张不给这一项 —— 调用方传 `undefined`，
   * ⛔ 不摆一个按了什么都不变的灰项。
   */
  onSetCharacter?: (() => void) | undefined
  onDelete(): void
}) {
  const tImage = useTranslations('StudioNode.v4.image')
  return (
    <>
      {/* ⋯ 的文案按**这一类卡**写（S5c 尾项）。⛔ 共用键的语义不动。 */}
      <DropdownMenuItem data-image-more="rename" onSelect={onRename}>
        <Pencil aria-hidden className="size-4" />
        {tImage('more.rename')}
      </DropdownMenuItem>
      <DropdownMenuItem data-image-more="duplicate" onSelect={onDuplicate}>
        <Copy aria-hidden className="size-4" />
        {tImage('more.duplicate')}
      </DropdownMenuItem>
      {onSplitVersion ? (
        <DropdownMenuItem data-image-more="split" onSelect={onSplitVersion}>
          <Scissors aria-hidden className="size-4" />
          {tImage('more.splitVersion')}
        </DropdownMenuItem>
      ) : null}
      {onSetCharacter ? (
        <DropdownMenuItem
          data-image-more="set-character"
          onSelect={onSetCharacter}
        >
          <UserRound aria-hidden className="size-4" />
          {tImage('more.setCharacter')}
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        data-image-more="delete"
        variant="destructive"
        onSelect={onDelete}
      >
        <Trash2 aria-hidden className="size-4" />
        {tImage('more.delete')}
      </DropdownMenuItem>
    </>
  )
}

export function ImageAddMenuItems({
  onUpload,
  onMention,
  onLibrary,
  canvasCandidates,
  onPickCanvas,
}: {
  onUpload(): void
  onMention(): void
  onLibrary(): void
  /** 画布上已有产物的图（生成的 / 上传的），挂进参考槽。 */
  readonly canvasCandidates?: readonly {
    readonly id: string
    readonly name: string
  }[]
  onPickCanvas?(nodeId: string): void
}) {
  const t = useTranslations('StudioNode.v4.image')
  const canvas = canvasCandidates ?? []
  return (
    <>
      <DropdownMenuItem data-image-add="upload" onSelect={onUpload}>
        <Upload aria-hidden className="size-4" />
        {t('add.upload')}
      </DropdownMenuItem>
      <DropdownMenuItem data-image-add="mention" onSelect={onMention}>
        <UserRound aria-hidden className="size-4" />
        {t('add.mention')}
      </DropdownMenuItem>
      <DropdownMenuItem data-image-add="library" onSelect={onLibrary}>
        <Library aria-hidden className="size-4" />
        {t('add.library')}
      </DropdownMenuItem>
      {onPickCanvas ? (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger data-image-add="canvas">
            <ImageIcon aria-hidden className="size-4" />
            {t('add.canvas')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
            {canvas.length === 0 ? (
              <DropdownMenuItem disabled>
                {t('add.canvasEmpty')}
              </DropdownMenuItem>
            ) : (
              canvas.map((candidate) => (
                <DropdownMenuItem
                  key={candidate.id}
                  data-image-add-canvas={candidate.id}
                  onSelect={() => onPickCanvas(candidate.id)}
                >
                  {candidate.name}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ) : null}
    </>
  )
}
