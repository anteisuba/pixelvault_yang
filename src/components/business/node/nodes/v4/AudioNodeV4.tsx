'use client'

/**
 * 音频节点（v3 spec §4，画板 `AudioStates` / `AudioSelected` / `AudioQuickListen`）。
 *
 * 四态：**空卡**（72 高、虚线、「上传 · 或写台词生成」）· **有声收起**（卡即波形，
 * 右侧时长；悬停自动播、播放头走波形、左出播放钮）· **选中**（工具条五键 + 版本点
 * + 提示词栏：台词 · 音色 chip · 模型 chip）· **生成中**（矮卡例外：波形位走一条
 * 进度线，spec §1.9）。双击 = 快速听。**无画中框**（spec §4）。
 *
 * ── 四条纪律 ────────────────────────────────────────────────────────────
 * ① **壳全部来自 `chrome/`**（卡骨架 / 工具条 / 提示词栏 / chip 弹层 / 版本点 /
 *    进度线 / 快速看），⛔ 这里不复制任何一件的形态。
 * ② **语气写在台词里**：UI 是 `compileVoiceMarkup` 的编译器前端，文本是唯一真值。
 *    ⛔ 不再有「这条卡的情绪是什么」那个独立字段的编辑入口（v4 的 `voiceProfile.
 *    emotion` 留作存量读，新写入一律进标记）。
 * ③ **类型由模型决定**：选配乐 / 音效模型时音色 chip 消失、占位文案换成描述
 *    （画板原话「不另设类型 chip」）。
 * ④ **写入走 op / 具名回调**：`onSetPrompt` / `onSetModel` / `onApplyOp` /
 *    `onApplyBatch`；媒体回填走 `onSetMedia`（上传与生成都是用户动作）。
 *
 * ⚠ 这个文件取代了 `MediaNodeV4.tsx`（卡头 + 展开态 + `AudioNodeV4Voice` 面板那
 * 一套）。展开态随 spec §4「无画中框」一起删，音色从「卡内一整块面板」降成栏上
 * 一颗 chip。
 */

import { Handle, NodeToolbar as FlowNodeToolbar, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Clapperboard,
  Download,
  FileText,
  MoreHorizontal,
  Pause,
  Play,
  Smile,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { AUDIO_KIND } from '@/constants/audio-options'
import { PROGRESS_TICK_MS } from '@/constants/generation-progress'
import {
  NODE_ASSISTANT_OP_V4_IDS,
  NODE_ASSISTANT_WRITE_MODES,
} from '@/constants/node-assistant-ops'
import { getNodeV4Ports, NODE_SLOT_IDS } from '@/constants/node-slots'
import { NODE_V4_CARD } from '@/constants/node-studio'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
  NODE_V4_TEXT_SUBTYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import { useNodeMediaGenerationV4 } from '@/hooks/node/use-node-media-generation-v4'
import { useNodeUploadV4 } from '@/hooks/node/use-node-upload-v4'
import { getGeneratingStageKey } from '@/lib/generation-progress'
import { renameStableNodeName } from '@/lib/node-display-name'
import { readOutputIndex } from '@/lib/node-output-versions'
import {
  insertVoiceMarkup,
  voiceMarkupDeletionRangeAt,
  type VoiceMarkupInsert,
} from '@/lib/voice-markup'
import type { NodeV4, NodeV4AudioData } from '@/types/node-workflow'

import {
  NodeCardShell,
  NodeFrameProgress,
  NodePromptBar,
  NodeToolbar,
  PORT_CLASS,
  QuickLook,
  VersionDots,
  mentionDeletionRangeAt,
  renderVoicePromptValue,
  type NodeToolbarGroup,
} from './chrome'
import {
  AUDIO_CARD,
  audioVersions,
  formatAudioClock,
  formatAudioSeconds,
  resolveAudioNodeKind,
  showsVoiceChip,
} from './audio/audio-node-model'
import { AudioLineChips } from './audio/AudioLineChips'
import { AudioOwnerMenuItem } from './audio/AudioOwnerMenuItem'
import { AudioTonePopover, TONE_POPOVER_WIDTH } from './audio/AudioTonePopover'
import { AudioVoiceChip } from './audio/AudioVoiceChip'
import { AudioWaveform } from './audio/AudioWaveform'
import { transcribeAudioUrl } from './audio/audio-transcribe'
// ⚠ `toStudioModelOption` 是**两类卡共用**的那一份映射（`apiKeyId → keyId` 等），
// 住在 image 那侧；⛔ 不在音频这边再抄一份，两处对不上选中的模型就会漂。
import { toStudioModelOption } from './image/image-node-model'
import {
  MODEL_PICKER_GROUP_BY,
  ModelPickerPopover,
} from '../../../studio-shared/pickers/ModelPickerPopover'
import { useNodeV4Canvas } from './NodeV4Context'
import { NodeV4ContextMenu } from './NodeV4ContextMenu'
import { triggerNodeV4Download } from './NodeV4SelectionToolbar'

/** 「生镜头」那一批里指代新建镜头的别名（只在这一批之内有效）。 */
const SHOT_BATCH_REF = 'shot'
/** 「转文字」那一批里指代新建文本卡的别名。 */
const TEXT_BATCH_REF = 'line'

/** 两侧端口点。⚠ 槽表读 `NODE_V4_PORTS`，⛔ 不在卡上硬写「一进一出」。 */
function AudioPorts({ node }: { node: NodeV4 }) {
  const t = useTranslations('StudioNode.v4')
  const ports = getNodeV4Ports(node.data.kind, node.data.subtype)
  return (
    <>
      {ports?.inputs.map((spec, index) => (
        <Handle
          key={spec.slot}
          id={spec.slot}
          type="target"
          position={Position.Left}
          data-family={NODE_MEDIA_KIND_IDS.audio}
          data-slot={spec.slot}
          aria-label={t(`slots.${spec.slot}`)}
          className={PORT_CLASS}
          style={{
            top: `${((index + 1) * 100) / ((ports.inputs.length || 1) + 1)}%`,
          }}
        />
      ))}
      {ports?.outputs.map((output, index) => (
        <Handle
          key={output}
          id={output}
          type="source"
          position={Position.Right}
          data-family={NODE_MEDIA_KIND_IDS.audio}
          data-output={output}
          aria-label={t(`outputs.${output}`)}
          className={PORT_CLASS}
          style={{
            top: `${((index + 1) * 100) / ((ports.outputs.length || 1) + 1)}%`,
          }}
        />
      ))}
    </>
  )
}

export function AudioNodeV4({ id, data, selected }: NodeProps) {
  const t = useTranslations('StudioNode.v4')
  const tAudio = useTranslations('StudioNode.v4.audio')
  const tStage = useTranslations('StudioV3')
  const canvas = useNodeV4Canvas()
  const generation = useNodeMediaGenerationV4()
  const upload = useNodeUploadV4()
  const audioData = data as unknown as NodeV4AudioData

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [quickListen, setQuickListen] = useState(false)
  const [draft, setDraft] = useState(audioData.prompt ?? '')
  const [syncedPrompt, setSyncedPrompt] = useState(audioData.prompt ?? '')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(audioData.durationSec ?? 0)
  const [transcribing, setTranscribing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  /** 提示词栏那只 textarea —— 插标记与退格删 chip 都要问它光标在哪
   *  （`NodePromptBar.inputRef`，S0-fix2 补的能力）。 */
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  /** 最后一次报上来的光标位置（`NodePromptBar.onSelectionChange`）。 */
  const caretRef = useRef<number | null>(null)

  // 助手 `set_prompt` 落下来时草稿跟上 —— 渲染期同步，⛔ 不放 effect 里。
  const currentPrompt = audioData.prompt ?? ''
  if (syncedPrompt !== currentPrompt) {
    setSyncedPrompt(currentPrompt)
    setDraft(currentPrompt)
  }

  // 换了一版 = `<audio>` 的 src 变了，播放态在 React 之外被重置了。
  const [playbackUrl, setPlaybackUrl] = useState(audioData.url)
  if (playbackUrl !== audioData.url) {
    setPlaybackUrl(audioData.url)
    setPlaying(false)
    setProgress(0)
  }

  const generating = Boolean(audioData.mediaJobId) || startedAt !== null

  useEffect(() => {
    if (!generating) return
    const begin = startedAt ?? Date.now()
    const tick = () => setElapsed((Date.now() - begin) / 1000)
    tick()
    const timer = window.setInterval(tick, PROGRESS_TICK_MS)
    return () => window.clearInterval(timer)
  }, [generating, startedAt])

  const latest = useRef({ upload, canvas, id, name: audioData.name })
  useEffect(() => {
    latest.current = { upload, canvas, id, name: audioData.name }
  })
  const runUpload = useCallback((file: File) => {
    const bound = latest.current
    void bound.upload.upload('audio', file, bound.name).then((patch) => {
      if (!patch) return
      bound.canvas.onSetMedia(bound.id, patch)
    })
  }, [])

  const node = canvas.nodes.find((item) => item.id === id) as NodeV4 | undefined
  if (!node) return null

  const audioKind = resolveAudioNodeKind(audioData)
  const speech = showsVoiceChip(audioKind)
  const versions = audioVersions(audioData)
  const versionIndex = readOutputIndex(audioData)
  const selectVersion = (index: number) =>
    void canvas.onApplyOp({
      op: NODE_ASSISTANT_OP_V4_IDS.setOutputVersion,
      target: id,
      index,
    })
  const showChrome = Boolean(selected) && canvas.selectedNodeIds.length < 2
  const modelOptions =
    canvas.modelOptionsByKind[NODE_MEDIA_KIND_IDS.audio] ?? []
  const seconds = duration || (audioData.durationSec ?? 0)
  /** 「归属角色」的候选 = 画布上的角色卡（`characterName` 优先于稳定名）。 */
  const characterNames = canvas.nodes
    .filter(
      (item) =>
        item.data.kind === NODE_MEDIA_KIND_IDS.image &&
        item.data.subtype === NODE_V4_IMAGE_SUBTYPE_IDS.character,
    )
    .map((item) =>
      'characterName' in item.data && item.data.characterName
        ? item.data.characterName
        : item.data.name,
    )
  /** `@` 提及的候选名 —— 栏里画 chip 与退格整颗删都按它切。 */
  const mentionNames = canvas.nodes
    .filter((item) => item.id !== id)
    .map((item) => item.data.name)

  const renameNode = (next: string): boolean => {
    const taken = new Set(
      canvas.nodes
        .filter((item) => item.id !== id)
        .map((item) => item.data.name),
    )
    const result = renameStableNodeName(audioData.name, next, taken)
    if (!result.ok) return false
    void canvas.onApplyOp({
      op: NODE_ASSISTANT_OP_V4_IDS.setField,
      target: id,
      field: 'name',
      value: result.name,
    })
    return true
  }

  const patchProfile = (patch: NonNullable<NodeV4AudioData['voiceProfile']>) =>
    void canvas.onApplyOp({
      op: NODE_ASSISTANT_OP_V4_IDS.setVoiceProfile,
      target: id,
      profile: patch,
    })

  const submitPrompt = () => {
    if (draft.trim().length === 0 || generating) return
    if (draft !== currentPrompt) canvas.onSetPrompt(id, draft)
    setStartedAt(Date.now())
    void generation
      .generateNode(
        id,
        { nodes: canvas.nodes, edges: canvas.edges },
        {
          // ⚠ 送出去的是**编译后**的台词（`[very angry]…`）——原文留在节点上，
          // 编译只发生在送出的那一刻（装配层同一条：`planV4Generation`）。
          prompt: draft,
          onJobCreated: (jobId) => canvas.onSetMedia(id, { mediaJobId: jobId }),
          onEach: (result) => {
            if (!result.success) return
            canvas.onSetMedia(id, {
              url: result.mediaUrl,
              generationId: result.generation.id,
              mediaJobId: undefined,
            })
          },
        },
      )
      .then(() => setStartedAt(null))
  }

  const togglePlay = () => {
    const el = audioRef.current
    if (!el) return
    if (el.paused) void el.play().catch(() => setPlaying(false))
    else el.pause()
  }

  const runTranscribe = async () => {
    if (!audioData.url || transcribing) return
    setTranscribing(true)
    const result = await transcribeAudioUrl(audioData.url, audioData.name)
    setTranscribing(false)
    if (!result.ok || !result.text) {
      toast.error(tAudio('toolbar.transcribeFailed'))
      return
    }
    // 一批两条：建一张文本卡 + 把它连成这张卡的**台词来源**（`text` 槽）。
    // ⚠ 方向是 text → audio：文本卡是叶子（端口表 `TEXT_PORTS`），音频卡才有
    // `text` 入口槽。⛔ 不反着连——那条边根本不合法。
    void canvas.onApplyBatch([
      {
        op: NODE_ASSISTANT_OP_V4_IDS.addNode,
        kind: NODE_MEDIA_KIND_IDS.text,
        subtype: NODE_V4_TEXT_SUBTYPE_IDS.script,
        ref: TEXT_BATCH_REF,
      },
      {
        op: NODE_ASSISTANT_OP_V4_IDS.setText,
        target: TEXT_BATCH_REF,
        body: result.text,
        mode: NODE_ASSISTANT_WRITE_MODES[0],
      },
      {
        op: NODE_ASSISTANT_OP_V4_IDS.connect,
        source: TEXT_BATCH_REF,
        target: id,
        slot: NODE_SLOT_IDS.text,
      },
    ])
  }

  const insertMarkup = (next: { text: string; caret: number }) => {
    setDraft(next.text)
    caretRef.current = next.caret
    // 焦点与光标回到栏里：插完还要接着写。
    window.requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(next.caret, next.caret)
    })
  }

  const toolbarGroups: readonly NodeToolbarGroup[] = [
    [
      {
        id: 'tone',
        label: tAudio('toolbar.tone'),
        icon: Smile,
        disabled: !speech,
        onSelect: () => {},
        // ⚠ 走 `panel`（Popover）而不是 `menu`（DropdownMenu）：面板里有自定义
        // 描述输入框与强度分段，DropdownMenu 的 typeahead 会把按键全吞掉。
        panel: (
          <div style={{ width: TONE_POPOVER_WIDTH }}>
            <AudioTonePopover
              onInsert={(inserts: readonly VoiceMarkupInsert[]) =>
                // 插在光标所在句首；没碰过输入框就按整段末尾算。
                insertMarkup(
                  insertVoiceMarkup(
                    draft,
                    caretRef.current ?? draft.length,
                    inserts,
                  ),
                )
              }
            />
          </div>
        ),
      },
      {
        id: 'transcribe',
        label: tAudio('toolbar.transcribe'),
        icon: FileText,
        disabled: !audioData.url || transcribing,
        onSelect: () => void runTranscribe(),
      },
      {
        id: 'shot',
        label: tAudio('toolbar.shot'),
        icon: Clapperboard,
        // 一批两条：建镜头 + 把这段声音连成它的**音轨**（`voice` 槽）。
        onSelect: () =>
          void canvas.onApplyBatch([
            {
              op: NODE_ASSISTANT_OP_V4_IDS.addNode,
              kind: NODE_MEDIA_KIND_IDS.video,
              subtype: NODE_V4_VIDEO_SUBTYPE_IDS.shot,
              ref: SHOT_BATCH_REF,
              ...(audioData.shotNo === undefined
                ? {}
                : { shotNo: audioData.shotNo }),
            },
            {
              op: NODE_ASSISTANT_OP_V4_IDS.connect,
              source: id,
              target: SHOT_BATCH_REF,
              slot: NODE_SLOT_IDS.voice,
            },
          ]),
      },
    ],
    [
      {
        id: 'download',
        label: t('toolbar.download'),
        icon: Download,
        disabled: !audioData.url,
        onSelect: () => audioData.url && triggerNodeV4Download(audioData.url),
      },
      {
        id: 'more',
        label: tAudio('toolbar.more'),
        icon: MoreHorizontal,
        onSelect: () => {},
        menu: (
          <>
            <DropdownMenuItem
              data-audio-more="upload"
              onSelect={() => fileRef.current?.click()}
            >
              {tAudio('add.upload')}
            </DropdownMenuItem>
            <AudioOwnerMenuItem
              value={audioData.ownerName}
              candidates={characterNames}
              onChange={(next) =>
                void canvas.onApplyOp({
                  op: NODE_ASSISTANT_OP_V4_IDS.setField,
                  target: id,
                  field: 'ownerName',
                  value: next ?? '',
                })
              }
            />
            <DropdownMenuItem
              data-audio-more="duplicate"
              onSelect={() =>
                void canvas.onApplyOp({
                  op: NODE_ASSISTANT_OP_V4_IDS.addNode,
                  kind: NODE_MEDIA_KIND_IDS.audio,
                  subtype: audioData.subtype,
                })
              }
            >
              {t('toolbar.clone')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              data-audio-more="delete"
              onSelect={() =>
                void canvas.onApplyOp({
                  op: NODE_ASSISTANT_OP_V4_IDS.delete,
                  target: id,
                })
              }
            >
              {t('toolbar.delete')}
            </DropdownMenuItem>
          </>
        ),
      },
    ],
  ]

  return (
    <div
      data-node-kind={NODE_MEDIA_KIND_IDS.audio}
      data-node-subtype={audioData.subtype}
      data-audio-kind={audioKind}
      data-generating={generating ? 'true' : 'false'}
      className="relative"
      onContextMenu={(event) => {
        event.preventDefault()
        setMenu({ x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY })
      }}
      onDragOver={(event) => {
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={(event) => {
        const file = Array.from(event.dataTransfer?.files ?? []).find((item) =>
          item.type.startsWith('audio/'),
        )
        if (!file) return
        event.preventDefault()
        event.stopPropagation()
        runUpload(file)
      }}
      onDoubleClick={() => {
        if (audioData.url) setQuickListen(true)
      }}
    >
      <FlowNodeToolbar isVisible={showChrome} position={Position.Top}>
        <NodeToolbar
          groups={toolbarGroups}
          ariaLabel={tAudio('toolbar.label')}
        />
      </FlowNodeToolbar>

      <NodeCardShell
        name={audioData.name}
        renameAriaLabel={t('renameNode')}
        onRename={renameNode}
        selected={Boolean(selected)}
        width={NODE_V4_CARD.collapsedWidth}
        emptyHint={tAudio('emptyHint')}
        emptyAddAriaLabel={tAudio('add.upload')}
        emptyHeight={AUDIO_CARD.height}
        onEmptyAdd={() => fileRef.current?.click()}
        changed={canvas.changedNodeIds.includes(id)}
        ports={<AudioPorts node={node} />}
      >
        {audioData.url || generating ? (
          <div
            data-audio-surface={audioData.url ? 'ready' : 'pending'}
            className="group relative flex items-center gap-3 px-4"
            style={{ height: AUDIO_CARD.contentHeight }}
            // 悬停自动播（spec §4）。⚠ 只有有声且没在生成时才响。
            onMouseEnter={() => {
              if (!audioData.url || generating) return
              const el = audioRef.current
              if (el?.paused) void el.play().catch(() => setPlaying(false))
            }}
            onMouseLeave={() => {
              const el = audioRef.current
              if (!el || el.paused) return
              el.pause()
              el.currentTime = 0
              setProgress(0)
            }}
          >
            {audioData.url && !generating ? (
              <>
                {/* 播放钮只在悬停/播放时出现（画板：左出一颗玻璃圆钮）。 */}
                <button
                  type="button"
                  data-audio-play
                  aria-label={playing ? tAudio('pause') : tAudio('play')}
                  onClick={(event) => {
                    event.stopPropagation()
                    togglePlay()
                  }}
                  className="nodrag nopan flex size-7.5 shrink-0 items-center justify-center rounded-full opacity-0 transition-opacity duration-fast surface-glass shadow-node-chrome group-hover:opacity-100 hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {playing ? (
                    <Pause aria-hidden className="size-3.5" />
                  ) : (
                    <Play aria-hidden className="size-3.5" />
                  )}
                </button>
                <AudioWaveform
                  seed={audioData.url}
                  progress={progress}
                  className="min-w-0 flex-1"
                />
                {/* ⚠ 时长**恒显**（画板右侧永远有一行读数，卡的宽度才不会在
                    元数据回来的那一刻跳一下）。还没回来时写占位 `--:--` 而不是
                    「0s」——占位是「还不知道」，`0s` 是一句假话。 */}
                <span
                  data-audio-duration
                  data-known={seconds > 0 ? 'true' : 'false'}
                  className="shrink-0 text-xs tabular-nums text-muted-foreground"
                >
                  {seconds <= 0
                    ? tAudio('durationUnknown')
                    : playing
                      ? `${formatAudioClock(progress * seconds)} / ${formatAudioSeconds(seconds)}`
                      : formatAudioSeconds(seconds)}
                </span>
              </>
            ) : null}
            {generating && (
              // 矮卡例外（spec §1.9）：波形位走一条进度线 + 百分比。
              <NodeFrameProgress
                variant="line"
                elapsedSeconds={elapsed}
                stageLabel={tStage(
                  `generatingOverlayStages.${getGeneratingStageKey(elapsed)}` as const,
                )}
              />
            )}
          </div>
        ) : undefined}
      </NodeCardShell>

      {audioData.url ? (
        <audio
          ref={audioRef}
          src={audioData.url}
          // ⚠ 显式要元数据：`hidden` 的 `<audio>` 浏览器默认不预取，`duration` 会
          // 一直是 NaN，卡上就永远停在 `--:--`（真机 2026-09-10 实测 readyState=0）。
          preload="metadata"
          hidden
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onLoadedMetadata={(event) => {
            const value = event.currentTarget.duration
            if (Number.isFinite(value)) setDuration(value)
          }}
          onEnded={() => {
            setPlaying(false)
            setProgress(0)
          }}
          onTimeUpdate={(event) => {
            const el = event.currentTarget
            setProgress(el.duration > 0 ? el.currentTime / el.duration : 0)
          }}
        />
      ) : null}

      {showChrome && (
        <FlowNodeToolbar isVisible position={Position.Bottom}>
          <div className="flex flex-col items-center gap-2.5">
            <VersionDots
              count={versions.length}
              current={Math.min(versionIndex, versions.length - 1)}
              onSelect={selectVersion}
              ariaLabel={t('chrome.versions')}
              labelOf={(index) =>
                t('chrome.versionOf', {
                  index: index + 1,
                  total: versions.length,
                })
              }
            />
            <NodePromptBar
              value={draft}
              onValueChange={setDraft}
              onSubmit={submitPrompt}
              generating={generating}
              onCancel={() => setStartedAt(null)}
              placeholder={
                speech
                  ? tAudio('promptPlaceholder')
                  : audioKind === AUDIO_KIND.MUSIC
                    ? tAudio('promptPlaceholderMusic')
                    : tAudio('promptPlaceholderSfx')
              }
              ariaLabel={tAudio('promptLabel')}
              className="w-130"
              inputRef={inputRef}
              onSelectionChange={(range) => {
                caretRef.current = range.start
              }}
              // 行内 chip 画在**输入框内部**（画板：`[愤怒]` 与 `@莫宁` 就在台词
              // 那一行里）。文本仍是唯一真值，这一层只给字符段加底色。
              renderValue={(text) =>
                renderVoicePromptValue(text, {
                  mentions: { names: mentionNames },
                  titleOf: (label, intensityLabel) =>
                    intensityLabel
                      ? tAudio('tone.chipTitle', {
                          intensity: intensityLabel,
                          label,
                        })
                      : label,
                })
              }
              addMenu={
                <>
                  <DropdownMenuItem
                    data-audio-add="upload"
                    onSelect={() => fileRef.current?.click()}
                  >
                    {tAudio('add.upload')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    data-audio-add="mention"
                    onSelect={() => setDraft(`${draft}@`)}
                  >
                    {tAudio('add.mention')}
                  </DropdownMenuItem>
                </>
              }
              textareaProps={{
                onKeyDown: (event) => {
                  const caret = event.currentTarget.selectionStart
                  caretRef.current = caret
                  if (
                    event.key !== 'Backspace' ||
                    event.currentTarget.selectionEnd !== caret
                  ) {
                    return
                  }
                  // 退格删**整颗** chip（spec §1.7 的同一条手感）——语气标记与
                  // `@` 引用同一条判据，谁的尾巴压在光标上就删谁。
                  const range =
                    voiceMarkupDeletionRangeAt(draft, caret) ??
                    mentionDeletionRangeAt(draft, caret, {
                      names: mentionNames,
                    })
                  if (!range) return
                  event.preventDefault()
                  const next =
                    draft.slice(0, range.start) + draft.slice(range.end)
                  setDraft(next)
                  caretRef.current = range.start
                  window.requestAnimationFrame(() =>
                    inputRef.current?.setSelectionRange(
                      range.start,
                      range.start,
                    ),
                  )
                },
              }}
              chips={[
                speech ? (
                  <AudioVoiceChip
                    key="voice"
                    voiceId={audioData.voiceProfile?.voiceId}
                    speed={audioData.voiceProfile?.speed}
                    volume={audioData.voiceProfile?.volume}
                    disabled={generating}
                    onSelectVoice={(voice) => {
                      patchProfile({ voiceId: voice.voiceId })
                      // 库里自带的试听样本**就是**这条音色的产物 —— 有就落进 `url`。
                      if (voice.sampleUrl && !audioData.url) {
                        canvas.onSetMedia(id, { url: voice.sampleUrl })
                      }
                    }}
                    onSpeedChange={(speed) => patchProfile({ speed })}
                    onVolumeChange={(volume) => patchProfile({ volume })}
                  />
                ) : null,
                modelOptions.length > 0 ? (
                  // 与图片卡同一份弹层（渠道行 / 健康点 / 缺 key 灰显全都沿用），
                  // 只是分组维度换成**类型**：语音 / 配乐 / 音效（画板「组就是类型」）。
                  <ModelPickerPopover
                    key="model"
                    options={modelOptions.map(toStudioModelOption)}
                    value={audioData.model?.optionId ?? null}
                    groupBy={MODEL_PICKER_GROUP_BY.kind}
                    memoryScope={NODE_MEDIA_KIND_IDS.audio}
                    disabled={generating}
                    triggerEmptyLabel={tAudio('model.title')}
                    onChange={(option) => {
                      const picked = modelOptions.find(
                        (item) => item.optionId === option.optionId,
                      )
                      if (!picked) return
                      canvas.onSetModel(id, {
                        optionId: picked.optionId,
                        modelId: picked.modelId,
                        adapterType: picked.adapterType,
                        providerConfig: picked.providerConfig,
                        ...(picked.apiKeyId
                          ? { apiKeyId: picked.apiKeyId }
                          : {}),
                      })
                    }}
                  />
                ) : null,
              ].filter(Boolean)}
            />
          </div>
        </FlowNodeToolbar>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="audio/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) runUpload(file)
          event.target.value = ''
        }}
      />

      {quickListen && audioData.url ? (
        <QuickLook
          open
          onClose={() => setQuickListen(false)}
          ariaLabel={audioData.name}
          {...(versions.length > 1
            ? {
                versionCount: versions.length,
                versionIndex,
                onVersionChange: selectVersion,
              }
            : {})}
          readout={
            seconds > 0
              ? tAudio('readout', {
                  clock: formatAudioClock(progress * seconds),
                  total: formatAudioSeconds(seconds),
                })
              : undefined
          }
          onDownload={() => triggerNodeV4Download(audioData.url as string)}
        >
          <div
            data-audio-quick-listen
            className="flex w-160 max-w-full flex-col gap-4"
          >
            <div className="flex items-center gap-3.5">
              <button
                type="button"
                data-audio-quick-play
                aria-label={playing ? tAudio('pause') : tAudio('play')}
                onClick={togglePlay}
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {playing ? (
                  <Pause aria-hidden className="size-4" />
                ) : (
                  <Play aria-hidden className="size-4" />
                )}
              </button>
              <AudioWaveform
                seed={audioData.url}
                progress={progress}
                barCount={AUDIO_CARD.quickListenBarCount}
                height={AUDIO_CARD.quickListenHeight}
                className="min-w-0 flex-1"
              />
            </div>
            {/* 台词只读（画板：一行正文，⛔ 无参数）。 */}
            {currentPrompt ? (
              <AudioLineChips text={currentPrompt} variant="plain" />
            ) : null}
          </div>
        </QuickLook>
      ) : null}

      {menu ? (
        <NodeV4ContextMenu
          node={node}
          x={menu.x}
          y={menu.y}
          {...(audioData.url ? { mediaUrl: audioData.url } : {})}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  )
}
