'use client'

import { useCallback, useMemo } from 'react'
import { useEdges, useNodes } from '@xyflow/react'
import { Mic2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
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
import { useCharacterCards } from '@/hooks/cards/use-character-cards'
import { getUpstreamNodes, isVoiceProfileNode } from '@/lib/node-workflow-graph'
import type { CharacterCardRecord } from '@/types'
import type {
  NodeWorkflowEdge,
  NodeWorkflowNode,
  NodeWorkflowReferenceAsset,
} from '@/types/node-workflow'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { IMEAwareInput } from './IMEAwareField'
import { InspectorField } from './InspectorField'
import { NodeMediaInspector } from './NodeMediaInspector'

interface CharacterImageInspectorProps {
  node: NodeWorkflowNode
}

/**
 * Character image node Inspector — a thin wrapper over the unified
 * NodeMediaInspector (option B / node-consolidation). It feeds the shared
 * component two role-specific slots:
 *   - `cardLibrary`: the character card library (useCharacterCards), whose
 *     apply hydrates name / prompt / cover image / multi-angle reference
 *     images + the card id, mirroring BackgroundImageInspector.
 *   - `roleExtras`: the always-visible character name field + the bound-voice
 *     hint (so a wired upstream voice node is visible before generation).
 *
 * All preview / source-choice / AI-generate behavior lives in NodeMediaInspector
 * so the character path can never drift from background/shot/frame again.
 */
export function CharacterImageInspector({
  node,
}: CharacterImageInspectorProps) {
  const t = useTranslations('StudioNode.characterImage')
  const allNodes = useNodes<NodeWorkflowNode>()
  const edges = useEdges<NodeWorkflowEdge>()
  const { updateNodeData } = useNodeWorkflowActions()
  const { cards, isLoading, findCard } = useCharacterCards()

  const characterName =
    typeof node.data.characterName === 'string'
      ? node.data.characterName
      : (node.data.character?.name ?? '')

  const handleNameChange = useCallback(
    (next: string) => {
      updateNodeData(node.id, { characterName: next })
    },
    [node.id, updateNodeData],
  )

  // Detect an upstream voice node so the binding is visible before the video
  // step. Mirrors the previous bespoke inspector — the downstream Seedance
  // Reference builder labels its @AudioN slot with this character's name.
  const boundVoice: { voiceName: string | null } | null = (() => {
    const upstream = getUpstreamNodes(node.id, edges, allNodes)
    for (const candidate of upstream) {
      if (!isVoiceProfileNode(candidate)) continue
      const url =
        typeof candidate.data.voiceReferenceAudioUrl === 'string'
          ? candidate.data.voiceReferenceAudioUrl.trim()
          : ''
      if (!url) continue
      const voiceName =
        (typeof candidate.data.voiceName === 'string' &&
          candidate.data.voiceName.trim()) ||
        (typeof candidate.data.voiceId === 'string' &&
          candidate.data.voiceId.trim()) ||
        (typeof candidate.data.voiceReferenceAudioName === 'string' &&
          candidate.data.voiceReferenceAudioName.trim()) ||
        null
      return { voiceName }
    }
    return null
  })()

  const boundCard = useMemo(() => {
    const cardId =
      typeof node.data.cardId === 'string' ? node.data.cardId : null
    if (!cardId) return null
    const match = findCard(cardId)
    return match ? { id: match.id, name: match.name } : null
  }, [findCard, node.data.cardId])

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
    (card: CharacterCardRecord) => {
      // Source image + the card's reference images become multi-angle refs so
      // downstream Seedance gets every angle. Deduped, capped at the reference
      // limit; sourceId keeps the binding recoverable.
      const referenceUrls = [
        card.sourceImageUrl,
        ...(card.referenceImages ?? []),
      ].filter(
        (url, index, list): url is string =>
          typeof url === 'string' &&
          url.trim().length > 0 &&
          list.indexOf(url) === index,
      )
      const referenceAssets: NodeWorkflowReferenceAsset[] = referenceUrls
        .slice(0, NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.maxItems)
        .map((url, index) => ({
          id: `${card.id}:${index}`,
          url,
          role: NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.defaultRole,
          weight: NODE_STUDIO_CHARACTER_IMAGE_REFERENCES.defaultWeight,
          source: NODE_STUDIO_REFERENCE_SOURCE_IDS.asset,
          sourceId: card.id,
          name: card.name,
        }))

      updateNodeData(node.id, {
        cardId: card.id,
        characterName: card.name,
        prompt: card.characterPrompt || card.description || '',
        mediaKind: NODE_MEDIA_KIND_IDS.image,
        imageSource: card.sourceImageUrl
          ? NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing
          : undefined,
        mediaUrl: card.sourceImageUrl ?? undefined,
        mediaLabel: card.name,
        sourceGenerationId: undefined,
        sourceLabel: card.name,
        generationStatus: card.sourceImageUrl
          ? NODE_GENERATION_STATUS_IDS.success
          : NODE_GENERATION_STATUS_IDS.idle,
        status: card.sourceImageUrl
          ? NODE_STATUS_IDS.done
          : NODE_STATUS_IDS.idle,
        referenceAssets,
      })
      toast.success(t('cardLibrary.applied', { name: card.name }), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
    },
    [node.id, t, updateNodeData],
  )

  const handleApplyById = useCallback(
    (cardId: string) => {
      const card = findCard(cardId)
      if (!card) return
      applyCard(card)
    },
    [applyCard, findCard],
  )

  return (
    <NodeMediaInspector
      node={node}
      type={NODE_TYPE_IDS.characterImage}
      kind={NODE_MEDIA_KIND_IDS.image}
      cardLibrary={{
        cards: slotCards,
        isLoading,
        boundCard,
        onApply: handleApplyById,
        labels: {
          modeTitle: t('modeCardTitle'),
          modeDescription: t('modeCardDescription'),
          title: t('cardLibrary.title'),
          hint: t('cardLibrary.hint'),
          empty: t('cardLibrary.empty'),
        },
      }}
      roleExtras={
        <>
          <InspectorField
            label={t('nameLabel')}
            statusDotClassName="bg-node-port-character"
          >
            <IMEAwareInput
              value={characterName}
              onValueChange={handleNameChange}
              aria-label={t('nameLabel')}
              placeholder={t('namePrefix')}
              className="h-10 w-full rounded-2xl border border-node-panel-inner bg-node-panel-soft px-3 text-sm font-semibold text-node-foreground outline-none placeholder:text-node-subtle focus-visible:border-node-focus-ring focus-visible:ring-2 focus-visible:ring-node-focus-ring/20"
            />
          </InspectorField>

          {boundVoice ? (
            <div className="flex items-center gap-2 rounded-2xl border border-node-success/30 bg-node-success/10 px-3 py-2 text-xs leading-5 text-node-success">
              <Mic2 className="size-3.5 shrink-0" />
              <span className="flex-1 truncate">
                {boundVoice.voiceName
                  ? t('voiceBound.namedVoice', {
                      voiceName: boundVoice.voiceName,
                    })
                  : t('voiceBound.unnamed')}
              </span>
            </div>
          ) : null}
        </>
      }
    />
  )
}
