'use client'

/**
 * 音色节点展开态的**音色面板**（第三期 · 画布 C3c-②Q · 盘点 §1 `VoiceNode` +
 * §2 `VoiceDetailBody`）。
 *
 * v4 之前这一整块分住两处：卡面（四态圆槽 + 声纹 + 空态「选择音色」）在
 * `nodes/VoiceNode.tsx`(511)，参数与归属（语速 / 音量 / 情绪 / 归属角色 /
 * 声音库 / 上传）在 `node-detail/VoiceDetailBody.tsx`(823)，中间隔着一张覆盖面板。
 * v4 取消了覆盖面板（§2.2「就地展开」），两块因此合成一块。
 *
 * ── 三条纪律 ──────────────────────────────────────────────────────────
 * ① **写入全部走 `useNodeV4Canvas()`** —— `onApplyOp(set_voice_profile / set_field)`
 *    与 `onSetMedia`。⛔ 不碰 state、不自己 setNodes。
 * ② **四态与 status 降级不在这里判** —— 判据住 `lib/node-v4-voice.ts`，卡面、
 *    槽架、送出预览读同一份（legacy 那份住在渲染函数里，于是同一条规则有三份）。
 * ③ **声音库复用现成件** —— `FishVoiceLibraryDialog`（内含 `VoiceSelector`），
 *    ⛔ 不为画布另写一份检索 UI。
 *
 * 视觉走脊柱令牌：`bg-card` / `border` / `rounded-xl`，唯一强调色 `--primary`，
 * 字号只用 `text-md` / `text-2sm` / `text-2xs`。⛔ 无 Tailwind 任意值。
 */

import { useCallback, useId, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'
import { ParamSlider } from '@/components/ui/param-slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { TTS_SPEED_RANGE, TTS_VOLUME_RANGE } from '@/constants/audio-options'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import {
  NODE_STUDIO_VOICE_EMOTION_IDS,
  NODE_STUDIO_VOICE_EMOTIONS,
} from '@/constants/node-studio'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import {
  buildV4VoiceWaveformPath,
  readV4VoiceAudioUrl,
  resolveV4VoiceSlotState,
  showsV4VoiceSynthesisParams,
  V4_VOICE_SLOT_STATE_IDS,
  V4_VOICE_WAVEFORM,
  v4VoiceWaveformPlayedWidth,
} from '@/lib/node-v4-voice'
import { cn } from '@/lib/utils'
import { useNodeUploadV4 } from '@/hooks/node/use-node-upload-v4'
import type { NodeV4, NodeV4AudioData } from '@/types/node-workflow'

import { AudioOwnerPicker } from '../../../studio-shared/primitives/AudioOwnerPicker'
import { FishVoiceLibraryDialog } from '../../FishVoiceLibraryDialog'
import { useNodeV4Canvas } from './NodeV4Context'
import { NodeV4MediaWell } from './NodeV4MediaWell'

const WAVEFORM_PATH = buildV4VoiceWaveformPath()

export interface AudioNodeV4VoiceProps {
  readonly node: NodeV4
  readonly data: NodeV4AudioData
}

export function AudioNodeV4Voice({ node, data }: AudioNodeV4VoiceProps) {
  const t = useTranslations('StudioNode.v4.voice')
  const canvas = useNodeV4Canvas()
  const clipId = useId()
  const audioRef = useRef<HTMLAudioElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)

  const slotState = resolveV4VoiceSlotState(data)
  const audioUrl = readV4VoiceAudioUrl(data)
  const profile = data.voiceProfile

  // 换了音色 = `<audio>` 的 src 变了，它自己的播放态在 React 之外被重置了。
  // 用「渲染期调整 state」而不是 effect：少一帧用旧进度画出来的条。
  const [playbackUrl, setPlaybackUrl] = useState(audioUrl)
  if (playbackUrl !== audioUrl) {
    setPlaybackUrl(audioUrl)
    setIsPlaying(false)
    setProgress(0)
  }

  /** 归属角色的候选 = 画布上所有已命名的角色图节点（legacy 同一条判据）。 */
  const ownerCandidates = useMemo(
    () =>
      Array.from(
        new Set(
          canvas.nodes
            .filter(
              (item) =>
                item.data.kind === NODE_MEDIA_KIND_IDS.image &&
                item.data.subtype === 'character',
            )
            .map((item) =>
              item.data.kind === NODE_MEDIA_KIND_IDS.image
                ? (item.data.characterName ?? item.data.name)
                : item.data.name,
            )
            .filter((name): name is string => Boolean(name)),
        ),
      ),
    [canvas.nodes],
  )

  const patchProfile = useCallback(
    (patch: NonNullable<NodeV4AudioData['voiceProfile']>) => {
      void canvas.onApplyOp({
        op: NODE_ASSISTANT_OP_V4_IDS.setVoiceProfile,
        target: node.id,
        profile: patch,
      })
    },
    [canvas, node.id],
  )

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) void audio.play().catch(() => setIsPlaying(false))
    else audio.pause()
  }, [])

  // 上传走**同一条回填链**：patch 由 `useNodeUploadV4` 装配，落进 v4 当前版本
  // 条目（`onSetMedia`）。⛔ 不在这里另发明字段（字段集见 `NodeV4MediaPatch`）。
  const upload = useNodeUploadV4()
  const runUpload = useCallback(
    async (file: File) => {
      const patch = await upload.upload('audio', file, data.name)
      if (patch) canvas.onSetMedia(node.id, patch)
    },
    [upload, canvas, node.id, data.name],
  )
  const retryUpload = useCallback(async () => {
    const patch = await upload.retry()
    if (patch) canvas.onSetMedia(node.id, patch)
  }, [upload, canvas, node.id])

  const playedWidth = v4VoiceWaveformPlayedWidth(progress)

  return (
    // ⛔ 不做卡中卡：分区靠留白分层，声纹面自己坐进一口沉底的井里。
    <section data-voice-panel={slotState} className="flex flex-col gap-4">
      {/* ── 四态槽 + 声纹（沉底的井）─────────────────────────────────── */}
      <NodeV4MediaWell testId="voice" className="flex items-center gap-3 p-3">
        <button
          type="button"
          data-voice-slot={slotState}
          aria-label={t(`slotStates.${slotState}`)}
          disabled={slotState === V4_VOICE_SLOT_STATE_IDS.loading}
          onClick={() => {
            if (slotState === V4_VOICE_SLOT_STATE_IDS.empty) {
              setLibraryOpen(true)
              return
            }
            if (slotState === V4_VOICE_SLOT_STATE_IDS.failed || !audioUrl) {
              setLibraryOpen(true)
              return
            }
            togglePlay()
          }}
          className={cn(
            // 44px 玻璃圆钮：触屏命中区底线，且它是井里唯一的可点物。
            'flex size-11 shrink-0 items-center justify-center rounded-full border text-2xs surface-glass shadow-node-chrome',
            slotState === V4_VOICE_SLOT_STATE_IDS.failed &&
              'border-destructive text-destructive',
            slotState === V4_VOICE_SLOT_STATE_IDS.bound &&
              'border-primary text-primary',
          )}
        >
          {slotState === V4_VOICE_SLOT_STATE_IDS.loading
            ? '↻'
            : slotState === V4_VOICE_SLOT_STATE_IDS.failed
              ? '▲'
              : slotState === V4_VOICE_SLOT_STATE_IDS.empty
                ? '＋'
                : isPlaying
                  ? '❚❚'
                  : '▶'}
        </button>

        <div className="min-w-0 flex-1">
          <svg
            data-voice-waveform
            width={V4_VOICE_WAVEFORM.width}
            height={V4_VOICE_WAVEFORM.height}
            viewBox={`0 0 ${V4_VOICE_WAVEFORM.width} ${V4_VOICE_WAVEFORM.height}`}
            role="presentation"
            className="max-w-full"
          >
            <defs>
              <clipPath id={`${clipId}-played`}>
                <rect
                  x={0}
                  y={0}
                  width={playedWidth}
                  height={V4_VOICE_WAVEFORM.height}
                />
              </clipPath>
            </defs>
            <path
              d={WAVEFORM_PATH}
              fill="none"
              strokeWidth={2}
              className="stroke-muted-foreground/40"
            />
            {/* 已播段用强调色重画一遍并按进度裁切 —— 一条线两种颜色，⛔ 不叠两条
                互相错位的线。 */}
            <path
              d={WAVEFORM_PATH}
              fill="none"
              strokeWidth={2}
              clipPath={`url(#${clipId}-played)`}
              className="stroke-primary"
            />
          </svg>
          <p className="truncate font-mono text-3xs text-muted-foreground">
            {profile?.provider ?? t('providerFallback')}
            {profile?.voiceId ? ` · ${profile.voiceId}` : null}
          </p>
          {/* 诚实文案：没有样本就说没有，⛔ 不拿一个点不响的播放钮糊过去。 */}
          {!audioUrl ? (
            <p data-voice-no-sample className="text-3xs text-muted-foreground">
              {t('noSample')}
            </p>
          ) : null}
        </div>
      </NodeV4MediaWell>

      {audioUrl ? (
        // 隐藏的原生元素只负责放音与报进度；可见的控件是上面那颗圆槽。
        <audio
          ref={audioRef}
          src={audioUrl}
          hidden
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => {
            setIsPlaying(false)
            setProgress(0)
          }}
          onTimeUpdate={(event) => {
            const el = event.currentTarget
            setProgress(el.duration > 0 ? el.currentTime / el.duration : 0)
          }}
        />
      ) : null}

      {/* ── 来源：声音库 / 上传 ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-voice-library
          onClick={() => setLibraryOpen(true)}
        >
          {t('openLibrary')}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void runUpload(file)
            event.target.value = ''
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          data-voice-upload
          disabled={upload.isUploading}
          onClick={() => fileRef.current?.click()}
        >
          {upload.isUploading ? t('uploading') : t('uploadAudio')}
        </Button>
      </div>
      {upload.error ? (
        <div data-voice-upload-failed className="space-y-1">
          <p className="text-3xs text-destructive">
            {t('uploadFailed', { reason: upload.error })}
          </p>
          {upload.canRetry ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void retryUpload()}
            >
              {t('uploadRetry')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* ── 归属角色：inset 分组里的 pop-up 行（整行可点）───────────── */}
      <div className="flex min-h-11 items-center gap-3 rounded-xl bg-surface-fill px-3 py-1.5 corner-squircle">
        <span className="shrink-0 text-2sm tracking-node-body">
          {t('ownerLabel')}
        </span>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <AudioOwnerPicker
            value={data.ownerName}
            candidates={ownerCandidates}
            labels={{
              none: t('ownerNone'),
              custom: t('ownerCustom'),
              customPlaceholder: t('ownerCustomPlaceholder'),
              ariaLabel: t('ownerLabel'),
            }}
            onChange={(next) =>
              void canvas.onApplyOp({
                op: NODE_ASSISTANT_OP_V4_IDS.setField,
                target: node.id,
                field: 'ownerName',
                value: next ?? null,
              })
            }
          />
        </div>
      </div>

      {/* ── 合成参数：只在合成这条路上露出 ──────────────────────────── */}
      {showsV4VoiceSynthesisParams(data) ? (
        <div
          data-voice-synthesis
          className="flex flex-col gap-3 rounded-xl bg-surface-fill p-3 corner-squircle"
        >
          <ParamSlider
            label={t('speedLabel')}
            value={profile?.speed ?? TTS_SPEED_RANGE.default}
            min={TTS_SPEED_RANGE.min}
            max={TTS_SPEED_RANGE.max}
            step={TTS_SPEED_RANGE.step}
            formatValue={(value) => `${value.toFixed(1)}×`}
            onChange={(speed) => patchProfile({ speed })}
          />
          <ParamSlider
            label={t('volumeLabel')}
            value={profile?.volume ?? TTS_VOLUME_RANGE.default}
            min={TTS_VOLUME_RANGE.min}
            max={TTS_VOLUME_RANGE.max}
            step={TTS_VOLUME_RANGE.step}
            formatValue={(value) => `${value > 0 ? '+' : ''}${value}`}
            onChange={(volume) => patchProfile({ volume })}
          />
          {/* 情绪是**互斥**参数 → 分段控件，⛔ 不再拿一排 chip 冒充单选。 */}
          <div className="space-y-1.5">
            <p className="text-2sm tracking-node-body">{t('emotionLabel')}</p>
            <ToggleGroup
              type="single"
              variant="segmented"
              className="w-full"
              value={profile?.emotion ?? NODE_STUDIO_VOICE_EMOTION_IDS.none}
              onValueChange={(emotion) => {
                if (!emotion) return
                // `none` = 清掉情绪。补丁里**显式**带一个 `undefined`：
                // 展开覆盖时它会把旧值盖掉，而漏写这个键才是「保持原样」。
                if (emotion === NODE_STUDIO_VOICE_EMOTION_IDS.none) {
                  patchProfile({ emotion: undefined })
                } else {
                  patchProfile({ emotion })
                }
              }}
            >
              {NODE_STUDIO_VOICE_EMOTIONS.map((emotion) => (
                <ToggleGroupItem
                  key={emotion}
                  value={emotion}
                  data-voice-emotion={emotion}
                >
                  {t(`emotions.${emotion}`)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>
      ) : null}

      <FishVoiceLibraryDialog
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        selectedVoiceId={profile?.voiceId ?? null}
        onSelectVoiceId={(voice) => {
          patchProfile({ voiceId: voice.voiceId })
          // 库里自带的试听样本**就是**这条音色的产物 —— 有就落进 `url`，
          // 于是 status 立刻从 idle 升到 ready（判据只有一个：有没有音频）。
          if (voice.sampleUrl) {
            canvas.onSetMedia(node.id, { url: voice.sampleUrl })
          }
        }}
        onVoiceSelectComplete={() => setLibraryOpen(false)}
      />
    </section>
  )
}
