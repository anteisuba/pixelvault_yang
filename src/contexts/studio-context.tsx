'use client'

/**
 * Studio Context — split into 3 providers by update frequency to prevent
 * unnecessary re-renders (per Eng Review finding).
 *
 * StudioFormContext  (HOT)  — prompt, aspectRatio, panels — changes on every keystroke
 * StudioDataContext  (WARM) — cards, projects, civitai, upload, enhance — changes on user actions
 * StudioGenContext   (COLD) — generation state — changes only during generation
 *
 * Usage: import { useStudioForm, useStudioData, useStudioGen } from '@/contexts/studio-context'
 */

import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import type { StudioOperatorCheckpoint } from '@/types/studio-operator-checkpoint'
import type { AdvancedParams, GenerationEvaluation, RecipeUsage } from '@/types'
import {
  DEFAULT_WORKFLOW_ID,
  getWorkflowById,
  getWorkflowStudioDefaults,
  type Workflow,
  type WorkflowId,
} from '@/constants/workflows'
import { NO_STYLE_PRESET_ID } from '@/constants/style-presets'
import {
  DEFAULT_PROMPT_DIALECT,
  type PromptDialect,
} from '@/constants/prompt-dialects'
import {
  compileTagPrompt,
  parseTagChips,
  serializeTagChips,
  wholeSentenceAsTag,
} from '@/lib/tag-composer'
import type { TagPromptBlock, TagChip } from '@/types/tag-composer'
import type { AspectRatio } from '@/constants/config'
import { VIDEO_GENERATION } from '@/constants/config'
import {
  DEFAULT_VIDEO_NODE_MODE,
  type VideoNodeMode,
} from '@/constants/video-node-modes'
import {
  DEFAULT_AUDIO_FORMAT,
  DEFAULT_AUDIO_LATENCY,
  AUDIO_DEFAULT_EXPRESSIVENESS,
  DEFAULT_AUDIO_KIND,
  DEFAULT_AUDIO_MP3_BITRATE,
  DEFAULT_AUDIO_OPUS_BITRATE,
  DEFAULT_AUDIO_SAMPLE_RATE,
  DEFAULT_MUSIC_DURATION_SECONDS,
  DEFAULT_SFX_DURATION_SECONDS,
  normalizeSpeakerVoiceIds,
  SFX_PROMPT_INFLUENCE_RANGE,
  TTS_CHUNK_LENGTH_RANGE,
  TTS_REPETITION_PENALTY_RANGE,
  TTS_TEMPERATURE_RANGE,
  TTS_TOP_P_RANGE,
  TTS_VOLUME_RANGE,
  type AudioFormat,
  type AudioLatency,
} from '@/constants/audio-options'
import {
  AUDIO_DEFAULT_EMOTION,
  AUDIO_DEFAULT_PACE,
} from '@/constants/voice-cards'
import {
  DEFAULT_IMAGE_BATCH_COUNT,
  type ImageBatchCount,
} from '@/constants/studio'
import { useCharacterCards } from '@/hooks/cards/use-character-cards'
import { useBackgroundCards } from '@/hooks/cards/use-background-cards'
import { useStyleCards } from '@/hooks/cards/use-style-cards'
import { useProjects } from '@/hooks/use-projects'
import { useCivitaiToken } from '@/hooks/use-civitai-token'
import { usePromptEnhance } from '@/hooks/kernel/use-prompt-enhance'
import { useImageUpload } from '@/hooks/use-image-upload'
import { removeReferenceMentions } from '@/lib/studio-reference-mentions'
import { useUnifiedGenerate } from '@/hooks/use-unified-generate'
import { useUsageSummary } from '@/hooks/use-usage-summary'
import type { UseCharacterCardsReturn } from '@/hooks/cards/use-character-cards'
import type { UseBackgroundCardsReturn } from '@/hooks/cards/use-background-cards'
import type { UseStyleCardsReturn } from '@/hooks/cards/use-style-cards'
import type { UseUnifiedGenerateReturn } from '@/hooks/use-unified-generate'

// ═══════════════════════════════════════════════════════════════════
// 1. FORM CONTEXT (HOT — changes on every keystroke)
// ═══════════════════════════════════════════════════════════════════

export type PanelName =
  | 'cardManagement'
  | 'projectHistory'
  | 'modelSelector'
  | 'civitai'
  | 'cardSelector'
  | 'enhance'
  | 'stylePreset'
  | 'reverse'
  | 'refImage'
  | 'audioReading'
  | 'musicSpec'
  | 'loraSelector'
  | 'voiceSelector'
  | 'voiceTrainer'
  | 'audioTranscribe'
  | 'sfxParams'
  | 'script'
  | 'videoAudio'
  | 'keepChange'

type OutputType = 'image' | 'video' | 'audio'
type WorkflowMode = 'quick' | 'card'

/**
 * 一条视频音频参考。`ownerName` 对应 worker 那边的
 * `audioBindings[].characterName`——它决定生成的是 `{Name} (@AudioN)` 还是无标签
 * 的 `@AudioN`（台账 A ①，owner 拍板「下拉已应用角色卡 + 可手填」）。
 */
export interface VideoAudioReference {
  /** 本地列表 key，不发往服务端。 */
  id: string
  url: string
  fileName: string
  /** 属于哪个角色；留空 = 无归属，退化成无标签 @AudioN（schema 允许）。 */
  ownerName?: string
}

export interface StudioFormState {
  selectedWorkflowId: WorkflowId
  outputType: OutputType
  workflowMode: WorkflowMode
  selectedOptionId: string | null
  /**
   * 用户是否**显式**动过主模型（选中 / 换掉 / 把最后一行删掉）。
   *
   * 图片工作台的默认模型自动补位（`useDefaultImageModel`）只在这面旗还没立起来
   * 时开火：删掉最后一行模型回到空态是用户的明确意图，不能被自动补位撤销。
   * `AUTO_SELECT_OPTION_ID` 因此不立旗，`SET_OPTION_ID` 立。
   *
   * ⚠ 可选是为了不让既有构造完整 `StudioFormState` 字面量的测试夹具全部失效；
   * 语义上 `undefined` 等同 `false`。
   */
  modelSelectionTouched?: boolean
  prompt: string
  /**
   * 当前这一台说哪种提示词方言（D10 ⑤）。由路由说了算：`/studio/image` 是
   * `natural`，`/studio/image/tags` 是 `tags`，两台的 `StudioModeSync` 各自
   * 报一次。⛔ 不由选中的模型反推 —— 没选模型时它也得成立。
   */
  promptDialect: PromptDialect
  /**
   * 标签台编辑器里的正 / 负两栏。
   *
   * ⚠ 与 `prompt` / `advancedParams.negativePrompt` **一起写**：`SET_TAG_CHIPS`
   * 同时落 chip 列表和它序列化出来的统一串，所以下游（成本预览 · 生成 · 助手
   * 快照 · 草稿）读 `prompt` 就够了，⛔ 不必认识 chip。反方向由 `SET_PROMPT`
   * 兜住：外部改写提示词时按逗号重新切成 chip。
   */
  tagPromptBlocks: TagPromptBlock[]
  tagChips: TagChip[]
  tagNegativeChips: TagChip[]
  /**
   * 标签台里**正在编辑谁的标签**：`null` = 整体，数字 = `novelAiLayout` 里的
   * 第几个角色（D10 ④「选中某角色时，编辑器主区切到那个角色的标签」）。
   * ⚠ 它是纯 UI 焦点，不进 payload；角色没了要跟着回到整体。
   */
  activeTagCharacterIndex: number | null
  recipeUsage: RecipeUsage | null
  aspectRatio: AspectRatio
  advancedParams: AdvancedParams
  /** Image-specific — how many images one send produces (1 / 2 / 4). */
  imageBatchCount: ImageBatchCount
  tokenInput: string
  /** Fish Audio voice model ID for TTS */
  voiceId: string | null
  /** Persisted VoiceCard ID for TTS */
  voiceCardId: string | null
  /**
   * 这一轮除主模型之外**额外**要跑的模型（optionId）。空数组 = 只跑主模型。
   *
   * 为什么不是「一个名单取代 selectedOptionId」：主模型还要负责别的事 ——
   * 清晰度候选、提示词字数上限、参考图槽位数都按它的能力算。让它继续存在、
   * 额外的挂在旁边，是改动面最小且不牺牲那些能力判定的做法。
   */
  extraModelOptionIds: string[]
  /** Audio-specific — active kind (speech / sfx / music) */
  audioKind: string
  /** Audio-specific — user-facing emotion control */
  audioEmotion: string
  /** Audio-specific — emotion responsiveness tier (or 'auto' to derive it) */
  audioExpressiveness: string
  /** Audio-specific (sfx) — target clip length in seconds */
  audioSfxDurationSeconds: number
  /** 音乐档的时长（秒）。音效那条是 `audioSfxDurationSeconds`，两档的范围不同。 */
  audioMusicDurationSeconds: number
  /** Audio-specific (sfx) — seamless loop toggle */
  audioSfxLoop: boolean
  /** Audio-specific (sfx) — prompt adherence vs creativity (0–1) */
  audioSfxPromptInfluence: number
  /** Audio-specific (sfx) — number of variant clips per run (A/B compare) */
  audioSfxVariantCount: number
  /** Audio-specific — user-facing pace control */
  audioPace: string
  /** Audio-specific — sentence pause marker IDs */
  audioPauseMarkers: string[]
  /** Audio-specific — word pronunciation overrides */
  pronunciationDictionary: Record<string, string>
  /** Audio-specific — prosody volume adjustment */
  audioVolume: number
  /** Audio-specific — Fish Audio loudness normalization */
  audioNormalizeLoudness: boolean
  /** Audio-specific — provider text normalization */
  audioNormalizeText: boolean
  /** Audio-specific — request timestamp alignment from Fish Audio */
  audioWithTimestamps: boolean
  /** Audio-specific — output format */
  audioFormat: AudioFormat
  /** Audio-specific — sample rate in Hz */
  audioSampleRate: number
  /** Audio-specific — MP3 bitrate in kbps */
  audioMp3Bitrate: number
  /** Audio-specific — Opus bitrate in bps */
  audioOpusBitrate: number
  /** Audio-specific — latency profile */
  audioLatency: AudioLatency
  /** Audio-specific — expressiveness */
  audioTemperature: number
  /** Audio-specific — nucleus sampling */
  audioTopP: number
  /** Audio-specific — provider chunk length */
  audioChunkLength: number
  /** Audio-specific — repetition penalty */
  audioRepetitionPenalty: number
  /** Audio-specific — ordered voice IDs for <|speaker:n|> dialogue tags */
  audioSpeakerVoiceIds: string[]
  /**
   * Audio-specific — public URL of an ad-hoc reference clip the user
   * uploaded for zero-shot voice cloning. Null when not in use. Lower
   * priority than `speakerVoiceIds` / `voiceId` — the Fish adapter only
   * consults this when neither preset path is set.
   */
  audioReferenceUrl: string | null
  /** Display name of the uploaded reference audio (UX only, not sent). */
  audioReferenceFileName: string | null
  /**
   * Required transcript for the reference audio above. Fish's `references`
   * payload rejects audio without text, so the schema enforces both-or-none.
   */
  audioReferenceText: string
  /** Style preset ID (empty string = no preset) */
  stylePresetId: string
  /**
   * Video-specific — 「用途」档，决定发哪个端点（关键帧 / 多图参考 / 全能参考）。
   *
   * 与画布同构：画布把它存在节点数据上（`node-workflow.ts` 的 `videoMode`），
   * Studio 存在表单里。⚠ **必须是真 state，不能从选中模型反推** —— 反推在「还
   * 没选模型」时无处可存，而那正是初始状态，表现是点了档位没有任何反应。
   */
  videoMode: VideoNodeMode
  /** Video-specific — duration in seconds per clip */
  videoDuration: number
  /** Video-specific — output resolution; null means provider default */
  videoResolution: string | null
  /**
   * 视频的**音频参考**（台账 A，owner 2026-08-29 拍板）。
   *
   * ⚠ 这条通道此前只断在**最上面两层**：Zod schema / service / worker 三层早就
   * 收 `audioUrls` + `audioBindings`，连校验（音频数上限、超槽 400、
   * `audioRequiresVisual`）都写好了 —— 断的是「UI 没有入口」和「buildVideoInput
   * 不填这两个字段」。后果是工作台这条路**永远做不出带指定音色的对白视频**。
   *
   * ⚠ 存 URL 不存 File：`uploadReferenceAudioAPI` 返回的是公网地址，而
   * `generate-video.service.ts` 对音频是**原样透传、不重传 R2**，所以这里必须
   * 已经是可公开访问的 URL。
   */
  videoAudioRefs: VideoAudioReference[]
  /**
   * 视频的**具名帧槽**（第二期，owner 2026-09-07 定）。
   *
   * ⭐ 具名而不是位置。此前首尾帧靠**下标**承载（`reference-image-capabilities.ts`
   * WAN_30 那段头注：「[0] 首帧、[1] 尾帧」），于是「把第一张删掉」会让尾帧
   * 静默升级成首帧 —— 一次用户看不见也撤不回的语义漂移。有名字之后，
   * **空首帧 + 有尾帧**才是一个可表达的状态。
   *
   * ⚠ 只在**关键帧档**（`videoMode === 'keyframe'`）成立：另外两档（图像参考 /
   * 全能参考）里图片不是帧，走的还是 `imageUpload` 那条参考轨。两档不会同时在场，
   * 所以⛔ 不需要在发送口做「谁优先」的仲裁 —— 判据就是档位本身。
   * ⚠ 存 URL 不存 File：与 `videoAudioRefs` 同一条理由（发送口原样透传）。
   */
  videoFrameSlots: { first: string | null; last: string | null }
  /**
   * 参考视频槽（第二期）。传输口是**早就在的** `videoUrls`（`types/index.ts`
   * 那条 `.max(3)`）—— 断的一直只是「UI 没有入口」这一层，所以这里不新造字段。
   *
   * ⚠ 上限由模型契约的 `slots.videos` 说了算，不由这个数组自己夹 —— 夹在
   * 发送口（`buildVideoInput`），与档位夹取同一条理由：残留值来自「切模型」。
   */
  videoReferenceVideos: string[]
  /**
   * 原生出声开关（台账 A「顺带」）。`null` = **没设过**，最终值吃模型目录的
   * `videoDefaults.generateAudio` —— 服务端把 `undefined` 原样透传，worker 那边
   * 再落到目录默认。用户拨过一次就写死一个显式布尔。
   *
   * ⚠ 三态是必要的：`false` 与「没设过」在**目录默认为 true** 的模型上是相反的
   * 结果，用布尔两态会让「没设过」被当成用户主动关掉了声音。
   */
  videoGenerateAudio: boolean | null
  /** Video-specific — long-video pipeline on/off */
  longVideoMode: boolean
  /** Video-specific — total target duration when long-video is on */
  longVideoTargetDuration: number
  generateRequestId: number
  panels: Record<PanelName, boolean>
}

export type StudioAction =
  | {
      type: 'RESTORE_OPERATOR_CHECKPOINT'
      payload: StudioOperatorCheckpoint['form']
    }
  | {
      type: 'SET_SELECTED_WORKFLOW_ID'
      payload: WorkflowId
      openDefaultPanel?: boolean
    }
  | { type: 'SET_OUTPUT_TYPE'; payload: OutputType }
  | { type: 'SET_WORKFLOW_MODE'; payload: WorkflowMode }
  | { type: 'SET_OPTION_ID'; payload: string | null }
  /**
   * 默认模型自动补位专用（图片档）。与 `SET_OPTION_ID` 的唯一区别是**不算
   * 用户的选择**：不立 `modelSelectionTouched`，也就不会被当成「上次使用的
   * 模型」写回 localStorage。
   */
  | { type: 'AUTO_SELECT_OPTION_ID'; payload: string }
  | { type: 'SET_PROMPT'; payload: string }
  | { type: 'SET_TAG_PROMPT_BLOCKS'; payload: TagPromptBlock[] }
  /**
   * 换台。⚠ 进标签台时如果 chip 还是空的，就拿当前提示词**整句**开第一格
   * （D10 ④ 两台跳转，⛔ 不自动切成标签）；负向栏本来就是逗号列表，按逗号切。
   */
  | { type: 'SET_PROMPT_DIALECT'; payload: PromptDialect }
  | {
      type: 'SET_TAG_CHIPS'
      payload: { polarity: 'positive' | 'negative'; chips: TagChip[] }
    }
  | { type: 'SET_ACTIVE_TAG_CHARACTER'; payload: number | null }
  /**
   * 从自然语言台**带着提示词跳过去**（D10 ④ 两台跳转）。整句进正向栏第一格，
   * ⛔ 不自动切成标签 —— 用户写的是一句话，替他改写成标签不是他要求的事。
   */
  | { type: 'CARRY_PROMPT_TO_TAGS' }
  | { type: 'REMOVE_PROMPT_REFERENCE'; payload?: number }
  | { type: 'SET_RECIPE_USAGE'; payload: RecipeUsage | null }
  | { type: 'SET_ASPECT_RATIO'; payload: AspectRatio }
  | { type: 'SET_ADVANCED_PARAMS'; payload: AdvancedParams }
  | { type: 'RESET_ADVANCED_PARAMS' }
  | { type: 'SET_IMAGE_BATCH_COUNT'; payload: ImageBatchCount }
  | { type: 'TOGGLE_EXTRA_MODEL'; payload: string }
  | { type: 'REMOVE_EXTRA_MODEL'; payload: string }
  | { type: 'SET_TOKEN_INPUT'; payload: string }
  | { type: 'SET_VOICE_ID'; payload: string | null }
  | { type: 'SET_VOICE_CARD_ID'; payload: string | null }
  | { type: 'SET_AUDIO_KIND'; payload: string }
  | { type: 'SET_AUDIO_EMOTION'; payload: string }
  | { type: 'SET_AUDIO_EXPRESSIVENESS'; payload: string }
  | { type: 'SET_AUDIO_SFX_DURATION'; payload: number }
  | { type: 'SET_AUDIO_MUSIC_DURATION'; payload: number }
  | { type: 'SET_VIDEO_MODE'; payload: VideoNodeMode }
  | { type: 'SET_AUDIO_SFX_LOOP'; payload: boolean }
  | { type: 'SET_AUDIO_SFX_PROMPT_INFLUENCE'; payload: number }
  | { type: 'SET_AUDIO_SFX_VARIANT_COUNT'; payload: number }
  | { type: 'SET_AUDIO_PACE'; payload: string }
  | { type: 'SET_AUDIO_PAUSE_MARKERS'; payload: string[] }
  | { type: 'SET_AUDIO_VOLUME'; payload: number }
  | { type: 'SET_AUDIO_NORMALIZE_LOUDNESS'; payload: boolean }
  | { type: 'SET_AUDIO_NORMALIZE_TEXT'; payload: boolean }
  | { type: 'SET_AUDIO_WITH_TIMESTAMPS'; payload: boolean }
  | { type: 'SET_AUDIO_FORMAT'; payload: AudioFormat }
  | { type: 'SET_AUDIO_SAMPLE_RATE'; payload: number }
  | { type: 'SET_AUDIO_MP3_BITRATE'; payload: number }
  | { type: 'SET_AUDIO_OPUS_BITRATE'; payload: number }
  | { type: 'SET_AUDIO_LATENCY'; payload: AudioLatency }
  | { type: 'SET_AUDIO_TEMPERATURE'; payload: number }
  | { type: 'SET_AUDIO_TOP_P'; payload: number }
  | { type: 'SET_AUDIO_CHUNK_LENGTH'; payload: number }
  | { type: 'SET_AUDIO_REPETITION_PENALTY'; payload: number }
  | { type: 'SET_AUDIO_SPEAKER_VOICE_IDS'; payload: string[] }
  | {
      type: 'SET_AUDIO_REFERENCE_UPLOAD'
      payload: { url: string; fileName: string } | null
    }
  | { type: 'SET_AUDIO_REFERENCE_TEXT'; payload: string }
  | {
      type: 'SET_PRONUNCIATION_DICTIONARY'
      payload: Record<string, string>
    }
  | { type: 'SET_STYLE_PRESET'; payload: string }
  | { type: 'SET_VIDEO_DURATION'; payload: number }
  | { type: 'SET_VIDEO_RESOLUTION'; payload: string | null }
  | { type: 'SET_LONG_VIDEO_MODE'; payload: boolean }
  | { type: 'SET_LONG_VIDEO_TARGET_DURATION'; payload: number }
  | { type: 'REQUEST_GENERATE' }
  | { type: 'SET_VIDEO_AUDIO_REFS'; payload: VideoAudioReference[] }
  /** 落一张图进具名帧槽；`url: null` = 清空那个槽（⛔ 不是「删掉一个下标」）。 */
  | {
      type: 'SET_VIDEO_FRAME_SLOT'
      payload: { slot: 'first' | 'last'; url: string | null }
    }
  | { type: 'SET_VIDEO_REFERENCE_VIDEOS'; payload: string[] }
  | { type: 'SET_VIDEO_GENERATE_AUDIO'; payload: boolean | null }
  | { type: 'TOGGLE_PANEL'; payload: PanelName }
  | { type: 'OPEN_PANEL'; payload: PanelName }
  | { type: 'CLOSE_PANEL'; payload: PanelName }
  | { type: 'CLOSE_TOOL_PANELS' }
  | { type: 'CLOSE_ALL_PANELS' }
  | { type: 'RESET_FORM' }

const initialPanels: Record<PanelName, boolean> = {
  cardManagement: false,
  projectHistory: false,
  modelSelector: false,
  civitai: false,
  cardSelector: false,
  enhance: false,
  stylePreset: false,
  reverse: false,
  refImage: false,
  audioReading: false,
  musicSpec: false,
  loraSelector: false,
  voiceSelector: false,
  voiceTrainer: false,
  audioTranscribe: false,
  sfxParams: false,
  script: false,
  videoAudio: false,
  keepChange: false,
}

// 'enhance' is deliberately NOT in this list: since 2026-07-07 it backs the
// persistent assistant dock (desktop) / drawer (mobile), which coexists with
// tool dialogs instead of being mutually exclusive with them.
export const STUDIO_TOOL_PANEL_NAMES: PanelName[] = [
  'reverse',
  'cardSelector',
  'stylePreset',
  'refImage',
  'loraSelector',
  'civitai',
  'audioReading',
  'musicSpec',
  'script',
  'videoAudio',
  'voiceSelector',
  'voiceTrainer',
  'audioTranscribe',
  'sfxParams',
]

function openPanel(
  panels: Record<PanelName, boolean>,
  target: PanelName,
): Record<PanelName, boolean> {
  const nextPanels = { ...panels, [target]: true }

  if (!STUDIO_TOOL_PANEL_NAMES.includes(target)) {
    return nextPanels
  }

  for (const panel of STUDIO_TOOL_PANEL_NAMES) {
    if (panel !== target) nextPanels[panel] = false
  }

  return nextPanels
}

const initialWorkflowDefaults = getWorkflowStudioDefaults(DEFAULT_WORKFLOW_ID)

const initialFormState: StudioFormState = {
  selectedWorkflowId: DEFAULT_WORKFLOW_ID,
  outputType: initialWorkflowDefaults.outputType,
  workflowMode: initialWorkflowDefaults.workflowMode ?? 'quick',
  selectedOptionId: null,
  modelSelectionTouched: false,
  prompt: '',
  promptDialect: DEFAULT_PROMPT_DIALECT,
  tagChips: [],
  tagPromptBlocks: [],
  tagNegativeChips: [],
  activeTagCharacterIndex: null,
  recipeUsage: null,
  aspectRatio: '1:1',
  advancedParams: {},
  imageBatchCount: DEFAULT_IMAGE_BATCH_COUNT,
  extraModelOptionIds: [],
  tokenInput: '',
  voiceId: null,
  voiceCardId: null,
  audioKind: DEFAULT_AUDIO_KIND,
  audioEmotion: AUDIO_DEFAULT_EMOTION,
  audioExpressiveness: AUDIO_DEFAULT_EXPRESSIVENESS,
  audioSfxDurationSeconds: DEFAULT_SFX_DURATION_SECONDS,
  audioMusicDurationSeconds: DEFAULT_MUSIC_DURATION_SECONDS,
  audioSfxLoop: false,
  audioSfxPromptInfluence: SFX_PROMPT_INFLUENCE_RANGE.default,
  audioSfxVariantCount: 1,
  audioPace: AUDIO_DEFAULT_PACE,
  audioPauseMarkers: [],
  pronunciationDictionary: {},
  audioVolume: TTS_VOLUME_RANGE.default,
  audioNormalizeLoudness: true,
  audioNormalizeText: true,
  audioWithTimestamps: false,
  audioFormat: DEFAULT_AUDIO_FORMAT,
  audioSampleRate: DEFAULT_AUDIO_SAMPLE_RATE,
  audioMp3Bitrate: DEFAULT_AUDIO_MP3_BITRATE,
  audioOpusBitrate: DEFAULT_AUDIO_OPUS_BITRATE,
  audioLatency: DEFAULT_AUDIO_LATENCY,
  audioTemperature: TTS_TEMPERATURE_RANGE.default,
  audioTopP: TTS_TOP_P_RANGE.default,
  audioChunkLength: TTS_CHUNK_LENGTH_RANGE.default,
  audioRepetitionPenalty: TTS_REPETITION_PENALTY_RANGE.default,
  audioSpeakerVoiceIds: [],
  audioReferenceUrl: null,
  audioReferenceFileName: null,
  audioReferenceText: '',
  stylePresetId: NO_STYLE_PRESET_ID,
  videoMode: DEFAULT_VIDEO_NODE_MODE,
  videoDuration: VIDEO_GENERATION.DEFAULT_DURATION,
  videoResolution: null,
  videoAudioRefs: [],
  videoGenerateAudio: null,
  videoFrameSlots: { first: null, last: null },
  videoReferenceVideos: [],
  longVideoMode: false,
  longVideoTargetDuration: VIDEO_GENERATION.LONG_VIDEO_DURATION_OPTIONS[1], // 30s
  generateRequestId: 0,
  panels: { ...initialPanels },
}

export function studioFormReducer(
  state: StudioFormState,
  action: StudioAction,
): StudioFormState {
  switch (action.type) {
    case 'RESTORE_OPERATOR_CHECKPOINT':
      return {
        ...state,
        ...action.payload,
        modelSelectionTouched: true,
        workflowMode: 'quick',
      }
    case 'SET_SELECTED_WORKFLOW_ID': {
      const defaults = getWorkflowStudioDefaults(action.payload)
      const isChangingMediaGroup = state.outputType !== defaults.outputType
      const panels =
        action.openDefaultPanel !== false && defaults.openPanel
          ? openPanel(state.panels, defaults.openPanel)
          : state.panels

      return {
        ...state,
        selectedWorkflowId: action.payload,
        outputType: defaults.outputType,
        workflowMode: defaults.workflowMode ?? state.workflowMode,
        prompt: isChangingMediaGroup ? '' : state.prompt,
        recipeUsage: isChangingMediaGroup ? null : state.recipeUsage,
        // 台账 A：音频参考与提示词同档 —— 换了媒体大类（视频 → 图片/音频）
        // 它就不再适用；同为视频的工作流之间切换保留，不白扔用户传的素材。
        videoAudioRefs: isChangingMediaGroup ? [] : state.videoAudioRefs,
        videoGenerateAudio: isChangingMediaGroup
          ? null
          : state.videoGenerateAudio,
        panels,
      }
    }
    case 'SET_OUTPUT_TYPE':
      return { ...state, outputType: action.payload }
    case 'SET_VOICE_ID':
      return { ...state, voiceId: action.payload }
    case 'SET_VOICE_CARD_ID':
      return { ...state, voiceCardId: action.payload }
    case 'SET_AUDIO_KIND':
      return { ...state, audioKind: action.payload }
    case 'SET_AUDIO_EMOTION':
      return { ...state, audioEmotion: action.payload }
    case 'SET_AUDIO_EXPRESSIVENESS':
      return { ...state, audioExpressiveness: action.payload }
    case 'SET_AUDIO_SFX_DURATION':
      return { ...state, audioSfxDurationSeconds: action.payload }
    case 'SET_AUDIO_MUSIC_DURATION':
      return { ...state, audioMusicDurationSeconds: action.payload }
    case 'SET_AUDIO_SFX_LOOP':
      return { ...state, audioSfxLoop: action.payload }
    case 'SET_AUDIO_SFX_PROMPT_INFLUENCE':
      return { ...state, audioSfxPromptInfluence: action.payload }
    case 'SET_AUDIO_SFX_VARIANT_COUNT':
      return { ...state, audioSfxVariantCount: action.payload }
    case 'SET_AUDIO_PACE':
      return { ...state, audioPace: action.payload }
    case 'SET_AUDIO_PAUSE_MARKERS':
      return { ...state, audioPauseMarkers: action.payload }
    case 'SET_AUDIO_VOLUME':
      return { ...state, audioVolume: action.payload }
    case 'SET_AUDIO_NORMALIZE_LOUDNESS':
      return { ...state, audioNormalizeLoudness: action.payload }
    case 'SET_AUDIO_NORMALIZE_TEXT':
      return { ...state, audioNormalizeText: action.payload }
    case 'SET_AUDIO_WITH_TIMESTAMPS':
      return { ...state, audioWithTimestamps: action.payload }
    case 'SET_AUDIO_FORMAT':
      return { ...state, audioFormat: action.payload }
    case 'SET_AUDIO_SAMPLE_RATE':
      return { ...state, audioSampleRate: action.payload }
    case 'SET_AUDIO_MP3_BITRATE':
      return { ...state, audioMp3Bitrate: action.payload }
    case 'SET_AUDIO_OPUS_BITRATE':
      return { ...state, audioOpusBitrate: action.payload }
    case 'SET_AUDIO_LATENCY':
      return { ...state, audioLatency: action.payload }
    case 'SET_AUDIO_TEMPERATURE':
      return { ...state, audioTemperature: action.payload }
    case 'SET_AUDIO_TOP_P':
      return { ...state, audioTopP: action.payload }
    case 'SET_AUDIO_CHUNK_LENGTH':
      return { ...state, audioChunkLength: action.payload }
    case 'SET_AUDIO_REPETITION_PENALTY':
      return { ...state, audioRepetitionPenalty: action.payload }
    case 'SET_AUDIO_SPEAKER_VOICE_IDS':
      return {
        ...state,
        audioSpeakerVoiceIds: normalizeSpeakerVoiceIds(action.payload),
      }
    case 'SET_AUDIO_REFERENCE_UPLOAD':
      if (!action.payload) {
        return {
          ...state,
          audioReferenceUrl: null,
          audioReferenceFileName: null,
          audioReferenceText: '',
        }
      }
      return {
        ...state,
        audioReferenceUrl: action.payload.url,
        audioReferenceFileName: action.payload.fileName,
      }
    case 'SET_AUDIO_REFERENCE_TEXT':
      return { ...state, audioReferenceText: action.payload }
    case 'SET_PRONUNCIATION_DICTIONARY':
      return { ...state, pronunciationDictionary: action.payload }
    case 'SET_STYLE_PRESET':
      return { ...state, stylePresetId: action.payload }
    case 'SET_WORKFLOW_MODE':
      return { ...state, workflowMode: action.payload }
    case 'SET_OPTION_ID':
      return {
        ...state,
        selectedOptionId: action.payload,
        modelSelectionTouched: true,
      }
    case 'AUTO_SELECT_OPTION_ID':
      return { ...state, selectedOptionId: action.payload }
    case 'SET_TAG_PROMPT_BLOCKS': {
      if (!action.payload.length && !state.tagPromptBlocks?.length)
        return { ...state, tagPromptBlocks: [] }
      const chips =
        state.promptDialect === 'tags' || state.tagPromptBlocks?.length
          ? state.tagChips
          : parseTagChips(state.prompt)
      return {
        ...state,
        tagChips: chips,
        tagPromptBlocks: action.payload,
        prompt: compileTagPrompt(chips, action.payload),
      }
    }
    case 'SET_PROMPT':
      return {
        ...state,
        prompt: action.payload,
        tagPromptBlocks: [],
        // 标签台开着时，外部改写提示词（助手 · 草稿回灌 · 灵感）要在 chip 上
        // 看得见 —— 否则编辑器画的是一份已经被顶掉的旧名单。
        ...(state.promptDialect === 'tags' || state.tagPromptBlocks?.length
          ? { tagChips: parseTagChips(action.payload) }
          : {}),
      }
    case 'SET_PROMPT_DIALECT': {
      if (state.promptDialect === action.payload) return state
      if (action.payload !== 'tags') {
        return { ...state, promptDialect: action.payload }
      }
      return {
        ...state,
        promptDialect: 'tags',
        tagChips:
          state.tagChips.length || state.tagPromptBlocks?.length
            ? state.tagChips
            : wholeSentenceAsTag(state.prompt),
        tagNegativeChips: state.tagNegativeChips.length
          ? state.tagNegativeChips
          : parseTagChips(state.advancedParams.negativePrompt ?? ''),
      }
    }
    case 'SET_ACTIVE_TAG_CHARACTER':
      return { ...state, activeTagCharacterIndex: action.payload }
    case 'CARRY_PROMPT_TO_TAGS': {
      const carried = wholeSentenceAsTag(state.prompt)
      if (carried.length === 0) return state
      if (state.tagPromptBlocks?.length)
        return { ...state, tagPromptBlocks: [], tagChips: carried }
      // 已经在场的同一句不再插第二遍（来回跳两次会攒出两格一样的字）。
      const existing = state.tagChips.filter(
        (chip) => chip.text !== carried[0].text,
      )
      const tagChips = [...carried, ...existing]
      return {
        ...state,
        tagChips,
        prompt: compileTagPrompt(tagChips, state.tagPromptBlocks ?? []),
      }
    }
    case 'SET_TAG_CHIPS': {
      const text = serializeTagChips(action.payload.chips)
      if (action.payload.polarity === 'positive') {
        return {
          ...state,
          tagChips: action.payload.chips,
          prompt: compileTagPrompt(
            action.payload.chips,
            state.tagPromptBlocks ?? [],
          ),
        }
      }
      return {
        ...state,
        tagNegativeChips: action.payload.chips,
        advancedParams: { ...state.advancedParams, negativePrompt: text },
      }
    }
    case 'REMOVE_PROMPT_REFERENCE':
      return {
        ...state,
        prompt: removeReferenceMentions(state.prompt, action.payload),
      }
    case 'SET_RECIPE_USAGE':
      return { ...state, recipeUsage: action.payload }
    case 'SET_ASPECT_RATIO':
      return { ...state, aspectRatio: action.payload }
    case 'SET_ADVANCED_PARAMS': {
      /**
       * 角色被删光 / 删到当前这一个之前时，编辑器主区正指着一个不存在的人。
       * ⚠ 跟着同一次写回落，⛔ 不另起一个「发现越界再回退」的 effect ——
       * 那会先渲染一帧空白再纠正。
       */
      const characters = action.payload.novelAiLayout?.characters.length ?? 0
      const active = state.activeTagCharacterIndex
      return {
        ...state,
        advancedParams: action.payload,
        activeTagCharacterIndex:
          active !== null && active >= characters ? null : active,
      }
    }
    case 'RESET_ADVANCED_PARAMS':
      return { ...state, advancedParams: {} }
    case 'SET_IMAGE_BATCH_COUNT':
      return { ...state, imageBatchCount: action.payload }
    case 'TOGGLE_EXTRA_MODEL': {
      // 主模型不进额外名单 —— 它已经在跑了，重复挂一条等于同一个模型发两次。
      if (action.payload === state.selectedOptionId) return state
      const has = state.extraModelOptionIds.includes(action.payload)
      return {
        ...state,
        extraModelOptionIds: has
          ? state.extraModelOptionIds.filter((id) => id !== action.payload)
          : [...state.extraModelOptionIds, action.payload],
      }
    }
    case 'REMOVE_EXTRA_MODEL':
      return {
        ...state,
        extraModelOptionIds: state.extraModelOptionIds.filter(
          (id) => id !== action.payload,
        ),
      }
    case 'SET_TOKEN_INPUT':
      return { ...state, tokenInput: action.payload }
    case 'SET_VIDEO_MODE':
      return { ...state, videoMode: action.payload }
    case 'SET_VIDEO_DURATION':
      return { ...state, videoDuration: action.payload }
    case 'SET_VIDEO_RESOLUTION':
      return { ...state, videoResolution: action.payload }
    case 'SET_VIDEO_FRAME_SLOT':
      return {
        ...state,
        videoFrameSlots: {
          ...state.videoFrameSlots,
          [action.payload.slot]: action.payload.url,
        },
      }

    case 'SET_VIDEO_REFERENCE_VIDEOS':
      return { ...state, videoReferenceVideos: action.payload }

    case 'SET_VIDEO_AUDIO_REFS':
      return { ...state, videoAudioRefs: action.payload }
    case 'SET_VIDEO_GENERATE_AUDIO':
      return { ...state, videoGenerateAudio: action.payload }
    case 'SET_LONG_VIDEO_MODE':
      return { ...state, longVideoMode: action.payload }
    case 'SET_LONG_VIDEO_TARGET_DURATION':
      return { ...state, longVideoTargetDuration: action.payload }
    case 'REQUEST_GENERATE':
      return { ...state, generateRequestId: state.generateRequestId + 1 }
    case 'TOGGLE_PANEL': {
      const target = action.payload
      const isOpening = !state.panels[target]
      const panels = isOpening
        ? openPanel(state.panels, target)
        : { ...state.panels, [target]: false }
      return { ...state, panels }
    }
    case 'OPEN_PANEL':
      return {
        ...state,
        panels: openPanel(state.panels, action.payload),
      }
    case 'CLOSE_PANEL':
      return {
        ...state,
        panels: { ...state.panels, [action.payload]: false },
      }
    case 'CLOSE_TOOL_PANELS': {
      const panels = { ...state.panels }
      for (const panel of STUDIO_TOOL_PANEL_NAMES) {
        panels[panel] = false
      }
      return { ...state, panels }
    }
    case 'CLOSE_ALL_PANELS':
      return {
        ...state,
        panels: { ...initialPanels },
      }
    case 'RESET_FORM':
      return {
        ...state,
        prompt: '',
        tagChips: [],
        tagPromptBlocks: [],
        tagNegativeChips: [],
        activeTagCharacterIndex: null,
        recipeUsage: null,
        aspectRatio: '1:1',
        advancedParams: {},
        imageBatchCount: DEFAULT_IMAGE_BATCH_COUNT,
        extraModelOptionIds: [],
        selectedOptionId: null,
        voiceId: null,
        voiceCardId: null,
        audioKind: DEFAULT_AUDIO_KIND,
        audioEmotion: AUDIO_DEFAULT_EMOTION,
        audioExpressiveness: AUDIO_DEFAULT_EXPRESSIVENESS,
        audioSfxDurationSeconds: DEFAULT_SFX_DURATION_SECONDS,
        audioMusicDurationSeconds: DEFAULT_MUSIC_DURATION_SECONDS,
        audioSfxLoop: false,
        audioSfxPromptInfluence: SFX_PROMPT_INFLUENCE_RANGE.default,
        audioSfxVariantCount: 1,
        audioPace: AUDIO_DEFAULT_PACE,
        audioPauseMarkers: [],
        pronunciationDictionary: {},
        audioVolume: TTS_VOLUME_RANGE.default,
        audioNormalizeLoudness: true,
        audioNormalizeText: true,
        audioWithTimestamps: false,
        audioFormat: DEFAULT_AUDIO_FORMAT,
        audioSampleRate: DEFAULT_AUDIO_SAMPLE_RATE,
        audioMp3Bitrate: DEFAULT_AUDIO_MP3_BITRATE,
        audioOpusBitrate: DEFAULT_AUDIO_OPUS_BITRATE,
        audioLatency: DEFAULT_AUDIO_LATENCY,
        audioTemperature: TTS_TEMPERATURE_RANGE.default,
        audioTopP: TTS_TOP_P_RANGE.default,
        audioChunkLength: TTS_CHUNK_LENGTH_RANGE.default,
        audioRepetitionPenalty: TTS_REPETITION_PENALTY_RANGE.default,
        audioSpeakerVoiceIds: [],
        audioReferenceUrl: null,
        audioReferenceFileName: null,
        audioReferenceText: '',
        stylePresetId: NO_STYLE_PRESET_ID,
        videoMode: DEFAULT_VIDEO_NODE_MODE,
        videoDuration: VIDEO_GENERATION.DEFAULT_DURATION,
        videoResolution: null,
        videoAudioRefs: [],
        videoFrameSlots: { first: null, last: null },
        videoReferenceVideos: [],
        videoGenerateAudio: null,
        longVideoMode: false,
        longVideoTargetDuration:
          VIDEO_GENERATION.LONG_VIDEO_DURATION_OPTIONS[1],
        generateRequestId: 0,
        panels: { ...initialPanels },
      }
    default:
      return state
  }
}

interface StudioFormContextValue {
  state: StudioFormState
  dispatch: React.Dispatch<StudioAction>
  selectedWorkflowId: WorkflowId
  setSelectedWorkflowId: (workflowId: WorkflowId) => void
  getSelectedWorkflow: () => Workflow | undefined
}

const StudioFormContext = createContext<StudioFormContextValue | null>(null)

// ═══════════════════════════════════════════════════════════════════
// 2. DATA CONTEXT (WARM — changes on user card/project actions)
// ═══════════════════════════════════════════════════════════════════

interface StudioDataContextValue {
  characters: UseCharacterCardsReturn
  backgrounds: UseBackgroundCardsReturn
  styles: UseStyleCardsReturn
  projects: ReturnType<typeof useProjects>
  imageUpload: ReturnType<typeof useImageUpload>
  promptEnhance: ReturnType<typeof usePromptEnhance>
  civitai: ReturnType<typeof useCivitaiToken>
  usageSummary: ReturnType<typeof useUsageSummary>
}

const StudioDataContext = createContext<StudioDataContextValue | null>(null)

// ═══════════════════════════════════════════════════════════════════
// 3. GENERATION CONTEXT (COLD — changes only during generation)
// ═══════════════════════════════════════════════════════════════════

interface StudioGenContextValue extends UseUnifiedGenerateReturn {
  lastEvaluation: GenerationEvaluation | null
  setLastEvaluation: (evaluation: GenerationEvaluation | null) => void
}

const StudioGenContext = createContext<StudioGenContextValue | null>(null)

// ═══════════════════════════════════════════════════════════════════
// COMBINED PROVIDER
// ═══════════════════════════════════════════════════════════════════

export function StudioProvider({ children }: { children: ReactNode }) {
  // HOT — form state
  const [formState, dispatch] = useReducer(studioFormReducer, initialFormState)
  const setSelectedWorkflowId = useCallback((workflowId: WorkflowId) => {
    dispatch({ type: 'SET_SELECTED_WORKFLOW_ID', payload: workflowId })
  }, [])
  const getSelectedWorkflow = useCallback(
    () => getWorkflowById(formState.selectedWorkflowId),
    [formState.selectedWorkflowId],
  )
  const formValue = useMemo(
    () => ({
      state: formState,
      dispatch,
      selectedWorkflowId: formState.selectedWorkflowId,
      setSelectedWorkflowId,
      getSelectedWorkflow,
    }),
    [formState, getSelectedWorkflow, setSelectedWorkflowId],
  )

  // WARM — data hooks
  const projects = useProjects()
  const characters = useCharacterCards()
  const backgrounds = useBackgroundCards(projects.activeProjectId)
  const styles = useStyleCards(projects.activeProjectId)
  const onReferencesRemoved = useCallback((index?: number) => {
    dispatch({ type: 'REMOVE_PROMPT_REFERENCE', payload: index })
  }, [])
  const imageUpload = useImageUpload({ onReferencesRemoved })
  const promptEnhance = usePromptEnhance()
  const civitai = useCivitaiToken()
  const usageSummary = useUsageSummary()

  const dataValue = useMemo<StudioDataContextValue>(
    () => ({
      characters,
      backgrounds,
      styles,
      projects,
      imageUpload,
      promptEnhance,
      civitai,
      usageSummary,
    }),
    [
      characters,
      backgrounds,
      styles,
      projects,
      imageUpload,
      promptEnhance,
      civitai,
      usageSummary,
    ],
  )

  // COLD — generation
  const generation = useUnifiedGenerate()
  const [lastEvaluation, setLastEvaluation] =
    useState<GenerationEvaluation | null>(null)
  const generationValue = useMemo<StudioGenContextValue>(
    () => ({
      ...generation,
      lastEvaluation,
      setLastEvaluation,
    }),
    [generation, lastEvaluation],
  )

  // Refresh usage summary when a generation completes
  const prevGenerationRef = useRef(generation.lastGeneration)
  useEffect(() => {
    if (
      generation.lastGeneration &&
      generation.lastGeneration !== prevGenerationRef.current
    ) {
      prevGenerationRef.current = generation.lastGeneration
      usageSummary.refresh()
    }
  }, [generation.lastGeneration, usageSummary])

  return (
    <StudioFormContext.Provider value={formValue}>
      <StudioDataContext.Provider value={dataValue}>
        <StudioGenContext.Provider value={generationValue}>
          {children}
        </StudioGenContext.Provider>
      </StudioDataContext.Provider>
    </StudioFormContext.Provider>
  )
}

// ═══════════════════════════════════════════════════════════════════
// CONSUMER HOOKS — each component only subscribes to what it needs
// ═══════════════════════════════════════════════════════════════════

/**
 * Form state escape hatch for components that legitimately render both
 * inside and outside the Studio workspace tree — e.g. QuickSetupDialog
 * appears in StudioPromptArea (inside StudioProvider) AND in
 * LoraTrainingForm on /studio/lora (outside StudioProvider). Returns
 * null when no provider is present so the caller can decide what to do
 * (typically: skip the dispatch that only makes sense inside Studio).
 * Use the throwing useStudioForm() unless you have this dual-context need.
 */
export function useStudioFormOptional(): StudioFormContextValue | null {
  return useContext(StudioFormContext)
}

/** Form state (prompt, mode, panels, aspect ratio) — re-renders on keystrokes */
export function useStudioForm(): StudioFormContextValue {
  const ctx = useContext(StudioFormContext)
  if (!ctx) {
    throw new Error('useStudioForm must be used within <StudioProvider>')
  }
  return ctx
}

/** Data state (cards, projects, upload, enhance, civitai) — re-renders on CRUD actions */
export function useStudioData(): StudioDataContextValue {
  const ctx = useContext(StudioDataContext)
  if (!ctx) {
    throw new Error('useStudioData must be used within <StudioProvider>')
  }
  return ctx
}

/**
 * Generation state escape hatch — same dual-context need as
 * `useStudioFormOptional`, for the operator panel (P4-C). The panel now hosts on
 * `/studio/lora` too, and that route deliberately has no `<StudioProvider>`; its
 * result-watching hook must degrade to "there is nothing to watch here" instead
 * of throwing. Use the throwing `useStudioGen()` unless you have that need.
 */
export function useStudioGenOptional(): StudioGenContextValue | null {
  return useContext(StudioGenContext)
}

/** Generation state — re-renders only during generation */
export function useStudioGen(): StudioGenContextValue {
  const ctx = useContext(StudioGenContext)
  if (!ctx) {
    throw new Error('useStudioGen must be used within <StudioProvider>')
  }
  return ctx
}

/** Convenience: get all 3 contexts at once (use sparingly — causes re-renders from all 3) */
export function useStudioContext() {
  return {
    ...useStudioForm(),
    ...useStudioData(),
    generation: useStudioGen(),
  }
}
