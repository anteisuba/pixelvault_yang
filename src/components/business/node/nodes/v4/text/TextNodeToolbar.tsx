'use client'

/**
 * 文本卡选中时那条工具条（spec §2，画板 `Main.dc.html` 放法 1：居中悬在卡上方）。
 *
 * 四键一组、**不分组线**（画板上四颗连在一起）：`@ 提及 · 生图 · 生镜头 · ⋯`；
 * ⋯ = 改名 / 复制 / 拆成多段 / 删除。
 *
 * 壳走 S0 的 `NodeToolbar`（玻璃胶囊 + 34px 图标格 + tooltip），定位走 ReactFlow 的
 * `NodeToolbar`——⛔ 不手算缩放补偿。
 */

import { NodeToolbar as FlowNodeToolbar, Position } from '@xyflow/react'
import { AtSign, Film, Image as ImageIcon, MoreHorizontal } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { DropdownMenuItem } from '@/components/ui/dropdown-menu'

import { NodeToolbar, type NodeToolbarAction } from '../chrome'

export interface TextNodeToolbarProps {
  readonly visible: boolean
  onMention(): void
  onDeriveShotImage(): void
  onDeriveVideo(): void
  onRename(): void
  onClone(): void
  /** 「拆成多段」那一项——它要动作总线，所以由调用方在菜单打开时才挂（见 `TextSplitMenuItem`）。 */
  readonly splitItem: ReactNode
  onDelete(): void
}

export function TextNodeToolbar({
  visible,
  onMention,
  onDeriveShotImage,
  onDeriveVideo,
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
        <DropdownMenuItem data-menu-action="rename" onSelect={onRename}>
          {t('toolbar.rename')}
        </DropdownMenuItem>
        <DropdownMenuItem data-menu-action="clone" onSelect={onClone}>
          {t('toolbar.clone')}
        </DropdownMenuItem>
        {splitItem}
        <DropdownMenuItem
          data-menu-action="delete"
          variant="destructive"
          onSelect={onDelete}
        >
          {t('toolbar.delete')}
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
              id: 'mention',
              label: t('toolbar.mention'),
              icon: AtSign,
              onSelect: onMention,
            },
            {
              id: 'shotImage',
              label: t('toolbar.shotImage'),
              icon: ImageIcon,
              onSelect: onDeriveShotImage,
            },
            {
              id: 'video',
              label: t('toolbar.video'),
              icon: Film,
              onSelect: onDeriveVideo,
            },
            more,
          ],
        ]}
      />
    </FlowNodeToolbar>
  )
}
