'use client'

/**
 * 音频节点（v3 spec §4，画板 `AudioStates` / `AudioSelected` / `AudioQuickListen`）。
 *
 * 四态：**空卡**（72 高、虚线、「上传 · 选一段现成的 · 或写台词生成」）· **有声
 * 收起**（左侧常驻播放钮 + 波形逐根走进度 + 右侧读数）· **选中**（工具条五键 +
 * 版本点 + 提示词栏：台词 · 音色 chip · 模型 chip）· **生成中**（矮卡例外：波形位
 * 走一条进度线，spec §1.9）。
 *
 * ⛔ **不悬停自动播、不双击**（spec §4 v2，owner 2026-09-10 重定）：矮卡挤在画布上，
 * 鼠标扫过一排音频卡就是一排声音同时炸开；快速听那一层也随之删（`QuickLook` 不再
 * 挂在这张卡上），要听就点那颗钮。
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

import { Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import { AnimatePresence } from 'motion/react'
import { useTranslations } from 'next-intl'

import { useVoiceCover } from '@/hooks/use-voice-cover'
import { useModelChannelGate } from '@/hooks/use-model-channel-gate'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Clapperboard,
  AudioLines,
  FileText,
  MoreHorizontal,
  Pause,
  Play,
  Scissors,
  Smile,
  Upload,
} from '@/components/icons'
import { toast } from 'sonner'

import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { VoiceAvatarButton } from '@/components/business/node/voice-library/VoiceAvatar'
import { AUDIO_CLIP_SOURCE, AUDIO_KIND } from '@/constants/audio-options'
import { PROGRESS_TICK_MS } from '@/constants/generation-progress'
import {
  NODE_ASSISTANT_OP_V4_IDS,
  NODE_ASSISTANT_WRITE_MODES,
} from '@/constants/node-assistant-ops'
import { NODE_SLOT_IDS } from '@/constants/node-slots'
import { NODE_STUDIO_DOCK, NODE_V4_CARD } from '@/constants/node-studio'
import {
  NODE_MEDIA_KIND_IDS,
  NODE_V4_AUDIO_SUBTYPE_IDS,
  NODE_V4_IMAGE_SUBTYPE_IDS,
  NODE_V4_TEXT_SUBTYPE_IDS,
  NODE_V4_VIDEO_SUBTYPE_IDS,
} from '@/constants/node-types'
import { useNodeMediaGenerationV4 } from '@/hooks/node/use-node-media-generation-v4'
import { useNodeUploadV4 } from '@/hooks/node/use-node-upload-v4'
import { chooseVoiceOps, renameForVoiceOps } from '@/lib/audio-node-name'
import {
  trimAudioToWav,
  trimmedFileName,
  AUDIO_TRIM_WAV_MIME,
  type AudioTrimRange,
} from '@/lib/audio-trim'
import { getGeneratingStageKey } from '@/lib/generation-progress'
import { renameStableNodeName } from '@/lib/node-display-name'
import { readOutputIndex, readOutputVersions } from '@/lib/node-output-versions'
import { pickDefaultModelOption } from '@/lib/pick-default-model-option'
import { cn } from '@/lib/utils'
import {
  insertVoiceMarkup,
  voiceMarkupDeletionRangeAt,
  type VoiceMarkupInsert,
} from '@/lib/voice-markup'
import type {
  NodeV4,
  NodeV4AudioData,
  NodeWorkflowModelSelection,
} from '@/types/node-workflow'

import {
  NodeChromeLayer,
  ConnectToShotPopover,
  NodeCardShell,
  portSpecOf,
  NodeFrameProgress,
  NodeMediaMissing,
  useMediaProblem,
  NodePromptBar,
  NodeToolbar,
  VersionDots,
  flashNodeCard,
  mentionDeletionRangeAt,
  renderVoicePromptValue,
  type NodeToolbarGroup,
} from './chrome'
import { GROW_CLOSE_MS } from './chrome/use-grow-from-origin'
import {
  buildConnectToShotOps,
  buildConnectToShotTargets,
} from './connect-to-shot-targets'
import {
  AUDIO_CARD,
  audioVersions,
  formatAudioCardDuration,
  formatAudioSeconds,
  resolveAudioNodeKind,
  showsVoiceChip,
} from './audio/audio-node-model'
import { useKeySettingsAction } from '../../workbench-v4/shell/ShellKeySettings'
import { AudioAddMenuItems, AudioMoreMenuItems } from './audio/AudioNodeMenus'
import { AudioOwnerMenuItem } from './audio/AudioOwnerMenuItem'
import { AudioTonePopover, TONE_POPOVER_WIDTH } from './audio/AudioTonePopover'
import { AudioTrimPanel } from './audio/AudioTrimPanel'
import { AudioVoiceChip } from './audio/AudioVoiceChip'
import { AudioWaveform } from './audio/AudioWaveform'
import {
  VoiceLibraryPanel,
  type VoiceLibraryClip,
} from '../../voice-library/VoiceLibraryPanel'
import { transcribeAudioUrl } from './audio/audio-transcribe'
// ⚠ `toStudioModelOption` 是**两类卡共用**的那一份映射（`apiKeyId → keyId` 等），
// 住在 image 那侧；⛔ 不在音频这边再抄一份，两处对不上选中的模型就会漂。
import { toStudioModelOption } from './image/image-node-model'
import {
  MODEL_PICKER_GROUP_BY,
  ModelPickerPopover,
} from '../../../studio-shared/pickers/ModelPickerPopover'
import {
  splitVersionOp,
  useNodeV4Canvas,
  type NodeV4MediaPatch,
} from './NodeV4Context'
import { NodeV4ContextMenu } from './NodeV4ContextMenu'
import { triggerNodeV4Download } from './NodeV4SelectionToolbar'

/** 「生镜头」那一批里指代新建镜头的别名（只在这一批之内有效）。 */
const SHOT_BATCH_REF = 'shot'
/** 「转文字」那一批里指代新建文本卡的别名。 */
const TEXT_BATCH_REF = 'line'
/** 「裁剪」那一批里指代新建音频卡的别名。 */
const TRIM_BATCH_REF = 'clip'

export function AudioNodeV4({ id, data, selected }: NodeProps) {
  const t = useTranslations('StudioNode.v4')
  const tAudio = useTranslations('StudioNode.v4.audio')
  const tStage = useTranslations('StudioV3')
  const tPicker = useTranslations('ModelPicker')
  // 这张卡自己的「未选渠道」闸（gateId = 节点 id，与卡上那颗 chip 同一对）。
  const channelGate = useModelChannelGate(NODE_MEDIA_KIND_IDS.audio, id)
  const canvas = useNodeV4Canvas()
  const openKeySettings = useKeySettingsAction()
  const generation = useNodeMediaGenerationV4()
  const upload = useNodeUploadV4()
  const audioData = data as unknown as NodeV4AudioData
  // 源文件没了（素材库删了）/ 暂时读不到：这一行换成一句话，⛔ 不留一张放不响的卡。
  const media = useMediaProblem(audioData.url)

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [emptyDragging, setEmptyDragging] = useState(false)
  const dragDepthRef = useRef(0)
  const [renameRequest, setRenameRequest] = useState(0)
  /** 素材库对话框（`+` 菜单「从素材库选…」）。 */
  const [assetPicker, setAssetPicker] = useState(false)
  /** 声音库面板（`+` 菜单「声音库…」与音色 chip 的「更多…」都到这里）。 */
  const [voiceLibrary, setVoiceLibrary] = useState(false)
  const [draft, setDraft] = useState(audioData.prompt ?? '')
  const [syncedPrompt, setSyncedPrompt] = useState(audioData.prompt ?? '')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(audioData.durationSec ?? 0)
  const [transcribing, setTranscribing] = useState(false)
  const [transcribeStartedAt, setTranscribeStartedAt] = useState<number | null>(
    null,
  )
  const [transcribeElapsed, setTranscribeElapsed] = useState(0)
  /** 裁剪条开着？开着时卡下方那条栏换成它（spec §4）。 */
  const [trimming, setTrimming] = useState(false)
  const [trimBusy, setTrimBusy] = useState(false)
  /** 切采样 + 上传那一段的起点 —— 卡上走同一条进度线（⛔ 不让卡看起来没反应）。 */
  const [trimStartedAt, setTrimStartedAt] = useState<number | null>(null)
  const [trimElapsed, setTrimElapsed] = useState(0)

  const fileRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  /** 音色库画中框的来处（§1 第 12 条：从卡上长出来、缩回卡）。 */
  const cardRef = useRef<HTMLDivElement>(null)
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
    // ⚠ 时长跟着换版本清零：裁完那一版比原来短，留着旧数就是一句假话
    // （清了之后到 `loadedmetadata` 之间显示 `--:--`，那是「还不知道」）。
    setDuration(0)
  }

  const generating = Boolean(audioData.mediaJobId) || startedAt !== null

  useEffect(() => {
    if (transcribeStartedAt === null) return
    const tick = () =>
      setTranscribeElapsed((Date.now() - transcribeStartedAt) / 1000)
    tick()
    const timer = window.setInterval(tick, PROGRESS_TICK_MS)
    return () => window.clearInterval(timer)
  }, [transcribeStartedAt])

  useEffect(() => {
    if (trimStartedAt === null) return
    const tick = () => setTrimElapsed((Date.now() - trimStartedAt) / 1000)
    tick()
    const timer = window.setInterval(tick, PROGRESS_TICK_MS)
    return () => window.clearInterval(timer)
  }, [trimStartedAt])

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
  /**
   * 把媒体回填到**刚建出来的那张卡**上。
   *
   * ⚠ 必须用**批之后**那份 `canvas`：`onSetMedia` 闭包着调用当时的图，拿批之前
   * 那一份写回去，等于把刚建出来的卡一起抹掉（2026-09-11 真机实测：裁剪出来的卡
   * 落下去就没了；`VideoNodeV4.backfillMedia` 记的是同一条）。所以等新卡出现在
   * `latest.current` 里再写，写完再选中它。
   */
  const backfillTrimmed = useCallback(
    (nodeId: string, patch: NodeV4MediaPatch) => {
      const step = (attempt: number): void => {
        const fresh = latest.current.canvas
        if (fresh.nodes.some((item) => item.id === nodeId) || attempt >= 10) {
          fresh.onSetMedia(nodeId, patch)
          // 「建完自动选中新卡」（画板）——选中不改图，跟着同一拍走就行。
          // ⚠ `onFocusNode` 只平移相机，选中要另外说。
          fresh.onFocusNode(nodeId)
          fresh.onSelectNode?.(nodeId)
          return
        }
        window.requestAnimationFrame(() => step(attempt + 1))
      }
      step(0)
    },
    [],
  )

  const runUpload = useCallback((file: File) => {
    const bound = latest.current
    void bound.upload.upload('audio', file, bound.name).then((patch) => {
      if (!patch) return
      bound.canvas.onSetMedia(bound.id, patch)
    })
  }, [])

  const node = canvas.nodes.find((item) => item.id === id) as NodeV4 | undefined
  /**
   * 这一版的封面（owner 2026-09-29「从声音库拿的，封面都带着」）：外面落进来的那一版
   * 看它自己的来源（声音库那副嗓子才有），自己生成的看当前音色。卡上只记 `voiceId`，
   * 封面现查（`use-voice-cover`）。
   */
  const coverSource =
    readOutputVersions(audioData)[readOutputIndex(audioData)]?.source
  const cover = useVoiceCover(
    coverSource ? coverSource.voiceId : audioData.voiceProfile?.voiceId,
  )
  const modelOptions = useMemo(
    () => canvas.modelOptionsByKind[NODE_MEDIA_KIND_IDS.audio] ?? [],
    [canvas.modelOptionsByKind],
  )
  const defaultModel = useMemo<NodeWorkflowModelSelection | undefined>(() => {
    const picked = pickDefaultModelOption(modelOptions.map(toStudioModelOption))
    const source = picked
      ? modelOptions.find((item) => item.optionId === picked.optionId)
      : undefined
    if (!source) return undefined
    return {
      optionId: source.optionId,
      modelId: source.modelId,
      adapterType: source.adapterType,
      providerConfig: source.providerConfig,
      ...(source.apiKeyId ? { apiKeyId: source.apiKeyId } : {}),
    }
  }, [modelOptions])
  if (!node) return null

  const effectiveModel = audioData.model ?? defaultModel
  const audioKind = resolveAudioNodeKind({
    ...audioData,
    model: effectiveModel,
  })
  const speech = showsVoiceChip(audioKind)
  const versions = audioVersions(audioData)
  const versionIndex = readOutputIndex(audioData)
  const currentSource = readOutputVersions(audioData)[versionIndex]?.source
  /** ⋯ 菜单里那一行只读的「来源」——当前这一版的，⛔ 不是节点级属性。 */
  const currentSourceLabel = currentSource?.label
  const selectVersion = (index: number) =>
    void canvas.onApplyOp({
      op: NODE_ASSISTANT_OP_V4_IDS.setOutputVersion,
      target: id,
      index,
    })
  const showChrome = Boolean(selected) && canvas.selectedNodeIds.length < 2
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
    if (!audioData.model && effectiveModel)
      canvas.onSetModel(id, effectiveModel)
    const nodes = canvas.nodes.map((item) =>
      item.id === id && effectiveModel
        ? ({
            ...item,
            data: { ...item.data, model: effectiveModel },
          } as NodeV4)
        : item,
    )
    setStartedAt(Date.now())
    void generation
      .generateNode(
        id,
        { nodes, edges: canvas.edges },
        {
          // ⚠ 送出去的是**编译后**的台词（`[very angry]…`）——原文留在节点上，
          // 编译只发生在送出的那一刻（装配层同一条：`planV4Generation`）。
          prompt: draft,
          onJobCreated: (jobId) => canvas.onSetMedia(id, { mediaJobId: jobId }),
          onEach: (result) => {
            if (!result.success) {
              if (!result.pending)
                canvas.onSetMedia(id, { mediaJobId: undefined })
              return
            }
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
    setTranscribeStartedAt(Date.now())
    const result = await transcribeAudioUrl(audioData.url, audioData.name)
    setTranscribing(false)
    setTranscribeStartedAt(null)
    if (!result.ok || !result.text) {
      toast.error(tAudio('toolbar.transcribeFailed'))
      return
    }
    // 一批两条：建一张文本卡 + 把它连成这张卡的**台词来源**（`text` 槽）。
    // ⚠ 方向是 text → audio：文本卡是叶子（端口表 `TEXT_PORTS`），音频卡才有
    // `text` 入口槽。⛔ 不反着连——那条边根本不合法。
    // 派生卡落在**本卡右边第一个空位**（§7 摆放 A「让位」，⛔ 叠在别的卡上）。
    const placement = canvas.onPlaceBeside(id, [
      {
        kind: NODE_MEDIA_KIND_IDS.text,
        subtype: NODE_V4_TEXT_SUBTYPE_IDS.script,
      },
    ])?.[0]
    const outcome = await canvas.onApplyBatch([
      {
        op: NODE_ASSISTANT_OP_V4_IDS.addNode,
        kind: NODE_MEDIA_KIND_IDS.text,
        subtype: NODE_V4_TEXT_SUBTYPE_IDS.script,
        ref: TEXT_BATCH_REF,
        ...(placement ? { position: placement } : {}),
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
    // 「转完自动选中新卡」（画板）。⚠ 新卡的 id 只有批执行器知道 ——
    // `onApplyBatch` 的回执正是为这个缺口存在的（`NodeV4BatchOutcome`）。
    const created = outcome?.createdNodeIds?.[0]
    if (created) canvas.onFocusNode(created)
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

  /**
   * 裁剪条上那颗「确认」：客户端切采样 → 编 WAV → 走**已有的上传管线** → 落成
   * **一张新的音频卡**（owner 2026-09-11 改，spec §4：不再是本卡的新版本）。
   *
   * ⛔ 不扣积分、不生成（spec §4）；**原卡一个字都不动** —— 裁剪从「换掉这段声音」
   * 变成「从这段声音里取一截」，两段并排摆着才比得出来。
   *
   * ⚠ 建卡 + 布局 + 选中走的是**转文字那条同一条路**（`runTranscribe`）：卡落在
   * 本卡右侧、`onApplyBatch` 的回执给出新 id、回填媒体、`onFocusNode` 选中它。
   * ⚠ 连线：音频卡的入口槽只有 `text` / `timbre`（`node-slots.ts` 的
   * `audio.voice` / `audio.ambience`），**没有 `source` 槽** —— 所以这条派生关系
   * 只写在新卡那一版的 `source` 标签里（⋯ 菜单的「来源」读它），⛔ 不硬塞一条
   * 端口表不认的边。哪天音频卡开了 `source` 槽，这里再补一条 connect。
   * ⚠ 进度线仍画在**原卡**上（切采样与上传都是这张卡在做），新卡出现时就是成品。
   */
  const runTrim = async (range: AudioTrimRange) => {
    if (!audioData.url || trimBusy) return
    setTrimBusy(true)
    setTrimStartedAt(Date.now())
    try {
      const result = await trimAudioToWav(audioData.url, range)
      const file = new File([result.blob], trimmedFileName(audioData.name), {
        type: AUDIO_TRIM_WAV_MIME,
      })
      const patch = await upload.upload('audio', file, audioData.name)
      if (!patch) {
        toast.error(tAudio('trim.failed'))
        return
      }
      const placement = canvas.onPlaceBeside(id, [
        {
          kind: NODE_MEDIA_KIND_IDS.audio,
          subtype: audioData.subtype ?? NODE_V4_AUDIO_SUBTYPE_IDS.voice,
        },
      ])?.[0]
      const outcome = await canvas.onApplyBatch([
        {
          op: NODE_ASSISTANT_OP_V4_IDS.addNode,
          kind: NODE_MEDIA_KIND_IDS.audio,
          // 同一子型 —— 裁一段配乐出来的还是配乐（音色 chip 该不该在跟着它走）。
          subtype: audioData.subtype ?? NODE_V4_AUDIO_SUBTYPE_IDS.voice,
          ref: TRIM_BATCH_REF,
          name: tAudio('trim.derivedName', { name: audioData.name }),
          ...(placement ? { position: placement } : {}),
        },
      ])
      const created = outcome?.createdNodeIds?.[0]
      if (!created) {
        toast.error(tAudio('trim.failed'))
        return
      }
      // ⚠ 时长不进 patch（`NodeV4MediaPatch` 没有这一格）：新卡的 `<audio>` 在
      // `loadedmetadata` 里会把真实时长报上来。
      backfillTrimmed(created, {
        ...patch,
        source: { kind: AUDIO_CLIP_SOURCE.trim, label: audioData.name },
      })
      setTrimming(false)
    } catch {
      toast.error(tAudio('trim.failed'))
    } finally {
      setTrimBusy(false)
      setTrimStartedAt(null)
    }
  }

  /** 「连到镜头」列表 = 画布上的视频卡，按镜头带顺序（spec §1.13）。 */
  const shotTargets = buildConnectToShotTargets({
    nodes: canvas.nodes,
    edges: canvas.edges,
    formatDuration: formatAudioSeconds,
  })

  /** 顶行「新建镜头」= 原来那颗「生镜头」的一批两条，⛔ 行为不改。 */
  const createShot = () =>
    void canvas.onApplyBatch([
      {
        op: NODE_ASSISTANT_OP_V4_IDS.addNode,
        kind: NODE_MEDIA_KIND_IDS.video,
        subtype: NODE_V4_VIDEO_SUBTYPE_IDS.shot,
        ref: SHOT_BATCH_REF,
        ...(audioData.shotNo === undefined ? {} : { shotNo: audioData.shotNo }),
      },
      {
        op: NODE_ASSISTANT_OP_V4_IDS.connect,
        source: id,
        target: SHOT_BATCH_REF,
        slot: NODE_SLOT_IDS.voice,
      },
    ])

  const toolbarGroups: readonly NodeToolbarGroup[] = [
    [
      {
        id: 'tone',
        label: tAudio('toolbar.tone'),
        icon: Smile,
        // 主动作带字（§1 第 4 条 · 方向 B）：音频卡的第一件事是「加语气」。
        primary: true,
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
        id: 'trim',
        label: tAudio('toolbar.trim'),
        icon: Scissors,
        // 没有声就没有可裁的（空卡 / 生成中）。
        disabled: !audioData.url || generating,
        active: trimming,
        // ⚠ 面板不是 popover：它**换掉卡下方那条提示词栏**（spec §4），
        // 所以这颗键只翻一个开关。
        onSelect: () => setTrimming((current) => !current),
      },
      {
        id: 'transcribe',
        label: tAudio('toolbar.transcribe'),
        icon: FileText,
        disabled: !audioData.url || transcribing,
        onSelect: () => void runTranscribe(),
      },
      {
        // 原「生镜头」（图标不变）——现在先开弹层选目标（spec §1.13）。
        id: 'shot',
        label: tAudio('toolbar.connect'),
        icon: Clapperboard,
        onSelect: () => {},
        panel: (
          <ConnectToShotPopover
            sourceNodeId={id}
            sourceKind={NODE_MEDIA_KIND_IDS.audio}
            targets={shotTargets}
            onNew={createShot}
            onConnect={(targetId, slot) => {
              void Promise.resolve(
                canvas.onApplyBatch(
                  buildConnectToShotOps({
                    sourceId: id,
                    targetId,
                    slot,
                    edges: canvas.edges,
                  }),
                ),
              ).then(() => {
                // 连完滚到可见并亮一下（spec §1.13 尾句）。
                canvas.onFocusNode(targetId)
                flashNodeCard(targetId, NODE_STUDIO_DOCK.focusDurationMs)
              })
            }}
          />
        ),
      },
    ],
    [
      {
        id: 'more',
        label: tAudio('toolbar.more'),
        icon: MoreHorizontal,
        onSelect: () => {},
        menu: (
          <AudioMoreMenuItems
            onRename={() => setRenameRequest((n) => n + 1)}
            // 方向 B：每类卡最多 4 个动作 + ⋯ —— 音频的「下载」收进这里。
            onDownload={
              audioData.url
                ? () => audioData.url && triggerNodeV4Download(audioData.url)
                : undefined
            }
            onDuplicate={() =>
              void canvas.onApplyOp({
                op: NODE_ASSISTANT_OP_V4_IDS.addNode,
                kind: NODE_MEDIA_KIND_IDS.audio,
                subtype: audioData.subtype,
              })
            }
            onSplitVersion={
              // 只有一版时拆无可拆 —— ⛔ 不摆一个按了什么都不变的项。
              versions.length > 1
                ? () =>
                    void canvas.onApplyOp(
                      splitVersionOp(canvas, id, audioData, versionIndex),
                    )
                : undefined
            }
            ownerItem={
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
            }
            {...(currentSourceLabel ? { sourceLabel: currentSourceLabel } : {})}
            onDelete={() =>
              void canvas.onApplyOp({
                op: NODE_ASSISTANT_OP_V4_IDS.delete,
                target: id,
              })
            }
          />
        ),
      },
    ],
  ]

  const empty = !audioData.url && !generating

  return (
    <div
      ref={cardRef}
      data-node-kind={NODE_MEDIA_KIND_IDS.audio}
      data-node-subtype={audioData.subtype}
      data-audio-kind={audioKind}
      data-generating={generating ? 'true' : 'false'}
      className="relative"
      onContextMenu={(event) => {
        event.preventDefault()
        setMenu({ x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY })
      }}
      onDragEnter={(event) => {
        if (!empty || !Array.from(event.dataTransfer.types).includes('Files'))
          return
        dragDepthRef.current += 1
        setEmptyDragging(true)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        event.stopPropagation()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={() => {
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
        if (dragDepthRef.current === 0) setEmptyDragging(false)
      }}
      onDrop={(event) => {
        dragDepthRef.current = 0
        setEmptyDragging(false)
        const file = Array.from(event.dataTransfer?.files ?? []).find((item) =>
          item.type.startsWith('audio/'),
        )
        if (!file) return
        event.preventDefault()
        event.stopPropagation()
        runUpload(file)
      }}
    >
      <NodeChromeLayer show={showChrome && !empty} position={Position.Top}>
        <NodeToolbar
          groups={toolbarGroups}
          ariaLabel={tAudio('toolbar.label')}
        />
      </NodeChromeLayer>

      <NodeCardShell
        name={audioData.name}
        renameAriaLabel={t('renameNode')}
        onRename={renameNode}
        selected={Boolean(selected)}
        width={NODE_V4_CARD.collapsedWidth}
        empty={empty}
        emptyDragging={empty && emptyDragging}
        emptyContent={
          <div className="absolute inset-0 flex items-center justify-center gap-2">
            <button
              type="button"
              data-node-empty-upload
              onClick={(event) => {
                event.stopPropagation()
                fileRef.current?.click()
              }}
              className="nodrag nopan inline-flex h-7 shrink-0 items-center justify-center gap-1.25 rounded-full bg-surface-fill-hover px-2.75 text-xs text-foreground transition-colors duration-fast ease-standard hover:bg-surface-fill-track focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Upload aria-hidden className="size-3.5" />
              {t('chrome.emptyUpload')}
            </button>
            <button
              type="button"
              data-node-empty-library
              onClick={(event) => {
                event.stopPropagation()
                setVoiceLibrary(true)
              }}
              className="nodrag nopan inline-flex h-7 shrink-0 items-center justify-center gap-1.25 rounded-full bg-surface-fill-hover px-2.75 text-xs text-foreground transition-colors duration-fast ease-standard hover:bg-surface-fill-track focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <AudioLines aria-hidden className="size-3.5" />
              {tAudio('emptyVoiceLibrary')}
            </button>
            <span className="text-xs text-muted-foreground/75">
              {tAudio('emptyNextStep')}
            </span>
          </div>
        }
        renameRequest={renameRequest}
        emptyHeight={AUDIO_CARD.height}
        changed={canvas.changedNodeIds.includes(id)}
        portSpec={portSpecOf(node)}
      >
        {media.problem && !generating ? (
          <NodeMediaMissing
            kind="audio"
            layout="row"
            problem={media.problem}
            onRetry={media.retry}
            // 卡上不止一版：只拿掉读不出来的这一版，⛔ 连好的那几版一起删掉整张卡。
            scope={versions.length > 1 ? 'version' : 'card'}
            onRemove={() =>
              void canvas.onApplyOp(
                versions.length > 1
                  ? {
                      op: NODE_ASSISTANT_OP_V4_IDS.removeOutputVersion,
                      target: id,
                      index: versionIndex,
                    }
                  : { op: NODE_ASSISTANT_OP_V4_IDS.delete, target: id },
              )
            }
            style={{ height: AUDIO_CARD.height }}
          />
        ) : audioData.url || generating ? (
          <div
            data-audio-surface={audioData.url ? 'ready' : 'pending'}
            className="relative flex items-center gap-3 px-4"
            style={{ height: AUDIO_CARD.height }}
          >
            {audioData.url && !generating ? (
              <>
                {/* 播放钮**常驻**（画板：34px 圆钮，未播 = 浅底深字，播放中 =
                    实心深底白字）。⛔ 不再随悬停淡入 —— 悬停自动播删掉之后，
                    「点哪儿能听」必须一眼看得见，否则这张卡看起来不能播。 */}
                {cover ? (
                  // 有封面：播放钮就是这副嗓子的头像（与声音库同一颗），▶ 常驻。
                  <VoiceAvatarButton
                    cover={cover}
                    fallback="letter"
                    name={audioData.voiceProfile?.voiceName ?? audioData.name}
                    size="card"
                    glyph="always"
                    playing={playing}
                    progress={progress}
                    ariaLabel={playing ? tAudio('pause') : tAudio('play')}
                    onToggle={togglePlay}
                    buttonProps={{ 'data-audio-play': 'cover' }}
                  />
                ) : (
                  <button
                    type="button"
                    data-audio-play
                    data-playing={playing ? 'true' : 'false'}
                    aria-label={playing ? tAudio('pause') : tAudio('play')}
                    onClick={(event) => {
                      event.stopPropagation()
                      togglePlay()
                    }}
                    className={cn(
                      'nodrag nopan flex size-8.5 shrink-0 items-center justify-center rounded-full',
                      'transition-colors duration-fast ease-standard',
                      'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                      playing
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-surface-fill text-foreground hover:bg-surface-fill-hover',
                    )}
                  >
                    {playing ? (
                      <Pause aria-hidden className="size-3.5" />
                    ) : (
                      <Play aria-hidden weight="fill" className="size-3.5" />
                    )}
                  </button>
                )}
                <AudioWaveform
                  seed={audioData.url}
                  progress={progress}
                  fitWidth
                  className="min-w-0 flex-1"
                />
                {/* ⚠ 时长**恒显**（画板右侧永远有一行读数，卡的宽度才不会在
                    元数据回来的那一刻跳一下）。还没回来时写占位 `--:--` 而不是
                    「0s」——占位是「还不知道」，`0s` 是一句假话。 */}
                <span
                  data-audio-duration
                  data-known={seconds > 0 ? 'true' : 'false'}
                  className="w-9.5 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground"
                >
                  {seconds <= 0
                    ? tAudio('durationUnknown')
                    : formatAudioCardDuration(seconds)}
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
            {/* 转写中也走同一条进度线（画板：「转写中卡上走一条进度线」）。
                ⚠ 与生成互斥：转写要有声才点得动，而生成中这张卡还没有声。 */}
            {transcribing && !generating ? (
              <div
                data-audio-transcribing
                className="absolute inset-x-4 inset-y-0"
              >
                <NodeFrameProgress
                  variant="line"
                  elapsedSeconds={transcribeElapsed}
                  stageLabel={tAudio('toolbar.transcribing')}
                />
              </div>
            ) : null}
            {/* 裁剪落版本（切采样 + 上传）也走这条线：确认到新一版之间是几秒的
                空档，⛔ 不让卡在那几秒里看起来什么都没发生。 */}
            {trimBusy && !generating ? (
              <div data-audio-trimming className="absolute inset-x-4 inset-y-0">
                <NodeFrameProgress
                  variant="line"
                  elapsedSeconds={trimElapsed}
                  stageLabel={tAudio('toolbar.trimming')}
                />
              </div>
            ) : null}
          </div>
        ) : undefined}
      </NodeCardShell>

      {audioData.url ? (
        <audio
          key={media.attempt}
          ref={audioRef}
          src={audioData.url}
          onError={media.onError}
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

      <NodeChromeLayer show={showChrome} position={Position.Bottom}>
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
          {trimming && audioData.url ? (
            // 裁剪时**提示词栏换成裁剪面板**（spec §4），⛔ 不是又弹一层。
            <AudioTrimPanel
              url={audioData.url}
              durationSec={seconds}
              seed={audioData.url}
              busy={trimBusy}
              onCancel={() => setTrimming(false)}
              onConfirm={(range) => void runTrim(range)}
            />
          ) : (
            <NodePromptBar
              safeLeftPx={canvas.safeLeftPx}
              value={draft}
              onValueChange={setDraft}
              onSubmit={submitPrompt}
              // 多渠道型号没选渠道 = 这一枪发不出去（D2 Q1：没有「自动」渠道）。
              // 按钮上写「先选渠道」，点了打开这张卡的选择器并定位到那一行。
              {...(channelGate.blocked
                ? {
                    blockedLabel: tPicker('pickChannel'),
                    onBlockedClick: channelGate.requestPick,
                  }
                : {})}
              generating={generating}
              onCancel={() => setStartedAt(null)}
              placeholder={
                empty || speech
                  ? tAudio('promptPlaceholder')
                  : audioKind === AUDIO_KIND.MUSIC
                    ? tAudio('promptPlaceholderMusic')
                    : tAudio('promptPlaceholderSfx')
              }
              ariaLabel={tAudio('promptLabel')}
              className="w-105"
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
                <AudioAddMenuItems
                  onUpload={() => fileRef.current?.click()}
                  onAssetLibrary={() => setAssetPicker(true)}
                  onVoiceLibrary={() => setVoiceLibrary(true)}
                  canvasCandidates={canvas.nodes
                    .filter(
                      (item) =>
                        item.id !== id &&
                        item.data.kind === NODE_MEDIA_KIND_IDS.audio &&
                        Boolean(item.data.url),
                    )
                    .map((item) => ({
                      id: item.id,
                      name: item.data.name,
                      audioUrl: 'url' in item.data ? item.data.url : undefined,
                    }))}
                />
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
                    voiceName={audioData.voiceProfile?.voiceName}
                    speed={audioData.voiceProfile?.speed}
                    volume={audioData.voiceProfile?.volume}
                    disabled={generating}
                    onSelectVoice={(voice) => {
                      if (node) {
                        void canvas.onApplyBatch(
                          chooseVoiceOps(
                            node,
                            { voiceId: voice.voiceId, voiceName: voice.name },
                            canvas.nodes,
                          ),
                        )
                      }
                      // 库里自带的试听样本**就是**这条音色的产物 —— 有就落进 `url`。
                      if (voice.sampleUrl && !audioData.url) {
                        canvas.onSetMedia(id, { url: voice.sampleUrl })
                      }
                    }}
                    onSpeedChange={(speed) => patchProfile({ speed })}
                    onVolumeChange={(volume) => patchProfile({ volume })}
                    onOpenLibrary={() => setVoiceLibrary(true)}
                  />
                ) : null,
                // 与图片卡同一份弹层（渠道行 / 健康点 / 缺 key 灰显全都沿用），
                // 只是分组维度换成**类型**：语音 / 配乐 / 音效（画板「组就是类型」）。
                <ModelPickerPopover
                  key="model"
                  options={modelOptions.map(toStudioModelOption)}
                  value={effectiveModel?.optionId ?? null}
                  groupBy={MODEL_PICKER_GROUP_BY.kind}
                  memoryScope={NODE_MEDIA_KIND_IDS.audio}
                  gateId={id}
                  canvasNodeId={id}
                  canvasSafeLeftPx={canvas.safeLeftPx}
                  // 缺 key 的行点了进内联配置（Hard Rule 8）——⛔ 不选中。
                  {...(openKeySettings
                    ? { onManageChannels: openKeySettings }
                    : {})}
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
                      ...(picked.apiKeyId ? { apiKeyId: picked.apiKeyId } : {}),
                    })
                  }}
                />,
              ].filter(Boolean)}
            />
          )}
        </div>
      </NodeChromeLayer>

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

      {assetPicker ? (
        <AssetSelectorDialog
          open
          onOpenChange={setAssetPicker}
          mediaType="audio"
          title={tAudio('add.library')}
          description={tAudio('add.library')}
          onSelect={(record) => {
            // 素材库选的是**现成的一段声音**：直接落成一版，⛔ 不生成、不扣积分。
            canvas.onSetMedia(id, {
              url: record.url,
              source: {
                kind: AUDIO_CLIP_SOURCE.library,
                label: tAudio('source.library'),
              },
            })
            setAssetPicker(false)
          }}
        />
      ) : null}

      <AnimatePresence>
        {voiceLibrary ? (
          <VoiceLibraryPanel
            key="voice-library"
            open
            origin={cardRef}
            onClose={() => setVoiceLibrary(false)}
            onUseClip={(clip) => {
              canvas.onSetMedia(id, {
                url: clip.url,
                source: {
                  kind: clip.sourceKind,
                  label: clip.sourceLabel,
                  // 封面跟着这副嗓子走（卡上按 `voiceId` 现查）。
                  ...(clip.voiceId ? { voiceId: clip.voiceId } : {}),
                },
              })
              // 落的是某副嗓子的示例 → 名字跟着它叫（「音色名 · 语音 N」）。
              if (node && clip.voiceId) {
                const rename = renameForVoiceOps(node, clip.name, canvas.nodes)
                if (rename.length > 0) void canvas.onApplyBatch(rename)
              }
              setVoiceLibrary(false)
              // 面板先缩回这张卡，缩完卡面再闪一下（声音库动效表 A）：「落进来了」
              // 的回执落在卡上，⛔ 不在框还没收完时就闪掉。
              flashNodeCard(id, GROW_CLOSE_MS)
            }}
            {...(speech
              ? {
                  onSetVoice: (clip: VoiceLibraryClip) => {
                    if (!clip.voiceId || !node) return
                    // 名字一起记（`voiceName`）：收起的 chip 拉不动整库，没有它
                    // 就只能显示那串哈希（真机 2026-09-10 实拍）。
                    void canvas.onApplyBatch(
                      chooseVoiceOps(
                        node,
                        { voiceId: clip.voiceId, voiceName: clip.name },
                        canvas.nodes,
                      ),
                    )
                    setVoiceLibrary(false)
                  },
                }
              : {})}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {menu ? (
          <NodeV4ContextMenu
            key="menu"
            node={node}
            x={menu.x}
            y={menu.y}
            {...(audioData.url ? { mediaUrl: audioData.url } : {})}
            onClose={() => setMenu(null)}
          />
        ) : null}
      </AnimatePresence>
    </div>
  )
}
