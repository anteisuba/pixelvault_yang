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
  NODE_STUDIO_VOICE_CLIP_SOURCE_IDS,
  NODE_STUDIO_VOICE_PROFILE,
  NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS,
} from '@/constants/node-studio'
import { NODE_STATUS_IDS, NODE_TYPE_IDS } from '@/constants/node-types'
import {
  getNodePrimaryMediaUrl,
  getSeedanceReferenceKind,
  readVoiceUrlFromData,
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
  // 「这张卡配置过没有」——只管**空态 vs 非空态**，不回答「发不发得出去」
  // （那是 status 的事，判据是 readVoiceUrlFromData）。两件事分开之后，
  // 「选了音色但还没有语音」既不是空卡、也不是 ready，正是它该在的位置。
  const hasVoiceIdentity = Boolean(
    data.voiceName ||
    data.voiceId ||
    data.voiceClipUrl ||
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

  // 试听源 = 那段参考语音本身（`readVoiceUrlFromData`，与收割层同一个判据）。
  // ⚠ 收敛之前这里是「按 voiceSource 取对应字段 + 两层兜底」的五行解析，那是
  // `voiceSampleUrl` / `voiceReferenceAudioUrl` 两个字段并存时代的产物，也正是
  // 2026-07-19 那个「有音频却不能播」的来源（source='manual' 落进错的分支）。
  // 一个产物一个字段之后，兜底本身就没有存在的理由了。
  // 卡外头需要一个 status——真的 failed/running 就如实传，否则**有音频才算 ready**，
  // 只是徽标本身被 hideStatusBadge 关掉，这里只用来喂 .canvas-card[data-status]。
  // ⚠ 这里曾经是 `hasVoiceIdentity ? ready : data.status`——只要有 voiceId 就盖
  // ready，而 voiceId 单独存在时一个音频 url 都没有（收藏卡那条路，见 VoiceSelector
  // 的 handleToggleFavorite）。那种节点当视频参考音频是发不出去的，卡面却是绿的，
  // 真相只在下游视频节点的槽架里出现。按 2026-08-10「边存在即绑定，能不能发单独用
  // ready 表达」：绑定关系照旧由连线表达，ready 只表示「真的发得出去」。
  // ⚠ 单靠不写 status 改不动这里——本组件**自己重算** status，所以只改两个写入点
  // 是一个渲染上完全看不见的空改。
  // 「发得出去吗」只有一个判据，与收割层同一个函数——不再自己写一条链。
  const sendableAudioUrl = readVoiceUrlFromData(data)
  // ⚠ 没有音频时**不能**直接把 data.status 透传出去：存量节点里躺着的正是旧代码
  // 写死的 `ready`（真机 2026-08-10：元気な女性 / 小爱弥斯 两张卡就是这样，改完
  // 摘要行已说「暂无试听样本」，卡的 data-status 却还是绿的 ready）。发不出去就
  // 不许显示 ready，陈旧的 ready 一律降回 idle。
  const status =
    isFailed || isGenerating
      ? data.status
      : sendableAudioUrl
        ? NODE_STATUS_IDS.ready
        : data.status === NODE_STATUS_IDS.ready
          ? NODE_STATUS_IDS.idle
          : data.status

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
  }, [sendableAudioUrl])

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

          {sendableAudioUrl ? (
            <audio
              ref={audioRef}
              src={sendableAudioUrl}
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
              onClick={sendableAudioUrl ? togglePlay : undefined}
              disabled={!sendableAudioUrl}
              aria-label={
                sendableAudioUrl
                  ? isPlaying
                    ? tPlayer('pause')
                    : tPlayer('play')
                  : t('noSample')
              }
              title={
                sendableAudioUrl
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
              {/* 没有任何音频时，这一行是卡面上唯一说实话的地方——播放键虽然已经
                  disabled，但它的 noSample 只挂在 title/aria-label 上，不悬停永远
                  看不见。复用同一个既有文案，不新增 i18n 键。 */}
              <p className="canvas-voice-meta" title={providerLabel}>
                {providerLabel} ·{' '}
                {sendableAudioUrl ? t('kindSpeech') : t('noSample')}
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
            voiceClipUrl: voice.sampleUrl ?? undefined,
            voiceClipSource: voice.sampleUrl
              ? NODE_STUDIO_VOICE_CLIP_SOURCE_IDS.library
              : undefined,
            // 没拿到那段语音就不能盖 ready —— 那种节点当参考音频发不出去。
            status: voice.sampleUrl
              ? NODE_STATUS_IDS.ready
              : NODE_STATUS_IDS.idle,
          })
          setLibraryOpen(false)
        }}
        onVoiceSelectComplete={() => setLibraryOpen(false)}
      />
    </NodeShell>
  )
})
