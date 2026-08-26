'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { ImagePlus, Mic2, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

import {
  NODE_STUDIO_AUDIO_INPUT,
  NODE_STUDIO_PLACEHOLDER_TOAST,
  NODE_STUDIO_VOICE_EMOTION_IDS,
  NODE_STUDIO_VOICE_EMOTIONS,
  NODE_STUDIO_VOICE_CLIP_SOURCE_IDS,
  NODE_STUDIO_VOICE_PROFILE,
  NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS,
} from '@/constants/node-studio'
import { TTS_SPEED_RANGE, TTS_VOLUME_RANGE } from '@/constants/audio-options'
import { AUDIO_GENERATION } from '@/constants/config'
import { AI_MODELS } from '@/constants/models'
import { NODE_MEDIA_KIND_IDS, NODE_STATUS_IDS } from '@/constants/node-types'
import {
  checkAudioStatusAPI,
  generateAudioAPI,
  getVoiceAPI,
  uploadReferenceAudioAPI,
} from '@/lib/api-client'
import { resolveNodeDisplayName } from '@/lib/node-display-name'
import { readVoiceUrlFromData } from '@/lib/node-workflow-graph'
import { cn } from '@/lib/utils'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import { ParamSlider } from '@/components/ui/param-slider'
import { Spinner } from '@/components/ui/spinner'
import { useDownstreamUses } from '@/hooks/node/use-downstream-uses'
import { useNodeReferenceUpload } from '@/hooks/node/use-node-reference-upload'
import type { GenerationRecord } from '@/types'
import type { NodeWorkflowNodeData } from '@/types/node-workflow'

import { FishVoiceLibraryDialog } from '../FishVoiceLibraryDialog'
import type { SelectedVoice } from '../VoiceSelector'
import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { NodeProgressState } from '../nodes/NodeProgressState'
import { DetailModelPicker } from './DetailModelPicker'
import { EvidenceDrawer, EvidenceRow } from './EvidenceDrawer'
import { RelationsStrip } from './RelationsStrip'
import type { NodeDetailBodyProps } from './registry'
import type { NodeDetailSlots } from './slots'

function stopCanvasKeyboardEvent(event: ReactKeyboardEvent<HTMLElement>): void {
  event.stopPropagation()
}

/**
 * ⚠ 这里曾经是 `hasVoiceContent`（voiceName || voiceId || 参考音频 || 情绪），
 * 只要选了个音色就盖 ready —— 而收藏来的系统音色只有 `voiceId`、一个音频 url
 * 都没有，当视频参考音频时发不出去，面板却说 ready。改成与收割层同一个判据：
 * ready 只表示「真的发得出去」，「选没选过音色」由 voiceId 自己表达。
 */
function hasSendableVoiceAudio(data: NodeWorkflowNodeData): boolean {
  return Boolean(readVoiceUrlFromData(data))
}

function isSupportedAudioFile(file: File): boolean {
  if (file.type.startsWith(NODE_STUDIO_AUDIO_INPUT.mimePrefix)) return true
  const fileName = file.name.toLowerCase()
  return NODE_STUDIO_AUDIO_INPUT.fileExtensions.some((extension) =>
    fileName.endsWith(extension),
  )
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function waitForGeneratedSample(
  jobId: string,
): Promise<GenerationRecord | null> {
  for (
    let attempt = 0;
    attempt < AUDIO_GENERATION.MAX_POLL_ATTEMPTS;
    attempt += 1
  ) {
    const statusResponse = await checkAudioStatusAPI(jobId)
    if (!statusResponse.success || !statusResponse.data) return null
    if (statusResponse.data.status === 'COMPLETED') {
      return statusResponse.data.generation
    }
    if (statusResponse.data.status === 'FAILED') return null
    await delay(AUDIO_GENERATION.POLL_INTERVAL_MS)
  }
  return null
}

/**
 * 音色（`voice`）—— 一个**音色身份**构建器，不是写台词的地方。这里没有台词输入：
 * 具体说什么活在剧本 / 下游视频节点里（剧本后置）。用户在这里挑或传一个音色、
 * 可选地换封面、试听一段代表音频、调语速/音量/情绪。
 *
 * ── 方向 E 迁移（S5，2026-08-04）─────────────────────────────
 * 契约 §6：`音色卡 + 播放器` / `音色库·我的音色` / `模型 + 语速·音量·情绪` /
 * 「还没有角色绑定这个音色」/ `取样将发送` / `取得音色样本`。
 *
 * ⚠ 迁移前这一族的 DOM 序是 **3→2→4→2→7→4**（跳序）—— 左轨里塞着来源两档（槽 3）、
 * 音色卡（槽 2）、模型（槽 4）、代表音频（槽 2），右轨里是参数（槽 4）。
 * 契约「槽序 = DOM 序 = 键盘序，全断点严格不跳」，这是十族里最严重的一处。
 *
 * ⚠ **模型选择器归编排台**。它此前落在左轨（媒体侧），而别的族都在编排台 ——
 * 直接违反「同一个控件不得在不同族落到不同的槽」。
 *
 * ⚠ **`activeSource` 与 `voiceSource` 合一**。原来来源两档是组件本地 state，
 * 切换**不落库**：切到「我的音色」后关掉面板再打开就弹回「系统音色」，而卡面
 * （`VoiceNode`）读的是持久字段 `voiceSource` —— 同一时刻卡和面板显示的来源不一致。
 * 现在两档就是 `voiceSource` 本身。`VoiceNode` 早已按这个字段解析封面与试听源，
 * 且对 `manual` 有兜底，所以合一不引入新分支。
 */
export function VoiceDetailBody({
  nodeId,
  type,
  data,
  children,
}: NodeDetailBodyProps & {
  children: (slots: NodeDetailSlots) => React.ReactNode
}) {
  const t = useTranslations('StudioNode.voiceDetail')
  const tVoice = useTranslations('StudioNode.voiceProfile')
  const tDetail = useTranslations('StudioNode.nodeDetail')
  const tTypes = useTranslations('StudioNode.nodeTypes')
  const { updateNodeData, modelOptionsByType } = useNodeWorkflowActions()
  const uses = useDownstreamUses(nodeId)

  const inputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  // 跟住当前音色：一次试听最长可跑约 200s，中途换音色时要把旧结果丢掉，
  // 否则上一把的样本会落到新音色身上。与 VoiceSelector 的 request-id 守卫同构。
  const activeVoiceIdRef = useRef(data.voiceId)
  useEffect(() => {
    activeVoiceIdRef.current = data.voiceId
  }, [data.voiceId])
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [audioAssetDialogOpen, setAudioAssetDialogOpen] = useState(false)
  const [coverAssetDialogOpen, setCoverAssetDialogOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isGeneratingSample, setIsGeneratingSample] = useState(false)
  // 记的是**出错的那个 URL**而不是一个布尔：换到另一个封面有效的音色时能自动恢复，
  // 不会一直卡在图标兜底上。
  const [erroredCover, setErroredCover] = useState<string | null>(null)
  const { uploadFile: uploadCover, isUploading: isCoverUploading } =
    useNodeReferenceUpload()

  const modelOptions = modelOptionsByType[type] ?? []
  const isFishSource =
    data.voiceSource !== NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.referenceAudio

  const applyPatch = useCallback(
    (patch: Partial<NodeWorkflowNodeData>) => {
      const next = { ...data, ...patch }
      updateNodeData(nodeId, {
        ...patch,
        status: hasSendableVoiceAudio(next)
          ? NODE_STATUS_IDS.ready
          : NODE_STATUS_IDS.idle,
      })
    },
    [data, nodeId, updateNodeData],
  )

  const handleSelectVoiceId = useCallback(
    (voice: SelectedVoice) => {
      applyPatch({
        voiceId: voice.voiceId,
        voiceName: voice.name,
        voiceCoverImage: voice.coverImage ?? undefined,
        voiceProvider:
          data.voiceProvider || NODE_STUDIO_VOICE_PROFILE.providerDefault,
        voiceSource: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.fishAudio,
        // 选择器已经把声音库那段自带试听取来了 —— 直接当作这个节点的产物。
        // 没有试听时清掉上一个音色的旧片段，绝不留着假装还能发。
        voiceClipUrl: voice.sampleUrl ?? undefined,
        voiceClipSource: voice.sampleUrl
          ? NODE_STUDIO_VOICE_CLIP_SOURCE_IDS.library
          : undefined,
      })
      setErroredCover(null)
      setLibraryOpen(false)
    },
    [applyPatch, data.voiceProvider],
  )

  const handleUpload = useCallback(
    async (file: File) => {
      if (!isSupportedAudioFile(file)) {
        toast.error(tVoice('toasts.unsupportedAudio'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }
      setIsUploading(true)
      const result = await uploadReferenceAudioAPI(file)
      setIsUploading(false)
      if (!result.success || !result.data) {
        toast.error(result.error ?? tVoice('toasts.uploadFailed'), {
          duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
          position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
        })
        return
      }
      applyPatch({
        voiceClipUrl: result.data.url,
        voiceClipSource: NODE_STUDIO_VOICE_CLIP_SOURCE_IDS.uploaded,
        voiceReferenceAudioName: result.data.fileName.slice(
          0,
          NODE_STUDIO_VOICE_PROFILE.maxAudioNameLength,
        ),
        voiceReferenceAudioMimeType: result.data.mimeType,
        voiceSource: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.referenceAudio,
      })
    },
    [applyPatch, tVoice],
  )

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (inputRef.current) inputRef.current.value = ''
      if (file) void handleUpload(file)
    },
    [handleUpload],
  )

  const handleClearReferenceAudio = useCallback(() => {
    applyPatch({
      voiceClipUrl: undefined,
      voiceClipSource: undefined,
      voiceReferenceAudioName: undefined,
      voiceReferenceAudioMimeType: undefined,
      voiceReferenceCoverImage: undefined,
      voiceSource: data.voiceId
        ? NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.fishAudio
        : NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.manual,
    })
  }, [applyPatch, data.voiceId])

  const handleSelectReferenceAsset = useCallback(
    (generation: GenerationRecord) => {
      setErroredCover(null)
      applyPatch({
        voiceClipUrl: generation.url,
        voiceClipSource: NODE_STUDIO_VOICE_CLIP_SOURCE_IDS.uploaded,
        voiceReferenceAudioName: tVoice('referenceAudioFallback'),
        voiceReferenceAudioMimeType: NODE_STUDIO_AUDIO_INPUT.assetMimeType,
        // 节点只**跟随**素材的封面（在素材库里配的）。存自己的字段里，
        // 这样来回切来源时永远不会覆盖系统音色那张。
        voiceReferenceCoverImage:
          generation.previewUrl ?? generation.thumbnailUrl ?? undefined,
        voiceSource: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.referenceAudio,
      })
      setAudioAssetDialogOpen(false)
    },
    [applyPatch, tVoice],
  )

  const applyCover = useCallback(
    (url: string) => {
      applyPatch(
        isFishSource
          ? { voiceCoverImage: url }
          : { voiceReferenceCoverImage: url },
      )
      setErroredCover(null)
    },
    [applyPatch, isFishSource],
  )

  const handleCoverFileInputChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (coverInputRef.current) coverInputRef.current.value = ''
      if (!file?.type.startsWith('image/')) return
      const result = await uploadCover(file, 'Voice profile cover')
      if (result.success && result.url) {
        applyCover(result.url)
        return
      }
      toast.error(result.error ?? t('coverUploadFailed'), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
    },
    [applyCover, t, uploadCover],
  )

  const handleSelectCoverAsset = useCallback(
    (generation: GenerationRecord) => {
      if (!generation.url) return
      applyCover(generation.url)
      setCoverAssetDialogOpen(false)
    },
    [applyCover],
  )

  const handleGenerateSample = useCallback(async () => {
    if (!data.voiceId) {
      toast.error(tVoice('toasts.referenceGenerateNoVoice'), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
      return
    }
    const requestedVoiceId = data.voiceId
    setIsGeneratingSample(true)

    // 声音库自带的试听直接拿来用 —— 系统音色在库里本来就有示例音频（抽查 300 个
    // 只有 ~2% 没有），没有理由再花用户的 key、再等一次合成，去得到同一个音色念
    // 同一段固定文本。只有库里确实没有样本时才往下走真正的合成。
    const libraryVoice = await getVoiceAPI(requestedVoiceId)
    const librarySample =
      (libraryVoice.success &&
        libraryVoice.data?.samples.find((sample) => sample.audio)?.audio) ||
      null
    if (librarySample) {
      setIsGeneratingSample(false)
      if (activeVoiceIdRef.current !== requestedVoiceId) return
      applyPatch({
        voiceClipUrl: librarySample,
        voiceClipSource: NODE_STUDIO_VOICE_CLIP_SOURCE_IDS.library,
      })
      toast.success(tVoice('toasts.sampleGenerated'), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
      return
    }

    const response = await generateAudioAPI({
      prompt: NODE_STUDIO_VOICE_PROFILE.referenceSampleText,
      modelId: data.model?.modelId ?? AI_MODELS.FISH_AUDIO_S2_PRO,
      voiceId: requestedVoiceId,
      apiKeyId: data.model?.apiKeyId,
      // 把音色头像**按引用**带进素材库（previewUrl）。只接受合法绝对 URL ——
      // 一个畸形封面绝不能把生成请求 400 掉。
      coverImageUrl:
        typeof data.voiceCoverImage === 'string' &&
        data.voiceCoverImage.startsWith('http')
          ? data.voiceCoverImage
          : undefined,
    })
    if (!response.success || !response.data) {
      setIsGeneratingSample(false)
      toast.error(response.error ?? tVoice('toasts.referenceGenerateFailed'), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
      return
    }
    const generation = await waitForGeneratedSample(response.data.jobId)
    setIsGeneratingSample(false)
    // 轮询期间用户换了音色 —— 丢掉这个陈旧样本，别落到现在这个（不同的）音色上。
    if (activeVoiceIdRef.current !== requestedVoiceId) return
    if (!generation) {
      toast.error(tVoice('toasts.referenceGenerateFailed'), {
        duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
        position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
      })
      return
    }
    applyPatch({
      voiceClipUrl: generation.url,
      voiceClipSource: NODE_STUDIO_VOICE_CLIP_SOURCE_IDS.synthesized,
    })
    toast.success(tVoice('toasts.sampleGenerated'), {
      duration: NODE_STUDIO_PLACEHOLDER_TOAST.durationMs,
      position: NODE_STUDIO_PLACEHOLDER_TOAST.position,
    })
  }, [data.voiceId, data.voiceCoverImage, data.model, applyPatch, tVoice])

  const selectedEmotion = (
    NODE_STUDIO_VOICE_EMOTIONS as readonly string[]
  ).includes(data.voiceEmotion ?? '')
    ? (data.voiceEmotion as string)
    : NODE_STUDIO_VOICE_EMOTION_IDS.none

  // 绝不露原始 voiceId —— 那串东西读起来是乱码。
  // ⚠ 一个音色都没选时**不能**回落到 provider：真机实拍到卡上「Fish Audio」
  // 上下叠了两行（名字位与 provider 位同一个值），看上去像已经选好了。
  // 没选就说没选。
  // 画布修法 08-A：首选项直接读 data.voiceName 绕开了机器值守卫，改走共享
  // 解析器；后两档兜底（选了但没名 / 完全没选）逻辑不变。
  const selectedVoiceName =
    resolveNodeDisplayName(data) ||
    (data.voiceId ? '' : tDetail('valueUnset')) ||
    ''
  const selectedVoiceProvider =
    data.voiceProvider?.trim() || NODE_STUDIO_VOICE_PROFILE.providerDefault
  const activeCover = isFishSource
    ? data.voiceCoverImage
    : data.voiceReferenceCoverImage
  const showVoiceCover = Boolean(activeCover) && erroredCover !== activeCover
  // 试听源 = 那段参考语音本身。收敛之前这里是「按来源取对应字段 + 两层兜底」的
  // 三行解析，那是两个字段并存时代的产物；现在只有一个产物字段，一行就够。
  const playableUrl = readVoiceUrlFromData(data) ?? null
  const hasVoice = Boolean(isFishSource ? data.voiceId : playableUrl)
  // 合成参数（语速/音量/情绪）只作用于**合成**。库里取来的片段已经录成那样了，
  // 调不动 —— 显示就是在暗示可以调（owner 2026-08-10 拍板：只在合成路径上露出）。
  const showSynthesisParams =
    data.voiceClipSource !== NODE_STUDIO_VOICE_CLIP_SOURCE_IDS.library &&
    data.voiceClipSource !== NODE_STUDIO_VOICE_CLIP_SOURCE_IDS.uploaded

  const coverThumbnail = (
    <button
      type="button"
      onClick={() => coverInputRef.current?.click()}
      disabled={isCoverUploading}
      aria-label={t('coverUpload')}
      className="nodrag group relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-node-panel-inner text-node-muted outline-none focus-visible:ring-2 focus-visible:ring-node-focus-ring/40 disabled:opacity-60"
    >
      {showVoiceCover && activeCover ? (
        // 第三方封面来自任意域名；用原生 img + 图标兜底。
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={activeCover}
          alt={t('coverAlt')}
          className="size-full object-cover"
          onError={() => setErroredCover(activeCover ?? null)}
        />
      ) : isCoverUploading ? (
        <Spinner size="lg" />
      ) : (
        <Mic2 className="size-7" />
      )}
      <span className="absolute inset-x-1 bottom-1 rounded-lg bg-node-canvas/85 px-1 py-0.5 text-3xs font-semibold text-node-foreground opacity-0 transition-opacity group-focus-visible:opacity-100 group-hover:opacity-100">
        {t('coverChange')}
      </span>
    </button>
  )

  return (
    <>
      {children({
        stage: (
          <div className="canvas-detail-stage">
            <div className="canvas-detail-voice-card">
              <input
                ref={coverInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleCoverFileInputChange}
              />
              <div className="flex items-center gap-3">
                {coverThumbnail}
                <div className="min-w-0 flex-1">
                  {/* R6：名字与 provider 是**派生显示值**，不穿控件壳。
                      换音色这个动作归素材架那一行的「音色库」。 */}
                  <p className="truncate text-sm font-semibold text-node-foreground">
                    {isFishSource
                      ? selectedVoiceName
                      : (data.voiceReferenceAudioName ??
                        tVoice('referenceAudioFallback'))}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-node-muted">
                    {isFishSource ? selectedVoiceProvider : t('sourceMine')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCoverAssetDialogOpen(true)}
                  onKeyDownCapture={stopCanvasKeyboardEvent}
                  className="nodrag flex size-8 shrink-0 items-center justify-center rounded-lg text-node-muted outline-none transition-colors hover:bg-node-panel-inner hover:text-node-foreground focus-visible:ring-2 focus-visible:ring-node-focus-ring/40"
                  aria-label={t('coverFromAssets')}
                  title={t('coverFromAssets')}
                >
                  <ImagePlus className="size-4" />
                </button>
                {!isFishSource && playableUrl ? (
                  <button
                    type="button"
                    onClick={handleClearReferenceAudio}
                    onKeyDownCapture={stopCanvasKeyboardEvent}
                    aria-label={tVoice('clearAudio')}
                    title={tVoice('clearAudio')}
                    className="nodrag flex size-8 shrink-0 items-center justify-center rounded-lg text-node-muted outline-none transition-colors hover:bg-node-panel-inner hover:text-node-foreground focus-visible:ring-2 focus-visible:ring-node-focus-ring/40"
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </div>

              {/* 播放器：契约 §6 把它和音色卡一起归主体台 —— 「这个节点此刻是什么、
                  证据长什么样」，对音色来说证据就是能听见的那一段。
                  ⚠ 空态**不换版式**（R2）：没有可播的 clip 时留一条哑轨，
                  几何不变，不写「先选一个音色」之类的解释文案。 */}
              <div className="mt-3">
                {playableUrl ? (
                  <audio src={playableUrl} controls className="nodrag w-full" />
                ) : (
                  <div className="canvas-detail-voice-track" aria-hidden />
                )}
              </div>

              {isGeneratingSample ? (
                <NodeProgressState
                  indicator="breath"
                  veiled
                  label={t('generateSample')}
                />
              ) : null}
            </div>
          </div>
        ),

        rack: (
          <div className="canvas-detail-shelf" role="group">
            <input
              ref={inputRef}
              type="file"
              accept={NODE_STUDIO_AUDIO_INPUT.accept}
              className="hidden"
              onChange={handleFileInputChange}
            />
            {/* 两档来源。⚠ `aria-pressed` + 下划线加粗表达选中，不做实心分段控件 ——
                R10「全屏只有一个实心元素」，那一个归动作坞。 */}
            <button
              type="button"
              onClick={() =>
                applyPatch({
                  voiceSource: NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.fishAudio,
                })
              }
              onKeyDownCapture={stopCanvasKeyboardEvent}
              aria-pressed={isFishSource}
              className="canvas-detail-txt-btn canvas-detail-txt-btn--seg"
            >
              {t('sourceSystem')}
            </button>
            <button
              type="button"
              onClick={() =>
                applyPatch({
                  voiceSource:
                    NODE_STUDIO_VOICE_PROFILE_SOURCE_IDS.referenceAudio,
                })
              }
              onKeyDownCapture={stopCanvasKeyboardEvent}
              aria-pressed={!isFishSource}
              className="canvas-detail-txt-btn canvas-detail-txt-btn--seg"
            >
              {t('sourceMine')}
            </button>

            {isFishSource ? (
              <button
                type="button"
                onClick={() => setLibraryOpen(true)}
                onKeyDownCapture={stopCanvasKeyboardEvent}
                className="canvas-detail-txt-btn"
              >
                {tVoice('chooseVoice')}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  onKeyDownCapture={stopCanvasKeyboardEvent}
                  disabled={isUploading}
                  className="canvas-detail-txt-btn"
                >
                  {tVoice('uploadAudio')}
                </button>
                <button
                  type="button"
                  onClick={() => setAudioAssetDialogOpen(true)}
                  onKeyDownCapture={stopCanvasKeyboardEvent}
                  className="canvas-detail-txt-btn"
                >
                  {tVoice('referenceFromAssets')}
                </button>
              </>
            )}
          </div>
        ),

        desk: (
          <div className="canvas-detail-stack nodrag nopan nowheel">
            {/* ⚠ 模型归**编排台** —— 迁移前它在左轨（媒体侧），而其余族都在编排台，
                直接违反「同一个控件不得在不同族落到不同的槽」。 */}
            <DetailModelPicker
              value={data.model}
              options={modelOptions}
              onChange={(model) => updateNodeData(nodeId, { model })}
              kind={NODE_MEDIA_KIND_IDS.audio}
            />
            {/* 合成参数只在**合成**这条路上露出。取用库里的片段 / 用户上传的音频时，
                那段音频已经录成那样了，这三个控件对它一点作用都没有 —— 显示就是在
                暗示可以调（owner 2026-08-10）。域定义见 canvas-voice-card.md §0.5。 */}
            {showSynthesisParams ? (
              <>
                <ParamSlider
                  label={t('speedLabel')}
                  value={data.voiceSpeed ?? TTS_SPEED_RANGE.default}
                  onChange={(value) => applyPatch({ voiceSpeed: value })}
                  min={TTS_SPEED_RANGE.min}
                  max={TTS_SPEED_RANGE.max}
                  step={TTS_SPEED_RANGE.step}
                  formatValue={(value) => `${value.toFixed(1)}×`}
                />
                <ParamSlider
                  label={t('volumeLabel')}
                  value={data.voiceVolume ?? TTS_VOLUME_RANGE.default}
                  onChange={(value) => applyPatch({ voiceVolume: value })}
                  min={TTS_VOLUME_RANGE.min}
                  max={TTS_VOLUME_RANGE.max}
                  step={TTS_VOLUME_RANGE.step}
                  formatValue={(value) => `${value > 0 ? '+' : ''}${value}`}
                />
                <div className="canvas-detail-krow">
                  <span className="canvas-detail-krow-key">
                    {t('emotionLabel')}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {NODE_STUDIO_VOICE_EMOTIONS.map((emotion) => (
                      <button
                        key={emotion}
                        type="button"
                        onClick={() =>
                          applyPatch({
                            voiceEmotion:
                              emotion === NODE_STUDIO_VOICE_EMOTION_IDS.none
                                ? ''
                                : emotion,
                          })
                        }
                        onKeyDownCapture={stopCanvasKeyboardEvent}
                        aria-pressed={selectedEmotion === emotion}
                        className={cn(
                          'nodrag rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                          selectedEmotion === emotion
                            ? 'border-node-foreground text-node-foreground'
                            : 'border-node-edge text-node-muted hover:text-node-foreground',
                        )}
                      >
                        {t(`emotions.${emotion}`)}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        ),

        // ⚠ 音色→角色是**边**（voice 是叶子源，只有出边），所以共用的下游反查
        // 直接成立，不需要字段反查（见 use-downstream-uses 头注对 U4 的取舍）。
        relations: (
          <RelationsStrip
            uses={uses}
            emptyLabel={tDetail('relationsEmptyVoice')}
            labelOf={(use) => use.name ?? tTypes(use.type)}
            ariaOf={(name) => tDetail('focusOnCanvas', { name })}
          />
        ),

        evidence: (
          <EvidenceDrawer label={tDetail('sampleWillSend')} count={5}>
            <EvidenceRow
              label={tDetail('fieldModel')}
              value={data.model?.providerConfig.label ?? tDetail('valueUnset')}
              dim={!data.model}
            />
            <EvidenceRow
              label={tDetail('fieldSource')}
              value={isFishSource ? t('sourceSystem') : t('sourceMine')}
            />
            <EvidenceRow
              label={t('speedLabel')}
              value={`${(data.voiceSpeed ?? TTS_SPEED_RANGE.default).toFixed(1)}×`}
            />
            <EvidenceRow
              label={t('volumeLabel')}
              value={`${data.voiceVolume ?? TTS_VOLUME_RANGE.default}`}
            />
            <EvidenceRow
              label={t('emotionLabel')}
              value={t(`emotions.${selectedEmotion}`)}
              dim={selectedEmotion === NODE_STUDIO_VOICE_EMOTION_IDS.none}
            />
          </EvidenceDrawer>
        ),

        dock: (
          <div className="canvas-detail-dock-bar">
            {/* R4：只有真正阻塞主动作的那一个发声。
                ⚠ 这里曾经直接放 `chooseVoice`（文案是「声音库」）—— 那是一个
                **按钮名**，放在原因位上读起来是「声音库」四个字孤零零挂着，
                根本不成一句话。原因位要说的是「为什么现在按不了」。 */}
            <p className="canvas-detail-dock-reason">
              {isGeneratingSample
                ? t('generateSample')
                : !hasVoice
                  ? tDetail('reasonNoVoice')
                  : tVoice('outputHint')}
            </p>
            <button
              type="button"
              className="canvas-detail-primary"
              disabled={isGeneratingSample || !data.voiceId}
              onClick={() => void handleGenerateSample()}
            >
              {t('generateSample')}
            </button>
          </div>
        ),

        overlays: (
          <>
            <FishVoiceLibraryDialog
              open={libraryOpen}
              onOpenChange={setLibraryOpen}
              selectedVoiceId={data.voiceId ?? null}
              onSelectVoiceId={handleSelectVoiceId}
              onVoiceSelectComplete={() => setLibraryOpen(false)}
            />
            <AssetSelectorDialog
              open={coverAssetDialogOpen}
              onOpenChange={setCoverAssetDialogOpen}
              title={t('coverDialogTitle')}
              description={t('coverDialogDescription')}
              mediaType="image"
              onSelect={handleSelectCoverAsset}
            />
            <AssetSelectorDialog
              open={audioAssetDialogOpen}
              onOpenChange={setAudioAssetDialogOpen}
              title={tVoice('referenceDialogTitle')}
              description={tVoice('referenceDialogDescription')}
              mediaType="audio"
              onSelect={handleSelectReferenceAsset}
            />
          </>
        ),
      })}
    </>
  )
}
