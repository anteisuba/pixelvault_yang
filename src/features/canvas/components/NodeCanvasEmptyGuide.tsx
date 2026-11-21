'use client'

import { useState } from 'react'
import { MessagesSquare, Plus } from '@/components/icons'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'

import {
  CanvasAddMenuPopover,
  type CanvasAddMenuActions,
} from './workbench-v4/shell/CanvasAddMenu'

interface NodeCanvasEmptyGuideProps {
  /** Primary CTA — open the assistant to talk through the outline (剧本脑). */
  onChatOutline: () => void
  /** Secondary — 以「手动加节点」按钮为锚弹那一份加节点菜单（卡落在可见区）。 */
  addMenu: CanvasAddMenuActions
}

/**
 * A2 — empty canvas guide for the Node director board: the assistant-first front door —
 * the default path is "chat the outline" (assistant = script brain), with a
 * quiet manual "add node" escape that anchors the shared `CanvasAddMenu`.
 *
 * 长相走全站空态原语（`EmptyState`，ui-defaults §7）—— 五段结构一字不改：
 * 虚线框 → 40px 图标位 → 展示槽标题 → 一句话 → 黑丸主动作。
 * ⚠ 只换**皮肤**：画布是自己的一套 `node-*` 令牌（深色板 + 毛玻璃浮层），
 * 原语默认的应用内浅底在这里会变成一块白斑，所以 `className` 把面与边覆盖
 * 到画布令牌上。⛔ 覆盖到此为止 —— 结构、字槽、动作形状一律不动。
 */
export function NodeCanvasEmptyGuide({
  onChatOutline,
  addMenu,
}: NodeCanvasEmptyGuideProps) {
  const t = useTranslations('StudioNode.emptyGuide')
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <EmptyState
      className="pointer-events-auto w-full max-w-md border-node-panel-inner/80 bg-node-panel/80 text-node-foreground shadow-node-panel backdrop-blur-xl [&_h3]:text-node-foreground [&_p]:text-node-muted"
      icon={<MessagesSquare aria-hidden />}
      title={t('title')}
      description={t('subtitle')}
      action={
        <Button
          type="button"
          onClick={onChatOutline}
          className="rounded-full bg-node-foreground text-node-canvas hover:tint-hover"
        >
          {t('chatOutline')}
        </Button>
      }
      secondaryAction={
        <CanvasAddMenuPopover
          open={menuOpen}
          onOpenChange={setMenuOpen}
          anchor="trigger"
          align="center"
          sideOffset={8}
          testId="empty-guide-add-menu"
          {...addMenu}
        >
          <Button
            type="button"
            variant="ghost"
            data-testid="empty-guide-add-node"
            className="rounded-full text-node-muted hover:tint-hover hover:text-node-foreground"
          >
            <Plus className="size-4" aria-hidden />
            {t('addNode')}
          </Button>
        </CanvasAddMenuPopover>
      }
    />
  )
}
