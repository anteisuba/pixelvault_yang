'use client'

import { useCallback, useRef, type ChangeEvent } from 'react'
import { Video } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { NODE_STUDIO_VIDEO_INPUT } from '@/constants/node-studio'
import { NODE_STATUS_IDS } from '@/constants/node-types'
import { useDownstreamUses } from '@/hooks/node/use-downstream-uses'
import { useReferenceVideoUpload } from '@/hooks/node/use-reference-video-upload'
import { resolveNodeDisplayName } from '@/lib/node-display-name'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { NodeProgressState } from '../nodes/NodeProgressState'
import { EvidenceDrawer, EvidenceRow } from './EvidenceDrawer'
import { RelationsStrip } from './RelationsStrip'
import type { NodeDetailBodyProps } from './registry'
import type { NodeDetailSlots } from './slots'

function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return ''
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * 参考视频（`videoReference`）—— 上传型节点。与生成型视频节点不同，这一族的
 * 面板必须露出上传/替换/清除，因为 `data.mediaUrl` 只能从这里来；下游 Seedance
 * 节点再沿图把这个 URL 收成 `videoUrls`。
 *
 * ⚠ **素材架整栏不渲染，上传归动作坞**。契约 §6 那一行把「上传/替换」同时
 * 列在素材架和动作坞两个槽里 —— 那是同一颗按钮出现两次。它就是这一屏的主事
 * （这一族除了换素材没有第二件事可做），所以归动作坞；R10「全屏只有一个实心
 * 元素」也只允许它出现一次。素材架因此是**组级不适用**。
 * ⬜ 已在 page 文档 §14 登记，等 owner 复核该行。
 *
 * ⚠ 「清除」不做成第二颗实心按钮：它是撤销不是主事，降级为坞里左侧的文字按钮。
 */
export function VideoReferenceDetailBody({
  nodeId,
  data,
  children,
}: NodeDetailBodyProps & {
  children: (slots: NodeDetailSlots) => React.ReactNode
}) {
  const t = useTranslations('StudioNode.videoReference')
  const tDetail = useTranslations('StudioNode.nodeDetail')
  const tTypes = useTranslations('StudioNode.nodeTypes')
  const { updateNodeData } = useNodeWorkflowActions()
  const { uploadFile, isUploading } = useReferenceVideoUpload()
  const uses = useDownstreamUses(nodeId)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const mediaUrl = typeof data.mediaUrl === 'string' ? data.mediaUrl : null
  // 画布修法 08-A：直接读 data.mediaLabel 绕开了机器值守卫——「选已有图」
  // 写入口把上传备注常量当名字写进这个字段时，台座与发送预览条目会照单
  // 展示那串机器备注。改走共享解析器。
  const mediaLabel = resolveNodeDisplayName(data) ?? null
  const videoThumbnailUrl =
    typeof data.videoThumbnailUrl === 'string'
      ? data.videoThumbnailUrl
      : undefined
  const sizeLabel = formatBytes(
    typeof data.sizeBytes === 'number' ? data.sizeBytes : undefined,
  )

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return
      const patch = await uploadFile(file)
      if (!patch) return
      updateNodeData(nodeId, { ...patch, status: NODE_STATUS_IDS.done })
    },
    [nodeId, updateNodeData, uploadFile],
  )

  const handleClear = useCallback(() => {
    updateNodeData(nodeId, {
      mediaUrl: undefined,
      mediaLabel: undefined,
      status: NODE_STATUS_IDS.idle,
    })
  }, [nodeId, updateNodeData])

  return (
    <>
      {children({
        stage: (
          <>
            <div className="canvas-detail-stage">
              <div className="canvas-detail-well">
                {mediaUrl ? (
                  <video
                    src={mediaUrl}
                    poster={videoThumbnailUrl}
                    className="h-full w-full object-cover"
                    controls
                    muted
                  />
                ) : (
                  // R2：空态只有一枚极淡字形，零文案、零虚线框。
                  <Video
                    aria-hidden
                    className="canvas-detail-well-glyph size-12"
                    strokeWidth={1.25}
                  />
                )}
                {isUploading ? (
                  <NodeProgressState
                    indicator="breath"
                    veiled
                    label={t('uploading')}
                  />
                ) : null}
              </div>
            </div>
            {/* 台座：文件名 · 大小。R6 —— 只读派生值，不穿控件壳。 */}
            {mediaLabel ? (
              <div className="canvas-detail-pedestal">
                {sizeLabel ? `${mediaLabel} · ${sizeLabel}` : mediaLabel}
              </div>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              accept={NODE_STUDIO_VIDEO_INPUT.accept}
              className="hidden"
              onChange={(event) => void handleFileChange(event)}
            />
          </>
        ),

        rack: undefined,
        desk: undefined,

        relations: (
          <RelationsStrip
            uses={uses}
            emptyLabel={tDetail('relationsEmptyReference')}
            labelOf={(use) => use.name ?? tTypes(use.type)}
            ariaOf={(name) => tDetail('focusOnCanvas', { name })}
          />
        ),

        evidence: (
          <EvidenceDrawer label={tDetail('sendPreview')} count={2}>
            <EvidenceRow
              label={tDetail('fieldFile')}
              value={
                mediaLabel
                  ? sizeLabel
                    ? `${mediaLabel} · ${sizeLabel}`
                    : mediaLabel
                  : tDetail('valueEmpty')
              }
              dim={!mediaLabel}
            />
            <EvidenceRow
              label={tDetail('fieldConstraints')}
              value={t('constraints')}
            />
          </EvidenceDrawer>
        ),

        dock: (
          <div className="canvas-detail-dock-bar">
            <p className="canvas-detail-dock-reason">
              {isUploading ? t('uploading') : t('description')}
            </p>
            {mediaUrl && !isUploading ? (
              <button
                type="button"
                onClick={handleClear}
                className="canvas-detail-txt-btn"
              >
                {t('clear')}
              </button>
            ) : null}
            <button
              type="button"
              className="canvas-detail-primary"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
            >
              {mediaUrl ? t('replace') : t('upload')}
            </button>
          </div>
        ),
      })}
    </>
  )
}
