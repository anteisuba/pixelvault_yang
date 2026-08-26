'use client'

import type { MouseEvent } from 'react'
import { MessagesSquare, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'

interface NodeCanvasEmptyGuideProps {
  /** Primary CTA — open the assistant to talk through the outline (剧本脑). */
  onChatOutline: () => void
  /** Secondary — open the add-node menu (manual path). Takes the click event
   *  so the menu anchors near the button, matching the top-bar add flow. */
  onAddNode: (event: MouseEvent<HTMLButtonElement>) => void
}

/**
 * A2 — empty canvas guide for the Node director board. Replaces the generic
 * XiaoheiGuideCarousel on /studio/node with the assistant-first front door:
 * the default path is "chat the outline" (assistant = script brain), with a
 * quiet manual "add node" escape. Canvas-scoped (node-* tokens) only.
 */
export function NodeCanvasEmptyGuide({
  onChatOutline,
  onAddNode,
}: NodeCanvasEmptyGuideProps) {
  const t = useTranslations('StudioNode.emptyGuide')

  return (
    <div className="pointer-events-auto w-full max-w-md rounded-3xl border border-node-panel-inner/80 bg-node-panel/80 px-8 py-10 text-center shadow-node-panel backdrop-blur-xl">
      <h2 className="font-display text-lg font-semibold text-node-foreground">
        {t('title')}
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-node-muted">
        {t('subtitle')}
      </p>
      <Button
        type="button"
        onClick={onChatOutline}
        className="mt-6 h-11 w-full rounded-2xl bg-node-foreground text-sm font-semibold text-node-canvas hover:bg-node-foreground/90"
      >
        <MessagesSquare className="mr-2 size-4" />
        {t('chatOutline')}
      </Button>
      <button
        type="button"
        onClick={onAddNode}
        // 它上面那颗主动作是 h-11（44），这颗次动作按视觉层级只有 32——桌面
        // fine pointer 合规，触屏差 12px。用本域既有的 coarse:before:* 手法
        // 补命中区（视觉不变），与 CanvasAppearancePanel 同一条纪律。
        className="relative mx-auto mt-3 inline-flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-medium text-node-muted transition-colors hover:bg-node-panel-inner hover:text-node-foreground coarse:before:absolute coarse:before:-inset-y-1.5 coarse:before:inset-x-0 coarse:before:content-['']"
      >
        <Plus className="size-3.5" />
        {t('addNode')}
      </button>
    </div>
  )
}
