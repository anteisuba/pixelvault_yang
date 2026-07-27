'use client'

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useEdges, useNodes, type NodeProps } from '@xyflow/react'
import {
  AudioWaveform,
  Library,
  Music2,
  Pause,
  Play,
  RotateCw,
  Triangle,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  NODE_STUDIO_VOICE_PROFILE,
  NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS,
} from '@/constants/node-studio'
import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import {
  getNodePrimaryMediaUrl,
  getSeedanceReferenceKind,
} from '@/lib/node-workflow-graph'
import { cn } from '@/lib/utils'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import { FishVoiceLibraryDialog } from '../FishVoiceLibraryDialog'
import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { NodeShell } from './NodeShell'

/**
 * canvas-voice-card.md §2「一条平滑曲线」：16 个半周期的二次贝塞尔，峰值
 * ±13，与 R3-5 时代的柱阵（VOICE_STRIP_WAVEFORM_PEAKS）不是同一件东西——
 * 那份伪随机柱阵已随这次改版删除，装饰性声纹只留这一条路径。
 *
 * 生成方式：把 16 个半周期各画成一段独立的二次贝塞尔弧——起止点都落在基线
 * 上，控制点在这段的水平中点、纵向峰值处。相邻两段共享的基线交点两侧，切
 * 线方向天然对称翻转，曲线因此整体 C¹ 连续（不是分段拼接出来的折中）。
 * 路径与实例数据无关，算一次全局复用，跟旧柱阵常量同样的「峰值艺术挂在
 * 唯一消费者旁边」写法（AudioPlayer 的 FALLBACK_WAVEFORM_PEAKS 先例）。
 */
const VOICE_WAVEFORM_WIDTH = 128
const VOICE_WAVEFORM_HEIGHT = 32
const VOICE_WAVEFORM_HALF_PERIODS = 16
const VOICE_WAVEFORM_AMPLITUDE = 13
const VOICE_WAVEFORM_CENTER_Y = VOICE_WAVEFORM_HEIGHT / 2

function buildVoiceWaveformPath(): string {
  const segment = VOICE_WAVEFORM_WIDTH / VOICE_WAVEFORM_HALF_PERIODS
  let d = `M 0 ${VOICE_WAVEFORM_CENTER_Y}`
  for (let i = 0; i < VOICE_WAVEFORM_HALF_PERIODS; i += 1) {
    const startX = i * segment
    const midX = startX + segment / 2
    const endX = startX + segment
    const peakY =
      VOICE_WAVEFORM_CENTER_Y +
      (i % 2 === 0 ? -VOICE_WAVEFORM_AMPLITUDE : VOICE_WAVEFORM_AMPLITUDE)
    d += ` Q ${midX} ${peakY} ${endX} ${VOICE_WAVEFORM_CENTER_Y}`
  }
  return d
}

const VOICE_WAVEFORM_PATH = buildVoiceWaveformPath()

type VoiceCardState = 'empty' | 'generating' | 'ready' | 'failed'

/**
 * S4（2026-07-27，canvas-voice-card.md）整卡重写。核心改动：
 * - 卡内布局从「四件并排」（v1，已作废）换成「84 封面 + 156 右列」，封面
 *   齐边铺满，播放键压在封面中央的圆形槽——图片卡「唯一主动作居中浮层」
 *   同一个模式，不是各自发明。
 * - 五态收进封面那一个圆形槽（▶/⏸/↻/▲），不再单独盖一个状态徽标。
 * - 卡名迁出卡外，复用 NodeShell.Header 的 EditableNodeLabel + 族图标，
 *   隐藏旧「盖章」状态徽标（hideStatusBadge）。
 * - 删掉时长；「它是音色 donor」继续只靠连线表达，卡上不加字（不变）。
 */
export const VoiceNode = memo(function VoiceNode(
  props: NodeProps<NodeWorkflowNode>,
) {
  const { id, data, selected } = props
  const t = useTranslations('StudioNode.voiceProfile')
  const tPlayer = useTranslations('AudioPlayer')
  const { updateNodeData } = useNodeWorkflowActions()
  const waveformClipId = useId()
  const [libraryOpen, setLibraryOpen] = useState(false)
  // Track the failed cover URL (not a boolean) so picking a new voice with a
  // valid cover recovers instead of staying stuck on the icon fallback.
  const [erroredCover, setErroredCover] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)

  const isFailed = data.status === NODE_STATUS_IDS.failed
  const isGenerating = data.status === NODE_STATUS_IDS.running
  const hasVoiceIdentity = Boolean(
    data.voiceName ||
    data.voiceId ||
    data.voiceReferenceAudioUrl ||
    data.voiceStyle ||
    data.voiceEmotion,
  )
  const cardState: VoiceCardState = isFailed
    ? 'failed'
    : isGenerating
      ? 'generating'
      : hasVoiceIdentity
        ? 'ready'
        : 'empty'
  // 卡外头需要一个 status——真的 failed/running 就如实传，否则配置完就是
  // ready（镜像旧逻辑 hasVoiceProfile ? ready : data.status），只是徽标本身
  // 被 hideStatusBadge 关掉，这里只用来喂 .canvas-card[data-status] 的红边。
  const status =
    isFailed || isGenerating
      ? data.status
      : hasVoiceIdentity
        ? NODE_STATUS_IDS.ready
        : data.status
  // Never fall back to the raw voiceId — it reads as gibberish.
  const voiceTitle = data.voiceName?.trim()
  const providerLabel = data.voiceProvider || t('providerFallback')
  // Cover follows the active source: my-voice keeps its own cover so it never
  // shows the system voice's image (and vice versa).
  const cover =
    data.voiceSource === NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.referenceAudio
      ? data.voiceReferenceCoverImage
      : data.voiceCoverImage
  const showCover = Boolean(cover) && erroredCover !== cover

  // 试听源选择: mirrors VoiceDetailBody's own `activeSource` default-init
  // ternary (`data.voiceSource === referenceAudio ? referenceAudio :
  // fishAudio`) — the persisted field decides which clip is "the" audition
  // clip instead of a second, disconnected notion of "playable". No new
  // audio channel: same `voiceSampleUrl` / `voiceReferenceAudioUrl` fields,
  // same plain <audio> element pattern used everywhere else in this domain.
  // 播放源解析（owner 真机 bug 修复 2026-07-19）: 先按 voiceSource 取对应 clip，
  // 但**只要有一个实际存在的音频 url 就兜底可播**——之前 source='manual'（既非
  // referenceAudio 也非 fishAudio）会落进取 voiceSampleUrl 的分支拿到 null 而禁用，
  // 哪怕 voiceReferenceAudioUrl 明明有有效音频（node-518 就是这情况）。现在两个
  // url 谁有取谁（referenceAudio 优先，它是真正上传/生成的 clip），彻底消除"有音频
  // 却不能播"。
  const isFishAudioSource =
    data.voiceSource !== NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.referenceAudio
  const playableAudioUrl =
    (isFishAudioSource ? data.voiceSampleUrl : data.voiceReferenceAudioUrl) ||
    data.voiceReferenceAudioUrl ||
    data.voiceSampleUrl ||
    null

  // 角色绑定反向查找: a voice node never receives inbound edges (leaf
  // source, see node-connection-rules.ts), but it can feed a character node
  // (`voice → character`, the听觉身份 hop). Walk this node's own outgoing
  // edges for a character target and borrow its V-2 主图 (getNodePrimaryMediaUrl)
  // as the strip's face-crop avatar.
  const allNodes = useNodes<NodeWorkflowNode>()
  const edges = useEdges<NodeWorkflowEdge>()
  const boundCharacterFaceUrl = useMemo(() => {
    for (const edge of edges) {
      if (edge.source !== id) continue
      const target = allNodes.find((node) => node.id === edge.target)
      if (!target || getSeedanceReferenceKind(target) !== 'character') {
        continue
      }
      const url = getNodePrimaryMediaUrl(target.data)
      if (url) return url
    }
    return undefined
  }, [edges, allNodes, id])

  const coverUrl = boundCharacterFaceUrl ?? (showCover ? cover : undefined)

  // A new pick (or a re-bound character) invalidates whatever the <audio>
  // element was mid-way through reporting — syncing to an external signal
  // (the <audio> element's own src just changed, resetting ITS playback
  // state outside React), not derivable from this component's render inputs.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setIsPlaying(false)
    setProgress(0)
  }, [playableAudioUrl])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      void audio.play().catch(() => setIsPlaying(false))
    } else {
      audio.pause()
    }
  }, [])

  const playedWidth = VOICE_WAVEFORM_WIDTH * Math.min(1, Math.max(0, progress))
  const idleClipId = `${waveformClipId}-idle`
  const playedClipId = `${waveformClipId}-played`

  return (
    <NodeShell
      nodeId={id}
      type={NODE_TYPE_IDS.voice}
      selected={selected}
      status={status}
      showTargetHandle={false}
      toolbarData={data}
      className={cn(
        'overflow-hidden canvas-card--w-fixed canvas-voice-card',
        cardState === 'empty' && 'canvas-card--dashed',
      )}
    >
      <NodeShell.Header
        type={NODE_TYPE_IDS.voice}
        status={status}
        title={voiceTitle}
        onRenameCommit={(next) => updateNodeData(id, { voiceName: next })}
        // 五态收进封面圆形槽（见下），卡外的头不重复盖一个旧徽标。
        hideStatusBadge
      />

      <div className="flex">
        <div
          className="canvas-voice-cover"
          data-scrim={cardState === 'empty' ? undefined : 'true'}
        >
          {coverUrl ? (
            // Covers come from arbitrary hosts (uploads/assets/character
            // faces); raw img with no fallback needed — the wrapper itself
            // is the fallback surface underneath.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt=""
              className="size-full object-cover"
              onError={() => setErroredCover(cover ?? null)}
            />
          ) : (
            <div
              className="flex size-full items-center justify-center"
              style={{
                background: 'var(--canvas-fill-control)',
                color: 'var(--canvas-ink-muted)',
              }}
            >
              <AudioWaveform className="size-6" aria-hidden />
            </div>
          )}
          {boundCharacterFaceUrl ? (
            <span
              aria-hidden
              className="absolute bottom-1 right-1 flex size-4 items-center justify-center rounded-full"
              style={{
                background: 'var(--canvas-card-bg)',
                color: 'var(--canvas-port-audio)',
                boxShadow: 'var(--canvas-seg-shadow)',
              }}
            >
              <Music2 className="size-2.5" />
            </span>
          ) : null}

          {playableAudioUrl ? (
            <audio
              ref={audioRef}
              src={playableAudioUrl}
              preload="metadata"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => {
                setIsPlaying(false)
                setProgress(0)
              }}
              onTimeUpdate={(event) => {
                const el = event.currentTarget
                setProgress(el.duration ? el.currentTime / el.duration : 0)
              }}
            />
          ) : null}

          {/* §3「一个槽四种含义」：空态没有槽（下面主动作是「从音频库选择音色」），
              其余三态槽内容互斥。 */}
          {cardState === 'ready' ? (
            <button
              type="button"
              onClick={playableAudioUrl ? togglePlay : undefined}
              disabled={!playableAudioUrl}
              aria-label={
                playableAudioUrl
                  ? isPlaying
                    ? tPlayer('pause')
                    : tPlayer('play')
                  : t('noSample')
              }
              title={
                playableAudioUrl
                  ? isPlaying
                    ? tPlayer('pause')
                    : tPlayer('play')
                  : t('noSample')
              }
              className="canvas-voice-slot nodrag"
            >
              {isPlaying ? (
                <Pause className="size-4" aria-hidden />
              ) : (
                <Play className="ml-0.5 size-4" aria-hidden />
              )}
            </button>
          ) : cardState === 'generating' ? (
            <span className="canvas-voice-slot" aria-hidden>
              <RotateCw className="size-4 animate-spin" />
            </span>
          ) : cardState === 'failed' ? (
            <span className="canvas-voice-slot" data-tone="danger" aria-hidden>
              <Triangle className="size-4" fill="currentColor" />
            </span>
          ) : null}
        </div>

        <div className="canvas-voice-body">
          {cardState === 'empty' ? (
            <button
              type="button"
              onClick={() => setLibraryOpen(true)}
              className="canvas-voice-empty-action canvas-secondary-btn nodrag"
            >
              <Library className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{t('emptyCardAction')}</span>
            </button>
          ) : cardState === 'generating' ? (
            <>
              <p className="canvas-voice-generating-text">
                {t('generatingReference')}
              </p>
              <p className="canvas-voice-meta" title={providerLabel}>
                {providerLabel} · {t('kindSpeech')}
              </p>
            </>
          ) : cardState === 'failed' ? (
            <div className="canvas-voice-failed">
              <p className="canvas-voice-failed-reason line-clamp-2">
                {data.generationError || t('toasts.referenceGenerateFailed')}
              </p>
              <button
                type="button"
                onClick={() => setLibraryOpen(true)}
                className="canvas-secondary-btn nodrag"
              >
                {t('retry')}
              </button>
            </div>
          ) : (
            <>
              <svg
                width={VOICE_WAVEFORM_WIDTH}
                height={VOICE_WAVEFORM_HEIGHT}
                viewBox={`0 0 ${VOICE_WAVEFORM_WIDTH} ${VOICE_WAVEFORM_HEIGHT}`}
                className="canvas-voice-waveform"
                aria-hidden
              >
                <clipPath id={idleClipId}>
                  <rect
                    x={playedWidth}
                    y={0}
                    width={Math.max(0, VOICE_WAVEFORM_WIDTH - playedWidth)}
                    height={VOICE_WAVEFORM_HEIGHT}
                  />
                </clipPath>
                <path
                  d={VOICE_WAVEFORM_PATH}
                  fill="none"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  className="canvas-voice-waveform-idle"
                  clipPath={`url(#${idleClipId})`}
                />
                {playedWidth > 0 ? (
                  <>
                    <clipPath id={playedClipId}>
                      <rect
                        x={0}
                        y={0}
                        width={playedWidth}
                        height={VOICE_WAVEFORM_HEIGHT}
                      />
                    </clipPath>
                    <path
                      d={VOICE_WAVEFORM_PATH}
                      fill="none"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      className="canvas-voice-waveform-played"
                      clipPath={`url(#${playedClipId})`}
                    />
                  </>
                ) : null}
              </svg>
              <p className="canvas-voice-meta" title={providerLabel}>
                {providerLabel} · {t('kindSpeech')}
              </p>
            </>
          )}
        </div>
      </div>

      <FishVoiceLibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        selectedVoiceId={typeof data.voiceId === 'string' ? data.voiceId : null}
        onSelectVoiceId={(voice) => {
          updateNodeData(id, {
            voiceId: voice.voiceId,
            voiceName: voice.name,
            voiceCoverImage: voice.coverImage ?? undefined,
            voiceProvider:
              data.voiceProvider || NODE_STUDIO_VOICE_PROFILE.providerDefault,
            voiceSource: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.fishAudio,
            status: NODE_STATUS_IDS.ready,
          })
          setLibraryOpen(false)
        }}
        onVoiceSelectComplete={() => setLibraryOpen(false)}
      />
    </NodeShell>
  )
})
