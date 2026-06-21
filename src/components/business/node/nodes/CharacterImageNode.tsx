'use client'

import Image from 'next/image'
import type { NodeProps } from '@xyflow/react'
import { AlertCircle, ImageIcon, Loader2, WandSparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS } from '@/constants/node-studio'
import {
  NODE_GENERATION_STATUS_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { NodeShell } from './NodeShell'
import { NodeExpandButton } from './NodeCardControls'

export function CharacterImageNode({
  id,
  data,
  selected,
}: NodeProps<NodeWorkflowNode>) {
  const t = useTranslations('StudioNode.characterImage')
  const imageUrl = typeof data.imageUrl === 'string' ? data.imageUrl : null
  const imageSource =
    data.imageSource ??
    (imageUrl ? NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.generated : undefined)
  const isExistingImage =
    Boolean(imageUrl) &&
    imageSource === NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing
  // Trim before falling back so a whitespace-only name shows the default
  // node label instead of an empty header.
  const characterNameRaw =
    typeof data.characterName === 'string' ? data.characterName.trim() : ''
  const fallbackName = data.character?.name?.trim() ?? ''
  const characterName =
    characterNameRaw.length > 0
      ? characterNameRaw
      : fallbackName.length > 0
        ? fallbackName
        : t('namePrefix')
  // The header shows the user's character name when set; if not, NodeShell
  // falls back to the localized "角色图" label.
  const headerTitle =
    characterNameRaw.length > 0
      ? characterNameRaw
      : fallbackName.length > 0
        ? fallbackName
        : undefined
  const generationStatus =
    data.generationStatus ??
    (imageUrl
      ? NODE_GENERATION_STATUS_IDS.success
      : NODE_GENERATION_STATUS_IDS.idle)
  const isPending =
    generationStatus === NODE_GENERATION_STATUS_IDS.pending ||
    data.status === NODE_STATUS_IDS.running
  const isError =
    generationStatus === NODE_GENERATION_STATUS_IDS.error ||
    (data.status === NODE_STATUS_IDS.failed && Boolean(data.generationError))

  return (
    <NodeShell
      type={NODE_TYPE_IDS.characterImage}
      selected={selected}
      status={data.status}
    >
      <NodeShell.Header
        type={NODE_TYPE_IDS.characterImage}
        status={data.status}
        title={headerTitle}
        action={<NodeExpandButton nodeId={id} />}
      />
      <NodeShell.Body className="space-y-3">
        <div className="relative aspect-square overflow-hidden rounded-2xl border border-node-panel-inner bg-node-panel-soft">
          {imageUrl ? (
            <>
              <Image
                src={imageUrl}
                alt={t('imageAlt', { name: characterName })}
                fill
                sizes="320px"
                className="object-cover"
                unoptimized
              />
              <span className="absolute left-2 top-2 rounded-full border border-node-panel-inner bg-node-canvas/75 px-2 py-1 text-2xs font-semibold text-node-foreground backdrop-blur">
                {isExistingImage ? t('sourceExisting') : t('sourceGenerated')}
              </span>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
              <ImageIcon className="size-8 text-node-port-character" />
              <div>
                <p className="text-sm font-semibold text-node-foreground">
                  {characterName}
                </p>
                <p className="mt-1 text-xs leading-5 text-node-muted">
                  {t('emptyPreview')}
                </p>
              </div>
            </div>
          )}

          {isPending ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-node-canvas/70 text-node-foreground backdrop-blur-sm">
              <Loader2 className="size-5 animate-spin text-node-port-character" />
              <span className="text-xs font-semibold">{t('generating')}</span>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-node-panel-inner bg-node-panel-soft p-3">
          <p className="text-2xs font-semibold uppercase tracking-nav-dense text-node-muted">
            {t('promptLabel')}
          </p>
          <p className="mt-2 line-clamp-3 text-sm leading-6 text-node-foreground">
            {data.prompt || t('promptPlaceholder')}
          </p>
        </div>

        {isError ? (
          <div className="flex gap-2 rounded-2xl border border-node-status-failed bg-node-status-failed/50 p-3 text-sm text-node-status-failed-fg">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p className="line-clamp-3 text-xs leading-5 text-node-status-failed-fg/80">
              {data.generationError}
            </p>
          </div>
        ) : null}
      </NodeShell.Body>
      <NodeShell.Footer>
        <p className="truncate text-2xs font-medium text-node-subtle">
          {t(
            isExistingImage
              ? 'statusExisting'
              : imageUrl
                ? 'statusSuccess'
                : 'statusIdle',
          )}
        </p>
        <span className="flex size-8 items-center justify-center rounded-2xl bg-node-panel-inner text-node-port-character">
          <WandSparkles className="size-4" />
        </span>
      </NodeShell.Footer>
    </NodeShell>
  )
}
