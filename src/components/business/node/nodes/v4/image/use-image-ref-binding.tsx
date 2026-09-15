'use client'

/**
 * 图片卡提示词栏的**参考图绑定**：上传 / 素材库 / 画布上已生成的图 → 新建卡
 * （或复用已有卡）+ 连进 `reference` 槽。
 *
 * 与视频卡 `use-video-rail-binding` 同一条路径，只收图。序号 / `@图N` 仍走
 * `readVideoRail`（图片卡没有首尾帧，组里只剩参考图）。
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { NODE_SLOT_IDS } from '@/constants/node-slots'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
} from '@/constants/node-types'
import { NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS } from '@/constants/node-studio'
import { useNodeUploadV4 } from '@/hooks/node/use-node-upload-v4'
import {
  readVideoRail,
  VIDEO_RAIL_GROUP_IDS,
  type VideoRailEntry,
} from '@/lib/video-node-rail'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type { NodeV4, NodeWorkflowModelSelection } from '@/types/node-workflow'

import { useNodeV4Canvas } from '../NodeV4Context'
import { imageRailCapacity } from './image-node-model'
import type {
  ImageRailCandidate,
  ImageRailPendingItem,
  ImageRefRailProps,
} from './ImageRefRail'

export const IMAGE_REF_BATCH_REF = 'asset'

export interface ImageRefBindingOptions {
  readonly id: string
  readonly displayName: string
  readonly model: NodeWorkflowModelSelection | undefined
  readonly disabled?: boolean
}

export interface ImageRefBinding {
  readonly items: readonly VideoRailEntry[]
  readonly candidates: readonly ImageRailCandidate[]
  readonly capacity: number
  readonly railProps: Omit<ImageRefRailProps, 'className'>
  attachFile(file: File): void
  openFilePicker(): void
  backfillMedia(nodeId: string, patch: { readonly url: string }): void
  readonly overlays: ReactNode
}

export function useImageRefBinding({
  id,
  displayName,
  model,
  disabled = false,
}: ImageRefBindingOptions): ImageRefBinding {
  const tImage = useTranslations('StudioNode.v4.image')
  const canvas = useNodeV4Canvas()
  const upload = useNodeUploadV4()

  const [assetPicker, setAssetPicker] = useState(false)
  const [pendingUploads, setPendingUploads] = useState<
    readonly {
      readonly id: string
      readonly name: string
      readonly file: File
      readonly error?: string | null
    }[]
  >([])
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const latest = useRef({ upload, canvas, id, name: displayName })
  useEffect(() => {
    latest.current = { upload, canvas, id, name: displayName }
  })

  const backfillMedia = useCallback(
    (nodeId: string, patch: { readonly url: string }) => {
      const step = (attempt: number): void => {
        const fresh = latest.current.canvas
        if (fresh.nodes.some((item) => item.id === nodeId) || attempt >= 10) {
          fresh.onSetMedia(nodeId, {
            ...patch,
            imageSource: NODE_STUDIO_IMAGE_OUTPUT_SOURCE_IDS.existing,
          })
          return
        }
        requestAnimationFrame(() => step(attempt + 1))
      }
      step(0)
    },
    [],
  )

  const attachUrl = useCallback(
    async (patch: { readonly url: string }) => {
      const bound = latest.current
      const outcome = await bound.canvas.onApplyBatch([
        {
          op: NODE_ASSISTANT_OP_V4_IDS.addNode,
          kind: NODE_MEDIA_KIND_IDS.image,
          subtype: NODE_V4_IMAGE_SUBTYPE_IDS.shot,
          ref: IMAGE_REF_BATCH_REF,
        },
        {
          op: NODE_ASSISTANT_OP_V4_IDS.connect,
          source: IMAGE_REF_BATCH_REF,
          target: bound.id,
          slot: NODE_SLOT_IDS.reference,
        },
      ] as readonly NodeAssistantOpV4[])
      const created = outcome?.createdNodeIds?.[0]
      if (created) backfillMedia(created, patch)
    },
    [backfillMedia],
  )

  const startUpload = useCallback(
    (pendingId: string, file: File) => {
      const bound = latest.current
      setActiveUploadId(pendingId)
      setPendingUploads((list) =>
        list.map((item) =>
          item.id === pendingId ? { ...item, error: null } : item,
        ),
      )
      void bound.upload.upload('image', file, bound.name).then((patch) => {
        setActiveUploadId((current) => (current === pendingId ? null : current))
        if (!patch?.url) {
          setPendingUploads((list) =>
            list.map((item) =>
              item.id === pendingId
                ? {
                    ...item,
                    error: tImage('rail.uploadFailed', { name: item.name }),
                  }
                : item,
            ),
          )
          return
        }
        setPendingUploads((list) =>
          list.filter((item) => item.id !== pendingId),
        )
        void attachUrl({ url: patch.url })
      })
    },
    [attachUrl, tImage],
  )

  const attachFile = useCallback(
    (file: File) => {
      const pendingId = `${Date.now()}-${file.name}`
      setPendingUploads((list) => [
        ...list,
        { id: pendingId, name: file.name, file },
      ])
      startUpload(pendingId, file)
    },
    [startUpload],
  )

  const openFilePicker = useCallback(() => {
    fileRef.current?.click()
  }, [])

  const node = canvas.nodes.find((item) => item.id === id) as NodeV4 | undefined
  const items = node
    ? readVideoRail(node, canvas.edges, canvas.nodes).filter(
        (entry) => entry.group === VIDEO_RAIL_GROUP_IDS.image,
      )
    : []
  const capacity = imageRailCapacity(model)
  const candidates: readonly ImageRailCandidate[] = canvas.nodes
    .filter(
      (item) =>
        item.id !== id &&
        item.data.kind === NODE_MEDIA_KIND_IDS.image &&
        Boolean(item.data.url) &&
        !items.some((entry) => entry.sourceNodeId === item.id),
    )
    .map((item) => ({
      id: item.id,
      name: item.data.name,
      thumbnailUrl:
        item.data.kind === NODE_MEDIA_KIND_IDS.image
          ? item.data.url
          : undefined,
    }))

  const pending: readonly ImageRailPendingItem[] = pendingUploads.map(
    (item) => ({
      id: item.id,
      name: item.name,
      progress: item.id === activeUploadId ? upload.progress : 0,
      ...(item.error ? { error: item.error } : {}),
    }),
  )

  const railProps: Omit<ImageRefRailProps, 'className'> = {
    items,
    pending,
    capacity,
    disabled,
    candidates,
    onOpen: canvas.onFocusNode,
    onRemove: (edgeId: string) =>
      void canvas.onApplyOp({
        op: NODE_ASSISTANT_OP_V4_IDS.disconnect,
        edgeId,
      }),
    onPickFromCanvas: (sourceNodeId: string) =>
      void canvas.onApplyOp({
        op: NODE_ASSISTANT_OP_V4_IDS.connect,
        source: sourceNodeId,
        target: id,
        slot: NODE_SLOT_IDS.reference,
      }),
    onUpload: openFilePicker,
    onLibrary: () => window.setTimeout(() => setAssetPicker(true), 0),
    onRetryPending: (pendingId: string) => {
      const item = pendingUploads.find((entry) => entry.id === pendingId)
      if (item) startUpload(item.id, item.file)
    },
    onRemovePending: (pendingId: string) =>
      setPendingUploads((list) => list.filter((item) => item.id !== pendingId)),
  }

  const overlays = (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        data-image-ref-file
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) attachFile(file)
          event.target.value = ''
        }}
      />
      {assetPicker ? (
        <AssetSelectorDialog
          open
          onOpenChange={setAssetPicker}
          mediaType="image"
          title={tImage('add.library')}
          description={tImage('add.library')}
          onSelect={(record) => {
            setAssetPicker(false)
            void attachUrl({ url: record.url })
          }}
        />
      ) : null}
    </>
  )

  return {
    items,
    candidates,
    capacity,
    railProps,
    attachFile,
    openFilePicker,
    backfillMedia,
    overlays,
  }
}
