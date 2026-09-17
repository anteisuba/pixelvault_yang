'use client'

/**
 * 文本卡选中时那条工具条（spec §2，画板 `TextJimeng.dc.html` 方向 A：居中悬在卡
 * 上方）。
 *
 * 三键一组：`展开 · 下载 · ⋯`；⋯ = 改名 / 复制 / 拆成多段 / 生图 / 生镜头 / 删除。
 * ⚠ 2026-09-11 owner 定稿把「@ 提及 · 生图 · 连到镜头」三颗从条上收进了 ⋯：
 * 卡面变成一只可读可拖的高文本框之后，条上留的是**对这份文档本身**的动作
 * （看全文 / 拿走），派生动作退到 ⋯ 里。
 *
 * 壳走 S0 的 `NodeToolbar`（玻璃胶囊 + 34px 图标格 + tooltip），定位走 ReactFlow 的
 * `NodeToolbar`——⛔ 不手算缩放补偿。
 */

import { NodeToolbar as FlowNodeToolbar, Position } from '@xyflow/react'
import {
  Download,
  Expand,
  Film,
  Image as ImageIcon,
  MoreHorizontal,
} from '@/components/icons'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { DropdownMenuItem } from '@/components/ui/dropdown-menu'

import { NodeToolbar, type NodeToolbarAction } from '../chrome'

export interface TextNodeToolbarProps {
  readonly visible: boolean
  onExpand(): void
  onDownload(): void
  onDeriveShotImage(): void
  /** 生镜头 = 新建一张视频卡并把这段连成镜头说明。 */
  onDeriveShot(): void
  onRename(): void
  onClone(): void
  /** 「拆成多段」那一项——它要动作总线，所以由调用方在菜单打开时才挂（见 `TextSplitMenuItem`）。 */
  readonly splitItem: ReactNode
  onDelete(): void
}

export function TextNodeToolbar({
  visible,
  onExpand,
  onDownload,
  onDeriveShotImage,
  onDeriveShot,
  onRename,
  onClone,
  splitItem,
  onDelete,
}: TextNodeToolbarProps) {
  const t = useTranslations('StudioNode.v4.text')

  const more: NodeToolbarAction = {
    id: 'more',
    label: t('toolbar.more'),
    icon: MoreHorizontal,
    onSelect: () => {},
    menu: (
      <>
        {/* ⋯ 的文案按**这一类卡**写（S5c 尾项：共用键写的是「重命名节点 / 克隆
            空节点」，在一张文本卡上读起来像在说别的东西）。 */}
        <DropdownMenuItem data-menu-action="rename" onSelect={onRename}>
          {t('toolbar.renameNode')}
        </DropdownMenuItem>
        <DropdownMenuItem data-menu-action="clone" onSelect={onClone}>
          {t('toolbar.cloneNode')}
        </DropdownMenuItem>
        {splitItem}
        <DropdownMenuItem
          data-menu-action="shotImage"
          onSelect={onDeriveShotImage}
        >
          <ImageIcon aria-hidden className="size-4" />
          {t('toolbar.shotImage')}
        </DropdownMenuItem>
        <DropdownMenuItem data-menu-action="shot" onSelect={onDeriveShot}>
          <Film aria-hidden className="size-4" />
          {t('toolbar.video')}
        </DropdownMenuItem>
        <DropdownMenuItem
          data-menu-action="delete"
          variant="destructive"
          onSelect={onDelete}
        >
          {t('toolbar.deleteNode')}
        </DropdownMenuItem>
      </>
    ),
  }

  return (
    <FlowNodeToolbar
      isVisible={visible}
      position={Position.Top}
      align="center"
      offset={10}
    >
      <NodeToolbar
        ariaLabel={t('toolbar.ariaLabel')}
        groups={[
          [
            {
              id: 'expand',
              label: t('toolbar.expand'),
              icon: Expand,
              onSelect: onExpand,
            },
            {
              id: 'download',
              label: t('toolbar.download'),
              icon: Download,
              onSelect: onDownload,
            },
            more,
          ],
        ]}
      />
    </FlowNodeToolbar>
  )
}
