'use client'

/**
 * 图片节点的**菜单**（spec §3，画板 `ImageToolbar.dc.html` / `ImageStates.dc.html`）：
 * 工具条的「编辑」「分镜」子菜单、「⋯」更多菜单（**与右键同一份**）、提示词栏 `+`
 * 的添加菜单。
 *
 * 前后两张只是 `DropdownMenuItem` 的**列表**：壳（`NodeToolbar` / `NodePromptBar`）
 * 负责弹层与定位，⛔ 这里不自己写浮层。
 *
 * ── 编辑子菜单接的是**现有**图片编辑（⛔ 不新写一套）─────────────────────
 * 四项映射到 `READY_CANVAS_IMAGE_EDIT_CAPABILITY_IDS` 里已经跑得通的能力，宿主是
 * 既有的 `CanvasImageEditWorkspace`（结果回本卡版本条）。
 * ⚠ 真正向四周延展的扩图（outpaint）能力表里没有，owner 2026-10-15「只做现有的」——
 * `upscale` 叫「放大」，⛔ 叫成「扩图」。
 *
 * ── 分镜子菜单（owner 2026-10-15：模板 `/` 让给「我的模板」，分镜上工具条）────
 * 九宫格 / 四宫格 / 连贯四张仍存在 `params.promptTemplate`，发送时套进模板全文。
 *
 * ── ⋯ 与右键同一份（owner 2026-10-15）────────────────────────────────────
 * `useImageMoreActions` 出**一份动作表**，⋯ 用 `ImageMoreMenuItems` 画成下拉项、
 * 右键交给 `NodeV4ContextMenu` 的 `items` 画成按钮行。⛔ 两处各写一份列表。
 */

import { Fragment } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import {
  IMAGE_PROMPT_TEMPLATE_IDS,
  type ImagePromptTemplateId,
} from '@/constants/image-prompt-templates'
import type { StoryboardGridSize } from '@/constants/storyboard-grid'
import {
  Clapperboard,
  Copy,
  Check,
  Download,
  Eye,
  Globe,
  Grid2x2,
  Grid3X3,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Paintbrush,
  Pencil,
  RotateCcw,
  Trash2,
  Upload,
  UserRound,
  X,
  ZoomIn,
} from '@/components/icons'

import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from '@/components/ui/dropdown-menu'
import type { ReadyCanvasImageEditCapabilityId } from '@/types/canvas-image-edit'

import { useBrokenThumbs } from '../chrome/NodeMediaMissing'

/** 编辑子菜单的四项 → 现有能力 id。⛔ 值域不自己造，来自 `canvas-image-edit`。 */
export const IMAGE_EDIT_MENU_TASKS: readonly {
  readonly id: string
  readonly task: ReadyCanvasImageEditCapabilityId
}[] = [
  { id: 'inpaint', task: 'inpaint' },
  { id: 'upscale', task: 'upscale' },
  { id: 'cutout', task: 'remove-background' },
  { id: 'background', task: 'object-replace' },
]

const EDIT_ICONS = {
  inpaint: Paintbrush,
  upscale: ZoomIn,
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

const STORYBOARD_ICONS: Record<ImagePromptTemplateId, typeof Pencil> = {
  grid3: Grid3X3,
  grid2: Grid2x2,
  sequence4: LayoutGrid,
}

/**
 * 工具条「分镜 ▾」：三种分镜任选一种（再点当前那种 = 不变）；挂着时末尾多一项
 * 「不用分镜」。选中的那种打勾。
 */
export function ImageStoryboardMenuItems({
  value,
  onPick,
}: {
  readonly value: ImagePromptTemplateId | undefined
  onPick(next: ImagePromptTemplateId | undefined): void
}) {
  const t = useTranslations('StudioNode.v4.image.template')
  return (
    <>
      {IMAGE_PROMPT_TEMPLATE_IDS.map((templateId) => {
        const Icon = STORYBOARD_ICONS[templateId]
        return (
          <DropdownMenuItem
            key={templateId}
            data-image-storyboard={templateId}
            onSelect={() => onPick(templateId)}
          >
            <Icon aria-hidden className="size-4" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span>{t(`${templateId}.name`)}</span>
              <span className="text-xs text-muted-foreground">
                {t(`${templateId}.hint`)}
              </span>
            </span>
            {value === templateId ? (
              <Check aria-hidden className="size-4" />
            ) : null}
          </DropdownMenuItem>
        )
      })}
      {value ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            data-image-storyboard="none"
            onSelect={() => onPick(undefined)}
          >
            <X aria-hidden className="size-4" />
            {t('remove')}
          </DropdownMenuItem>
        </>
      ) : null}
    </>
  )
}

/** ⋯ 与右键共用的一行。`id` 同时是两处的 `data-*` 值（测试按它找）。 */
export interface ImageMoreAction {
  readonly id: string
  readonly label: string
  readonly icon: typeof Pencil
  readonly disabled?: boolean
  readonly danger?: boolean
  /** 这一行之前起一组（画一条分组线）。 */
  readonly startsGroup?: boolean
  run(): void
}

/**
 * ⋯ 与右键的**唯一一份**动作表。没有意义的项调用方传 `undefined`，整行不出
 * （⛔ 不摆一个按了什么都不变的灰项）。
 */
export function useImageMoreActions({
  onQuickLook,
  onNewShot,
  onRename,
  onDuplicate,
  onSplitVersion,
  onSetCharacter,
  onDownload,
  onSplitGrid,
  splitGridBusy = false,
  onRerunDownstream,
  onTidy,
  onDelete,
}: {
  onQuickLook?: (() => void) | undefined
  /** 「新建镜头」：以这张为首帧建一张视频卡并连上（原工具条「生镜头」）。 */
  onNewShot(): void
  onRename(): void
  onDuplicate(): void
  /** 「拆出当前版本」（spec §3）。⚠ 只有一版时传 `undefined`（拆无可拆）。 */
  onSplitVersion?: (() => void) | undefined
  /** 「设为角色卡」。⚠ 已经是角色卡的那张传 `undefined`。 */
  onSetCharacter?: (() => void) | undefined
  /** 卡上还没有图 → `undefined`。 */
  onDownload?: (() => void) | undefined
  /**
   * 「切宫格 3×3 / 2×2」（§3 九宫格分镜的手动那一条）。宿主没接切开能力、或卡上还
   * 没有图 → `undefined`，整组不出。
   */
  onSplitGrid?: ((size: StoryboardGridSize) => void) | undefined
  /** 正在切：两项灰掉（⛔ 同一张图并发切两次）。 */
  readonly splitGridBusy?: boolean
  /** 「重跑下游」。一个下游都没有 → `undefined`（画布上大半是叶子）。 */
  onRerunDownstream?: (() => void) | undefined
  onTidy(): void
  onDelete(): void
}): readonly ImageMoreAction[] {
  const tImage = useTranslations('StudioNode.v4.image')
  const tVideo = useTranslations('StudioNode.v4.video')
  const tNode = useTranslations('StudioNode.v4')
  const tRerun = useTranslations('StudioNode.rerunDownstream')
  const actions: ImageMoreAction[] = []
  if (onQuickLook) {
    actions.push({
      id: 'quick-look',
      label: tVideo('more.quickLook'),
      icon: Eye,
      run: onQuickLook,
    })
  }
  // ⋯ 的文案按**这一类卡**写（S5c 尾项）。⛔ 共用键的语义不动。
  actions.push(
    {
      id: 'new-shot',
      label: tImage('more.newShot'),
      icon: Clapperboard,
      run: onNewShot,
    },
    {
      id: 'rename',
      label: tImage('more.rename'),
      icon: Pencil,
      run: onRename,
    },
    {
      id: 'duplicate',
      label: tImage('more.duplicate'),
      icon: Copy,
      run: onDuplicate,
    },
  )
  if (onSplitVersion) {
    // 拆出一版 = 从一摞版本里抽一张；⛔ 剪刀只留给「裁剪」。
    actions.push({
      id: 'split',
      label: tImage('more.splitVersion'),
      icon: Layers,
      run: onSplitVersion,
    })
  }
  if (onSetCharacter) {
    actions.push({
      id: 'set-character',
      label: tImage('more.setCharacter'),
      icon: UserRound,
      run: onSetCharacter,
    })
  }
  if (onDownload) {
    actions.push({
      id: 'download',
      label: tNode('toolbar.download'),
      icon: Download,
      startsGroup: true,
      run: onDownload,
    })
  }
  if (onSplitGrid) {
    actions.push(
      {
        id: 'split-grid-3',
        label: tImage('storyboard.split3'),
        icon: Grid3X3,
        disabled: splitGridBusy,
        startsGroup: true,
        run: () => onSplitGrid(3),
      },
      {
        id: 'split-grid-2',
        label: tImage('storyboard.split2'),
        icon: Grid2x2,
        disabled: splitGridBusy,
        run: () => onSplitGrid(2),
      },
    )
  }
  if (onRerunDownstream) {
    actions.push({
      id: 'rerun-downstream',
      label: tRerun('menu'),
      icon: RotateCcw,
      startsGroup: true,
      run: onRerunDownstream,
    })
  }
  actions.push(
    {
      id: 'tidy',
      label: tNode('toolbar.tidy'),
      icon: LayoutGrid,
      startsGroup: !onRerunDownstream,
      run: onTidy,
    },
    {
      id: 'delete',
      label: tImage('more.delete'),
      icon: Trash2,
      danger: true,
      startsGroup: true,
      run: onDelete,
    },
  )
  return actions
}

export function ImageMoreMenuItems({
  actions,
  sourceLabel,
}: {
  readonly actions: readonly ImageMoreAction[]
  /** 当前版的来源（九宫格切出来的那一格写「九宫格 · 天台 · 第 3 格」），只读。 */
  readonly sourceLabel?: string | undefined
}) {
  const tImage = useTranslations('StudioNode.v4.image')
  return (
    <>
      {actions.map((action) => (
        <Fragment key={action.id}>
          {action.danger && sourceLabel ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel data-image-more="source">
                <span className="block text-3xs font-normal text-muted-foreground">
                  {tImage('more.source')}
                </span>
                <span className="block truncate text-2xs font-normal text-foreground">
                  {sourceLabel}
                </span>
              </DropdownMenuLabel>
            </>
          ) : null}
          {action.startsGroup ? <DropdownMenuSeparator /> : null}
          <DropdownMenuItem
            data-image-more={action.id}
            disabled={action.disabled}
            {...(action.danger ? { variant: 'destructive' as const } : {})}
            onSelect={action.run}
          >
            <action.icon aria-hidden className="size-4" />
            {action.label}
          </DropdownMenuItem>
        </Fragment>
      ))}
    </>
  )
}

export function ImageAddMenuItems({
  onUpload,
  onLibrary,
  canvasCandidates,
  onPickCanvas,
  searchGrounding,
}: {
  onUpload(): void
  onLibrary(): void
  /** 画布上已有产物的图（生成的 / 上传的），挂进参考槽。 */
  readonly canvasCandidates?: readonly {
    readonly id: string
    readonly name: string
    readonly thumbnailUrl?: string | undefined
    readonly attached?: boolean
    readonly blockedReason?: string | undefined
  }[]
  onPickCanvas?(nodeId: string): void
  /**
   * 「先搜再画」开关（B 定稿：在「+」菜单里，跟这张卡存）。只对支持的型号给；
   * 拨动不收菜单。
   */
  searchGrounding?: { checked: boolean; onChange(next: boolean): void }
}) {
  const t = useTranslations('StudioNode.v4.image')
  const tNode = useTranslations('StudioNode.v4')
  const thumbs = useBrokenThumbs()
  const canvas = canvasCandidates ?? []
  return (
    <>
      <DropdownMenuItem
        data-image-add="upload"
        onSelect={onUpload}
        className="h-9.5 cursor-pointer gap-2.5 rounded-lg px-2.5 text-2sm text-foreground hover:bg-surface-fill focus:bg-surface-fill"
      >
        <Upload aria-hidden className="size-4" />
        {t('add.upload')}
        <DropdownMenuShortcut className="font-mono text-2xs tracking-normal text-muted-foreground/75">
          ⌘U
        </DropdownMenuShortcut>
      </DropdownMenuItem>
      <DropdownMenuItem
        data-image-add="library"
        onSelect={onLibrary}
        className="h-9.5 cursor-pointer gap-2.5 rounded-lg px-2.5 text-2sm text-foreground hover:bg-surface-fill focus:bg-surface-fill"
      >
        <ImageIcon aria-hidden className="size-4" />
        {t('add.library')}
      </DropdownMenuItem>
      {onPickCanvas ? (
        <>
          <div className="flex justify-between px-2.5 pt-2.5 pb-1.5 text-2xs tracking-wide text-muted-foreground">
            <span>{tNode('addCanvasTitle')}</span>
            <span>{tNode('addCanvasHint')}</span>
          </div>
          {canvas.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 px-2.5 pb-2">
              {canvas.map((candidate) => (
                <DropdownMenuItem
                  key={candidate.id}
                  data-image-add-canvas={candidate.id}
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
                    onPickCanvas(candidate.id)
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
      {searchGrounding ? (
        <>
          <DropdownMenuSeparator className="mx-1.5 my-1" />
          <ImageSearchGroundingMenuItem {...searchGrounding} />
        </>
      ) : null}
    </>
  )
}

/**
 * 「先搜再画」那一行开关：整行是 `menuitemcheckbox`，右边一颗拨子（开 = 轨变近黑、
 * 拨子横移 12px，spring-slot）。拨动不收菜单。桌面在「+」菜单底部，手机抽屉里
 * 单独挂这一项。
 */
export function ImageSearchGroundingMenuItem({
  checked,
  onChange,
}: {
  checked: boolean
  onChange(next: boolean): void
}) {
  const tSearch = useTranslations('SearchGrounding')
  return (
    <DropdownMenuItem
      data-image-add="search-grounding"
      role="menuitemcheckbox"
      aria-checked={checked}
      onSelect={(event) => {
        event.preventDefault()
        onChange(!checked)
      }}
      className="cursor-pointer gap-2.5 rounded-lg px-2.5 py-2 text-2sm text-foreground hover:bg-surface-fill focus:bg-surface-fill"
    >
      <Globe aria-hidden className="size-4" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span>{tSearch('toggle')}</span>
        <small className="text-2xs leading-snug text-muted-foreground">
          {tSearch('hintCard')}
        </small>
      </span>
      <span
        aria-hidden
        className={`relative h-5 w-8 shrink-0 rounded-full transition-colors duration-fast ease-standard ${checked ? 'bg-foreground' : 'bg-surface-fill-track'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow-sm transition-transform duration-spring-slot ease-spring-slot ${checked ? 'translate-x-3' : ''}`}
        />
      </span>
    </DropdownMenuItem>
  )
}
