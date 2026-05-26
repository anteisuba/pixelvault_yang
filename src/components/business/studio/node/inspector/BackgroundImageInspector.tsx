'use client'

import { useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS,
  NODE_STUDIO_CHARACTER_IMAGE_REFERENCES,
  NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS,
  NODE_STUDIO_PLACEHOLDER_TOAST,
  NODE_STUDIO_REFERENCE_SOURCE_IDS,
} from '@/constants/node-studio'
import {
  NODE_GENERATION_STATUS_IDS,
  NODE_MEDIA_KIND_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'
import { useBackgroundCards } from '@/hooks/use-background-cards'
import type { BackgroundCardRecord } from '@/types'
import type {
  NodeWorkflowNode,
  NodeWorkflowReferenceAsset,
} from '@/types/node-workflow'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { NodeMediaInspector } from './NodeMediaInspector'

interface BackgroundImageInspectorProps {
  node: NodeWorkflowNode
}

/**
 * Background image node Inspector — wraps NodeMediaInspector and feeds it
 * the card library slot wired to useBackgroundCards. Mirrors the
 * character-card-to-character-node flow: picking a card hydrates the node
 * with the card's cover image, prompt, name, and reference image (when
 * present), plus stores the card id so the binding stays recoverable.
 */
export function BackgroundImageInspector({
  node,
}: BackgroundImageInspectorProps) {
  const t = useTranslations('StudioNode.mediaNodes.cardLibrary')
  const { cards, isLoading } = useBackgroundCards()
  const { updateNodeData } = useNodeWorkflowActions()

  // Resolve the currently-bound background card. Drives the "📇 来自背景卡：x"
  // hint on the existing-mode pane. Background cards are flat (no variants),
  // so a single Array.find is enough.
  const boundCard = useMemo(() => {
    const cardId =
      typeof node.data.cardId === 'string' ? node.data.cardId : null
    if (!cardId) return null
    const match = cards.find((card) => card.id === cardId)
    return match ? { id: match.id, name: match.name } : null
  }, [cards, node.data.cardId])

  // Project the cards down to the shape NodeMediaInspector expects.
  // Keeping the slot type narrow (instead of leaking the full
  // BackgroundCardRecord into a shared component) means future card types
  // can reuse the slot without forcing every consumer to depend on the
  // full record.
  const slotCards = useMemo(
    () =>
      cards.map((card) => ({
        id: card.id,
        name: card.name,
        description: card.description,
        sourceImageUrl: card.sourceImageUrl,
        tags: card.tags,
      })),
    [cards],
  )

  const applyCard = useCallback(
    (card: BackgroundCardRecord) => {
      // Background cards only carry a single source image (no
      // multi-angle reference array), so the reference list is at most
      // one entry — handy when downstream Seedance accepts the
      // background as a visual reference.
      const referenceAssets: NodeWorkflowReferenceAsset[] = card.sourceImageUrl
        ? [
            {
              id: `${card.id}:cover`,
              url: card.sourceImageUrl,
              role: NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.defaultRole,
              weight: NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.defaultWeight,
              source: NODE_STUDIO_REFERENCE_SOURCE_IDS.asset,
              sourceId: card.id,
              name: card.name,
            },
          ]
        : []

      updateNodeData(node.id, {
        cardId: card.id,
        prompt: card.backgroundPrompt || card.description || '',
        mediaKind: NODE_MEDIA_KIND_IDS.image,
        // When the card carries a cover image, drop the node into
        // existing-image mode so the picture surfaces immediately. If
        // the card has no cover, stay in choice mode and just preload
        // the prompt — the user can still flip to AI generate.
        imageMode: card.sourceImageUrl
          ? NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.existing
          : NODE_STUDIO_CHARACTER_IMAGE_MODE_IDS.choice,
        imageSource: card.sourceImageUrl
          ? NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing
          : undefined,
        mediaUrl: card.sourceImageUrl ?? undefined,
        sourceGenerationId: undefined,
        sourceLabel: card.name,
        mediaLabel: card.name,
        generationStatus: card.sourceImageUrl
          ? NODE_GENERATION_STATUS_IDS.success
          : NODE_GENERATION_STATUS_IDS.idle,
        status: card.sourceImageUrl
          ? NODE_STATUS_IDS.done
          : NODE_STATUS_IDS.idle,
        referenceAssets,
      })
      toast.success(t('applied', { name: card.name }), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
    },
    [node.id, t, updateNodeData],
  )

  const handleApplyById = useCallback(
    (cardId: string) => {
      const card = cards.find((entry) => entry.id === cardId)
      if (!card) return
      applyCard(card)
    },
    [applyCard, cards],
  )

  return (
    <NodeMediaInspector
      node={node}
      type={NODE_TYPE_IDS.backgroundImage}
      kind={NODE_MEDIA_KIND_IDS.image}
      cardLibrary={{
        cards: slotCards,
        isLoading,
        boundCard,
        onApply: handleApplyById,
      }}
    />
  )
}
