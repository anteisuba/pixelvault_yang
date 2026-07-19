'use client'

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import {
  Handle,
  NodeResizer,
  NodeToolbar,
  Position,
  type NodeProps,
} from '@xyflow/react'
import { Pause, Play, Upload, Video, Volume2, VolumeX } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { NODE_STUDIO_LOOSE_IMAGE_DEFAULT_SIZE } from '@/constants/node-studio'
import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import { useReferenceVideoUpload } from '@/hooks/node/use-reference-video-upload'
import { cn } from '@/lib/utils'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { NodeSelectionToolbarChrome } from '../CanvasImageSelectionToolbar'
import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'

const ACCEPTED_VIDEO_MIME = 'video/mp4,video/quicktime,video/webm'

// R3-1 端口锚点化: the Handle DOM must stay — ReactFlow anchors edges to it —
// even though binding is via 吞噬 (isConnectable=false, visually inert). NodeShell
// renders these for every OTHER node type; since this card bypasses NodeShell,
// it must render its own or downstream edges (videoReference→seedance) lose their
// anchor and render broken (owner 真机: "线断了"). videoReference doesn't fold when
// it has an outgoing edge, so unlike LooseImageCard this handle is load-bearing.
const HANDLE_BASE =
  '!z-canvas-selection !size-5 !border-0 !bg-transparent pointer-events-none'

/**
 * Upload-only reference video node. Holds a user-uploaded clip (mp4/mov) that
 * feeds downstream Seedance Reference endpoints via video_urls. Never generates.
 *
 * owner 真机反馈 (2026-07-19) 后重构为**可缩放媒体卡**，与 `LooseImageCard`
 * 同一套形态（不走 `NodeShell` 的固定 `w-node-card`）：
 *  - `NodeResizer` 四角手柄 —— 像图片一样在画布上拉伸调大小（"像图片那样四角拉长"）。
 *  - 整块可拖：`<video>` 不加 `nodrag`（HTML `draggable={false}` 只是关掉浏览器
 *    原生拖影），拖视频区域即移动节点；播放/静音/替换钮加 `nodrag` 不触发拖拽。
 *  - 不用原生 `controls`（它会占满卡且吃掉拖拽热区，全屏也不是画布上的尺寸调整）
 *    —— 改用自定义播放 + 静音钮，声音开关就绪。
 *  - 去掉"外面的边框"（纸卡描边/盖章章）：选中态用 `outline`（石绿）表达，视频
 *    窗铺满整卡。
 */
export const VideoReferenceNode = memo(function VideoReferenceNode(
  props: NodeProps<NodeWorkflowNode>,
) {
  const { id, data, selected, width, height } = props
  const t = useTranslations('StudioNode.videoReference')
  const { updateNodeData, multiSelectActive } = useNodeWorkflowActions()
  const { uploadFile, isUploading } = useReferenceVideoUpload()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(true)
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(
    null,
  )

  const mediaUrl = typeof data.mediaUrl === 'string' ? data.mediaUrl : null
  const videoThumbnailUrl =
    typeof data.videoThumbnailUrl === 'string'
      ? data.videoThumbnailUrl
      : undefined

  const frameWidth = width ?? NODE_STUDIO_LOOSE_IMAGE_DEFAULT_SIZE
  const frameHeight = height ?? NODE_STUDIO_LOOSE_IMAGE_DEFAULT_SIZE

  // A replaced clip resets playback state (the <video> src changed outside React).
  useEffect(() => {
    setIsPlaying(false)
  }, [mediaUrl])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      void video.play().catch(() => setIsPlaying(false))
    } else {
      video.pause()
    }
  }, [])

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return

      setUploadingFileName(file.name)
      try {
        const patch = await uploadFile(file)
        if (!patch) return
        updateNodeData(id, { ...patch, status: NODE_STATUS_IDS.done })
      } finally {
        setUploadingFileName(null)
      }
    },
    [id, updateNodeData, uploadFile],
  )

  return (
    <div
      className={cn(
        'group relative box-border select-none',
        selected && 'z-canvas-selection',
      )}
      style={{ width: frameWidth, height: frameHeight }}
    >
      {/* Edge anchors (visually inert) — see HANDLE_BASE note. Left=target,
          Right=source, matching NodeShell's default footprint so the seedance
          edge that consumes this clip has somewhere to land. */}
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        className={HANDLE_BASE}
      />
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        className={HANDLE_BASE}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_VIDEO_MIME}
        className="hidden"
        onChange={(event) => void handleFileChange(event)}
      />

      {/* 四角/边缘拉伸手柄，同 LooseImageCard —— 像图片一样在画布上调大小。
          不 keepAspectRatio：允许自由拉伸（"四角拉长"），video object-contain
          不失真、以 letterbox 适配。 */}
      <NodeResizer
        nodeId={id}
        isVisible={Boolean(selected)}
        minWidth={140}
        minHeight={100}
        maxWidth={2400}
        maxHeight={2400}
        color="var(--node-paint)"
        handleStyle={{
          width: 12,
          height: 12,
          borderRadius: 2,
          borderWidth: 2,
          borderColor: 'var(--node-paint)',
          backgroundColor: 'var(--node-panel)',
        }}
        lineStyle={{
          borderColor: 'var(--node-paint)',
          borderWidth: 1,
          opacity: 0.55,
        }}
      />

      <NodeToolbar
        nodeId={id}
        isVisible={Boolean(selected) && !multiSelectActive}
        position={Position.Top}
        offset={14}
      >
        <NodeSelectionToolbarChrome
          nodeId={id}
          data={data}
          selected={selected}
          nodeType={NODE_TYPE_IDS.videoReference}
        />
      </NodeToolbar>

      <div
        className={cn(
          'absolute inset-0 overflow-hidden rounded-sm bg-node-card-window',
          selected
            ? 'outline outline-2 outline-offset-0 outline-node-paint'
            : 'outline outline-1 outline-offset-0 outline-transparent group-hover:outline-node-edge/40',
        )}
      >
        {typeof data.mediaLabel === 'string' && data.mediaLabel.trim() ? (
          <span className="pointer-events-none absolute left-2 top-2 z-canvas-selection max-w-40 truncate rounded-full border border-node-panel-inner bg-node-canvas/75 px-2 py-1 text-2xs font-semibold text-node-foreground backdrop-blur">
            {data.mediaLabel.trim()}
          </span>
        ) : null}

        {mediaUrl ? (
          <>
            <video
              ref={videoRef}
              src={mediaUrl}
              poster={videoThumbnailUrl}
              muted={isMuted}
              playsInline
              preload="metadata"
              draggable={false}
              className="size-full object-contain"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
            />

            {/* 播放/暂停 —— 居中，nodrag 不触发拖拽；播放中淡出、hover 再现。 */}
            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? t('pause') : t('play')}
              title={isPlaying ? t('pause') : t('play')}
              className={cn(
                'nodrag absolute left-1/2 top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-node-canvas/70 text-node-foreground backdrop-blur transition-opacity',
                isPlaying && 'opacity-0 group-hover:opacity-100',
              )}
            >
              {isPlaying ? (
                <Pause className="size-5" />
              ) : (
                <Play className="ml-0.5 size-5" />
              )}
            </button>

            {/* 声音开关（owner 真机要求）—— 左下，nodrag。 */}
            <button
              type="button"
              onClick={() => setIsMuted((muted) => !muted)}
              aria-label={isMuted ? t('unmute') : t('mute')}
              title={isMuted ? t('unmute') : t('mute')}
              className="nodrag absolute bottom-2 left-2 z-canvas-selection flex size-8 items-center justify-center rounded-full bg-node-canvas/80 text-node-foreground backdrop-blur transition-colors hover:bg-node-canvas"
            >
              {isMuted ? (
                <VolumeX className="size-4" />
              ) : (
                <Volume2 className="size-4" />
              )}
            </button>

            {/* 替换 —— 右上、hover 露出，nodrag。 */}
            <button
              type="button"
              onClick={openFilePicker}
              disabled={isUploading}
              aria-label={t('replace')}
              title={t('replace')}
              className="nodrag absolute right-2 top-2 z-canvas-selection flex items-center gap-1.5 rounded-full bg-node-canvas/80 px-2.5 py-1 text-2xs font-semibold text-node-foreground opacity-0 backdrop-blur transition-opacity hover:bg-node-canvas focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-60"
            >
              <Upload className="size-3" />
              {t('replace')}
            </button>
          </>
        ) : (
          // 空态：居中上传钮（nodrag），四周窗面留作可拖区。
          <button
            type="button"
            onClick={openFilePicker}
            disabled={isUploading}
            className="nodrag absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 rounded-lg px-4 py-3 text-node-muted transition-colors hover:text-node-foreground disabled:opacity-60"
          >
            <Video className="size-8" />
            <span className="text-center text-xs leading-5">
              {t('emptyPreview')}
            </span>
          </button>
        )}

        {/* FB-4 高级上传加载: frosted shimmer veil + pulsing glyph + filename +
            indeterminate bar while the clip uploads. */}
        {isUploading ? (
          <div className="node-upload-loading" aria-live="polite">
            <span className="relative z-10 flex size-10 items-center justify-center rounded-full bg-node-canvas/70 text-node-foreground">
              <Upload className="size-4 animate-pulse" />
            </span>
            <span className="relative z-10 text-2xs font-semibold text-node-foreground">
              {t('uploading')}
            </span>
            {uploadingFileName ? (
              <span className="relative z-10 w-full truncate px-4 text-center text-3xs text-node-muted">
                {uploadingFileName}
              </span>
            ) : null}
            <div className="node-canvas-progress-track relative z-10 mt-1 h-0.5 w-24 rounded-full bg-node-panel-inner" />
          </div>
        ) : null}
      </div>
    </div>
  )
})
