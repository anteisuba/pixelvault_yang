'use client'

/**
 * 图片卡提示词栏的 **@ 候选与胶囊**：参考轨上的图 · 角色库里的她 · 画布上的别的图。
 * 桌面卡（`ImageNodeV4`）与手机抽屉（`MobileNodeSheet`）同一份，⛔ 不各写一遍。
 * 不收参考图的子型（`acceptsRefs = false`）什么都不给。
 */

import { useTranslations } from 'next-intl'

import type { NodeV4ImageData } from '@/types/node-workflow'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { videoRailMentionLabels } from '@/lib/video-node-rail'

import { renderPromptMentions, type MentionPickerOption } from '../chrome'
import { useNodeCharacterMentions } from '../character/use-node-character-mentions'
import { useNodeV4Canvas } from '../NodeV4Context'
import { buildMentionCandidates, buildMentionTokens } from '../NodeV4Mentions'
import type { useImageRefBinding } from './use-image-ref-binding'

export function useImagePromptMentions({
  id,
  draft,
  imageData,
  refs,
  acceptsRefs,
}: {
  id: string
  /** 正在写的草稿：@她 跟着它走，边打字边出现在参考轨上。 */
  draft: string
  imageData: NodeV4ImageData
  refs: ReturnType<typeof useImageRefBinding>
  acceptsRefs: boolean
}) {
  const tImage = useTranslations('StudioNode.v4.image')
  const canvas = useNodeV4Canvas()
  const characterMentions = useNodeCharacterMentions({
    prompt: draft,
    ...(imageData.characterPicks
      ? { characterPicks: imageData.characterPicks }
      : {}),
  })

  const mentionTokens = buildMentionTokens(canvas.nodes, id).filter(
    (token) => token.kind !== 'video' && token.kind !== 'voice',
  )
  const mentionCandidates = buildMentionCandidates(
    canvas.nodes.filter(
      (item) => item.id !== id && item.data.kind === NODE_MEDIA_KIND_IDS.image,
    ),
    id,
    (item) => item.data.name,
  )
  const options: MentionPickerOption[] = acceptsRefs
    ? [
        ...refs.items.map((entry) => ({
          id: `rail:${entry.edgeId}`,
          name: `${tImage('rail.group')}${entry.index}`,
          groupLabel: tImage('rail.mentionGroup'),
          ...(entry.thumbnailUrl
            ? {
                media: {
                  kind: 'image' as const,
                  thumbnailUrl: entry.thumbnailUrl,
                },
              }
            : {}),
        })),
        ...characterMentions.options,
        ...mentionCandidates.map((candidate) => {
          const token = mentionTokens.find(
            (item) => item.name === candidate.name,
          )
          return {
            id: candidate.id,
            name: candidate.name,
            groupLabel: tImage('add.canvas'),
            ...(token?.thumbnailUrl
              ? {
                  media: {
                    kind: 'image' as const,
                    thumbnailUrl: token.thumbnailUrl,
                  },
                }
              : {}),
          }
        }),
      ]
    : []
  const names = [
    ...refs.items.flatMap((entry) => videoRailMentionLabels(entry)),
    ...mentionTokens.map((token) => token.name),
    ...characterMentions.names,
  ]
  const mediaOf = (name: string) => {
    const rail = refs.items.find((entry) =>
      videoRailMentionLabels(entry).includes(name),
    )
    if (rail?.thumbnailUrl) {
      return { kind: 'image' as const, thumbnailUrl: rail.thumbnailUrl }
    }
    const token = mentionTokens.find((item) => item.name === name)
    if (token?.thumbnailUrl) {
      return { kind: 'image' as const, thumbnailUrl: token.thumbnailUrl }
    }
    return undefined
  }
  const quotedMediaOf = (name: string) => {
    const matches = refs.items.filter((entry) => entry.sourceName === name)
    const first = matches[0]
    if (
      !first?.thumbnailUrl ||
      matches.some((entry) => entry.sourceNodeId !== first.sourceNodeId)
    ) {
      return undefined
    }
    return { kind: 'image' as const, thumbnailUrl: first.thumbnailUrl }
  }

  return {
    characterMentions: characterMentions.mentions,
    mentionOptions: acceptsRefs && options.length > 0 ? options : undefined,
    frameTokens: [
      ...mentionTokens,
      ...refs.items.flatMap((entry) =>
        videoRailMentionLabels(entry).map((name) => ({
          name,
          kind: 'reference' as const,
          ...(entry.thumbnailUrl ? { thumbnailUrl: entry.thumbnailUrl } : {}),
        })),
      ),
      ...characterMentions.tokens,
    ],
    frameCandidates: [
      ...refs.items.map((entry) => ({
        id: `rail:${entry.edgeId}`,
        name: `${tImage('rail.group')}${entry.index}`,
        groupLabel: tImage('rail.mentionGroup'),
        group: 'rail',
        ...(entry.thumbnailUrl ? { thumbnailUrl: entry.thumbnailUrl } : {}),
      })),
      ...characterMentions.candidates,
      ...mentionCandidates,
    ],
    renderValue: acceptsRefs
      ? (value: string) =>
          renderPromptMentions(value, { names, mediaOf, quotedMediaOf })
      : undefined,
  }
}
