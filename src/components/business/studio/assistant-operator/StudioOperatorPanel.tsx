'use client'

/**
 * 操作员面板的**内容**（头部 / 线程 / 药丸 / 输入区）。外壳（宽度、收放、胶囊）
 * 在 `StudioOperatorDock.tsx`。
 *
 * 方向 C「工作日志」（`pages/assistant-shell.md` §11）：
 *  · 头部改**顶部进度带**（拍板 10 改口，~40px 钉住）——空闲时退化回
 *    「域 chip · 会话名 · ⋯ · 收起」，会话 / 历史 / 新对话全收进 ⋯
 *  · 对话流走**时间线沟**：左缘 1px 贯穿线 + 节点形状分级 + 会说话的两方挂头像
 *  · 连续工具步收成 **ToolGroup 一行**（结果优先、过程自动折叠）
 *  · 每轮改动后一张 **checkpoint 薄卡**（撤销二选：只回参数 / 连对话一起回）
 *  · **模型 chip 住输入框上方工具条明面**，点开是现有「自动路由」组件（拍板 11）——
 *    ⛔ 没有另行设计一个选择器：那件事 2026-08-19 出过生产事故（界面显示 GPT、
 *    实际打 Gemini），复用是唯一不会再犯的做法
 *  · 输入区双行：上行 📎 + 模型 chip + 「先问我」+ 工作态 ⏹，下行 输入框 + 发送（拍板 12）
 *  · 运行中回车 = **排队**（§3.1 ㉒，拍板 13 改口）——⛔ 「发送即插话」那条分支
 *    已删（切片 3a / §14「删掉什么」）：只有 ⏹ 才 abort
 *  · 三张「等你定」的卡钉在流末尾：计划 / 花钱硬确认 / 歧义反问单选（§4.1）
 */

import { StudioOperatorConfirmCard } from './StudioOperatorConfirmCard'
import { StudioOperatorLoraPickCard } from './StudioOperatorLoraPickCard'
import { StudioOperatorResultRow } from './StudioOperatorResultRow'
import { StudioOperatorRestoreButton } from './StudioOperatorRestoreButton'
import { isRevertibleAssistantOperatorTool } from '@/constants/assistant-operator'
import { toOperatorHistory } from '@/lib/studio-operator-history'
import type { StudioOperatorCheckpoint } from '@/types/studio-operator-checkpoint'
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  ArrowUp,
  Box,
  Images,
  Music,
  Paperclip,
  Play,
  Plus,
  RotateCw,
  Square,
  TriangleAlert,
  X,
} from '@/components/icons'
import {
  collectOperatorAnswerSources,
  groupOperatorResearch,
  summarizeOperatorResearchBlock,
  groupOperatorHistoryTools,
  isOperatorResearchTool,
  placeOperatorRoundSummaries,
  shouldStickOperatorScroll,
  splitOperatorHistoryRounds,
} from '@/lib/studio-operator-timeline'
import Image from 'next/image'
import { toast } from 'sonner'
import { useFormatter, useTranslations } from 'next-intl'

import {
  ASSISTANT_OPERATOR_APPEND_SEPARATOR,
  ASSISTANT_OPERATOR_CONFIRM_KIND_IDS,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_TOOL_IDS,
} from '@/constants/assistant-operator'
import {
  STUDIO_OPERATOR_HISTORY_OPEN_ROUNDS,
  STUDIO_OPERATOR_KEEP_OPEN_ATTR,
  STUDIO_OPERATOR_LIBRARY_PAGE_SIZE,
  STUDIO_OPERATOR_MENTION,
  STUDIO_OPERATOR_SKIPPED_REJECT_REASONS,
  STUDIO_OPERATOR_TIMELINE,
  STUDIO_OPERATOR_UPLOAD_ACCEPT,
  studioOperatorChangeSubject,
} from '@/constants/studio-assistant-operator'
import { ASSISTANT_ROUTE_MODEL_AUTO } from '@/constants/assistant-persona'
import { RuleChip } from '@/components/business/studio/assistant-operator/RuleChip'
import { StudioOperatorModelChip } from '@/components/business/studio/assistant-operator/StudioOperatorModelChip'
import {
  STUDIO_OPERATOR_PLUS_MENU_ID,
  StudioOperatorPlusMenu,
} from '@/components/business/studio/assistant-operator/StudioOperatorPlusMenu'
import {
  STUDIO_OPERATOR_REVERT_CHOICES,
  StudioOperatorCheckpointCard,
  type StudioOperatorRevertChoice,
} from '@/components/business/studio/assistant-operator/StudioOperatorCheckpointCard'
import { StudioOperatorCritiqueCard } from '@/components/business/studio/assistant-operator/StudioOperatorCritiqueCard'
import { StudioOperatorHistoryItem } from '@/components/business/studio/assistant-operator/StudioOperatorHistoryItem'
import { StudioOperatorLogItem } from '@/components/business/studio/assistant-operator/StudioOperatorLogItem'
import { ContextCardChip } from '@/components/business/studio/assistant-operator/ContextCardChip'
import {
  MentionInput,
  type MentionCandidate,
  type MentionInputHandle,
  type MentionToken,
} from '@/components/ui/mention-input'
import { AssetSelectorDialog } from '@/components/business/AssetSelectorDialog'
import {
  getReferenceMentionIndices,
  getReferenceImageAttachmentId,
  compileReferenceMentions,
} from '@/lib/studio-reference-mentions'
import {
  StudioOperatorMessageBody,
  StudioOperatorUserText,
} from '@/components/business/studio/assistant-operator/StudioOperatorMessageBody'
import {
  toOperatorAnswerSources,
  type StudioOperatorResearchSummary,
} from '@/components/business/studio/assistant-operator/StudioOperatorAnswerSources'
import {
  StudioOperatorPinnedEvidence,
  type StudioOperatorPinnedEvidenceItem,
} from '@/components/business/studio/assistant-operator/StudioOperatorPinnedEvidence'
import {
  StudioOperatorQuestionAnswers,
  StudioOperatorQuestionBlock,
  type StudioOperatorQuestionAnswerPayload,
} from '@/components/business/studio/assistant-operator/StudioOperatorQuestionBlock'
import { StudioOperatorResearchProgress } from '@/components/business/studio/assistant-operator/StudioOperatorResearchProgress'
import { StudioOperatorQueueBar } from '@/components/business/studio/assistant-operator/StudioOperatorQueueBar'
import { StudioOperatorEmptyState } from '@/components/business/studio/assistant-operator/StudioOperatorEmptyState'
import { useOpenAssistantMemory } from '@/hooks/use-open-assistant-memory'
import { StudioOperatorHeader } from '@/components/business/studio/assistant-operator/StudioOperatorHeader'
import {
  STUDIO_OPERATOR_CARD_KINDS,
  STUDIO_OPERATOR_SPEAKERS,
  StudioOperatorTimelineList,
  StudioOperatorTimelineRow,
  type StudioOperatorCardKind,
} from '@/components/business/studio/assistant-operator/StudioOperatorTimelineRow'
import {
  StudioOperatorRoundSummary,
  type StudioOperatorRoundColumns,
} from '@/components/business/studio/assistant-operator/StudioOperatorRoundSummary'
import { StudioOperatorToolGroup } from '@/components/business/studio/assistant-operator/StudioOperatorToolGroup'
import { Spinner } from '@/components/ui/spinner'
import { useStudioOperatorHost } from '@/contexts/studio-operator-host'
import type { UseAssistantOperatorResult } from '@/hooks/use-assistant-operator'
import type { UseStudioOperatorHistoryResult } from '@/hooks/use-studio-operator-history'
import type { UseStudioOperatorUploadResult } from '@/hooks/use-studio-operator-upload'
import type { UseStudioOperatorWebImportResult } from '@/hooks/use-studio-operator-web-import'
import { useStudioOperatorMention } from '@/hooks/use-studio-operator-mention'
import { toOperatorAttachment } from '@/hooks/use-studio-operator-upload'
import { useStudioOperatorStatusWord } from '@/hooks/use-studio-operator-status-word'
import { useStudioOperatorRevert } from '@/hooks/use-studio-operator-revert'
import {
  hydrateOperatorResume,
  getOperatorState,
  restoreOperatorThreadCheckpoint,
  setOperatorResumeScope,
  updateOperatorRoundSummary,
  useStudioOperatorState,
} from '@/hooks/use-studio-operator-store'
import { updateAssistantConversationRoundAPI } from '@/lib/api-client'
import {
  derivePinnedEvidence,
  isEvidencePinned,
  togglePinnedEvidence,
  type StudioOperatorPinPatch,
  type StudioOperatorPinState,
} from '@/lib/studio-operator-pinned-evidence'
import {
  failedResumeStep,
  nextResumeStepNumber,
} from '@/lib/studio-operator-resume'
import { cn } from '@/lib/utils'
import type {
  AssistantPersona,
  AssistantRouteModel,
} from '@/types/assistant-persona'
import type { GenerationRecord } from '@/types'
import type { AssistantOperatorRoundSummary } from '@/types/assistant-operator'
import type { StudioOperatorHistoryEntry } from '@/types/studio-operator-history'
import type {
  StudioOperatorAttachment,
  StudioOperatorQuestionOption,
  StudioOperatorResultItem,
  StudioOperatorStepEntry,
  StudioOperatorThreadEntry,
} from '@/types/studio-assistant-operator'

/**
 * 载回来的历史条目在沟里占哪一档（§11.3）。
 *
 * ⚠ 与实时线程用**同一张分级表**：历史里同一种条目换个形状，用户会以为那是
 * 另一种东西 —— 而它只是同一条会话的昨天。
 */
function historyCardKind(kind: StudioOperatorHistoryEntry['kind']): {
  card: StudioOperatorCardKind
  speaker: (typeof STUDIO_OPERATOR_SPEAKERS)[keyof typeof STUDIO_OPERATOR_SPEAKERS]
} {
  if (kind === 'user') {
    return {
      card: STUDIO_OPERATOR_CARD_KINDS.message,
      speaker: STUDIO_OPERATOR_SPEAKERS.user,
    }
  }
  if (kind === 'message' || kind === 'plan') {
    return {
      card: STUDIO_OPERATOR_CARD_KINDS.message,
      speaker: STUDIO_OPERATOR_SPEAKERS.assistant,
    }
  }
  if (kind === 'step') {
    return {
      card: STUDIO_OPERATOR_CARD_KINDS.evidence,
      speaker: STUDIO_OPERATOR_SPEAKERS.assistant,
    }
  }
  return {
    card: STUDIO_OPERATOR_CARD_KINDS.system,
    speaker: STUDIO_OPERATOR_SPEAKERS.assistant,
  }
}

/**
 * 缩略图选项 → 附件（@chip 管线要的那个形状）。
 *
 * ⚠ 走的是**四入口那条同一条 chip 管线**（§7）：点中即成 @chip，⛔ 没有第二条
 * 「被选中的候选」通道 —— 服务端那一侧只认 `mentionedAssets` 这一张名单。
 * ⚠ 预览与地址都用 `assetUrl`：选项在协议里只有这一个地址位。
 */
function toQuestionAsset(
  option: StudioOperatorQuestionOption | undefined,
): StudioOperatorAttachment | undefined {
  if (!option?.assetUrl) return undefined
  return {
    id: option.id,
    url: option.assetUrl,
    label: option.label,
    kind: 'image',
    thumbnailUrl: option.assetUrl,
  }
}

interface StudioOperatorPanelProps {
  /**
   * ⚠ **驱动 hook 住在外壳里，不在这里** —— 面板收起时 `AnimatePresence` 会把
   * 这颗组件卸载，而收起（拍板 7）不该把在飞的那一轮掐掉：胶囊上还写着
   * 「干活中 3/7」，它必须是真的。所以 `useAssistantOperator()` 由 dock 调用，
   * 结果当 prop 传进来。
   */
  operator: UseAssistantOperatorResult
  /**
   * ⚠ **半写完的那条消息也住在外壳里**，理由同上但更贵：收放法则（拍板 7）说
   * 「点工作台任意处就收」，而收 = 卸载这颗组件。草稿与附件放在这里的 `useState`
   * 里，用户挂好三张参考图、写了两行字，随手点一下画面就全没了 —— 而且没有任何
   * 提示。2026-08-30 真机实测到（挂上的附件 chip 在收起再展开后归零）。
   */
  draft: string
  onDraftChange(value: string): void
  attachments: readonly StudioOperatorAttachment[]
  onAttachmentsChange(next: readonly StudioOperatorAttachment[]): void
  /**
   * 上传三通道（P3-A）。**同理住在外壳里** —— 一次视频直传可能跑几分钟，
   * 而收放法则（拍板 7）随时会把这颗组件卸载掉。
   * ⚠ 必传：可选 prop 漏传 = 三绿而上传区又变回死的。
   */
  upload: UseStudioOperatorUploadResult
  /**
   * 联网候选的点选转存（P3-B）。**同理住在外壳里** —— 转存要几秒（服务端去第三方
   * 站取图 + 落 R2），而收放法则（拍板 7）随时会把这颗组件卸载掉；状态跟着没了的
   * 表现是「我明明点过那张图」。
   * ⚠ 必传：可选 prop 漏传 = 三绿而候选点了没反应。
   */
  webImport: UseStudioOperatorWebImportResult
  /**
   * 会话历史（P4-B，拍板 10）。**同理住在外壳里** —— 水化只该每次页面加载跑一
   * 次，而收放法则（拍板 7）随时会把这颗组件卸载再挂回来。
   * ⚠ 必传：可选 prop 漏传 = 三绿而会话菜单又变回空壳。
   */
  history: UseStudioOperatorHistoryResult
  /**
   * 助手设置里那份 persona（§8）—— **外壳拉一次往下传**，⛔ 面板不自己拉：
   * 它一轮里会渲染几十次，每次都开一个 `GET /api/assistant/persona` 是账单也是
   * 竞态。⚠ 缺席（还没拉到）时头像画默认预设、问候语用域名（§8.2）。
   */
  persona?: AssistantPersona
  /**
   * 文本模型 chip 选中即写 persona（§4.5）。**回调由外壳给** —— persona 全树只
   * 拉一次（`StudioOperatorDock`），面板自己 `save()` 会开出第二份 persona 状态。
   */
  onSelectRouteModel(next: AssistantRouteModel): Promise<boolean>
  /** ⋯ 菜单 →「助手设置」（§8.1 主入口）。弹层住在外壳里（收放法则会卸载面板）。 */
  onOpenAssistantSettings(): void
  /** 规则薄卡上的「查看规则」（§10）—— 打开助手设置并落到规则那一页。 */
  onOpenProjectRules(): void
  onCollapse(): void
  /** 头部那颗头像由**面板**画吗（手机档 = 是，见 `StudioOperatorHeader` 头注）。 */
  headerAvatarOwned: boolean
}

/**
 * 没有缩略图时画的那枚字形 —— 碎图标比没有图更糟。
 * 附件 chip 与 @chip 共用它（两处画法不一致就是两处各写一遍的味道）。
 */
function AttachKindGlyph({ kind }: { kind: StudioOperatorAttachment['kind'] }) {
  if (kind === 'audio') return <Music className="size-3.5" aria-hidden />
  if (kind === 'model3d') return <Box className="size-3.5" aria-hidden />
  return <Play className="size-3.5" aria-hidden />
}

export function StudioOperatorPanel({
  operator,
  draft,
  onDraftChange,
  attachments,
  onAttachmentsChange,
  upload,
  webImport,
  history,
  persona,
  onSelectRouteModel,
  onOpenAssistantSettings,
  onOpenProjectRules,
  onCollapse,
  headerAvatarOwned,
}: StudioOperatorPanelProps) {
  const t = useTranslations('StudioOperator')
  const format = useFormatter()
  const tReference = useTranslations('StudioPromptArea.referenceMention')
  const {
    entries: allEntries,
    status,
    errorText,
    history: allHistoryEntries,
    historyRounds,
    queue,
    question,
    confirm,
    resume,
  } = useStudioOperatorState()
  const entries = useMemo(
    () => allEntries.filter((entry): boolean => entry.kind !== 'domainMark'),
    [allEntries],
  )
  const historyEntries = useMemo(
    () =>
      allHistoryEntries.filter((entry): boolean => entry.kind !== 'domainMark'),
    [allHistoryEntries],
  )
  const {
    domain,
    send,
    stop,
    cancelQueued,
    newThread,
    answerQuestion,
    goBackQuestion,
    dismissQuestion,
    approvePlan,
    declinePlan,
    revisePlan,
    adjustGeneration,
    confirmGeneration,
    saveContextCard,
    dismissContextCard,
    submitLoraPicks,
    dismissLoraPick,
    cancelGeneration,
    retryGeneration,
    rerunGeneration,
    resumePlan,
  } = operator

  /**
   * **续跑记录挂到这台工作台上**（第三期）。
   *
   * ⭐ scope 取的是**域**：工作台本身是单例，一个用户在图片档只有一台。画布那边
   * 以后接进来时传的是 projectId —— 同一个 `setOperatorResumeScope` 口，⛔ 不为
   * 它另开一条路。
   * ⚠ 每次挂载都 `hydrate` 一次：面板会被收放法则（拍板 7）随时卸载，而「有未完成
   * 计划」这句话必须在**重新展开的那一帧**就成立。读盘是同步的，⛔ 不值得为它做
   * 「只读一次」的缓存。
   * ⚠ ⛔ 卸载时**不清 scope**：清了它，收一下面板就会把内存里那份镜像抹掉，而
   * 那正是 store 里 `setOperatorResumeScope(null)` 的行为。
   */
  useEffect(() => {
    setOperatorResumeScope(domain)
    hydrateOperatorResume()
  }, [domain])

  /**
   * 「有未完成计划」此刻成不成立。
   *
   * ⚠ 判据是「还有下一步」而不是「有过一份计划」：跑完的那一份由驱动 hook 清掉，
   * 但清盘失败（无痕模式）时镜像还在 —— 这一句是最后一道。
   * ⚠ **域要对得上**：图片档批的计划⛔ 不在视频档上问「要继续吗」（那六步改的
   *   全是图片表单上的旋钮）。
   */
  const { resumeStepNumber, resumeFailedReason } = useMemo(() => {
    const active = resume && resume.domain === domain ? resume : null
    return {
      resumeStepNumber: active ? nextResumeStepNumber(active) : null,
      resumeFailedReason: active ? failedResumeStep(active)?.reason : undefined,
    }
  }, [domain, resume])
  /**
   * `@` 的那条 chip 管线（§3.3 四入口）—— chips 住在 store（收放法则会卸载这颗
   * 组件），触发解析与选择器开合住在 hook 里。
   */
  const mention = useStudioOperatorMention()
  /**
   * 结果格上那两颗 ✓/✕（切片 Y）—— 乐观更新 + PATCH 在 hook 里，
   * ⛔ 面板不自己打请求（Hard Rule 3）。
   */
  const {
    undoStep,
    revertRound,
    revertRoundThread,
    countRoundChanges,
    roundChangeLabelKeys,
  } = useStudioOperatorRevert()

  // 「+」菜单开着与否**是**局部态：它是一次性的挑选动作，收起再展开时它该是关的。
  const [attachOpen, setAttachOpen] = useState(false)
  /**
   * 素材库弹层开着与否（切片 #7c）—— 同样是一次性挑选动作，局部态。
   *
   * ⭐ owner 2026-09-11：`@` 里那一段取消，改成下行一颗**显性按钮**。`@` 回到
   * 只列当前工作台（参考图 / 结果），挑库里的图走这颗按钮 + `AssetSelectorDialog`
   * （首屏 10 张、文件夹分类、往下拉继续翻）。
   */
  const [libraryOpen, setLibraryOpen] = useState(false)
  /**
   * LoRA 推荐卡上点开的那条候选（§10.3.2）—— 抽屉的**开合态**归这里，
   * 勾选态仍留在推荐卡内部（那是一次还没提交的编辑）。
   *
   * ⚠ 存的是 candidateId 而不是候选本体：帧一换，卡里认不出这个 id 就当没开，
   * ⛔ 不会留下一份过期的候选画在屏幕上。
   */
  const [loraDetailCandidateId, setLoraDetailCandidateId] = useState<
    string | null
  >(null)
  const attachTriggerRef = useRef<HTMLButtonElement>(null)
  /** 回形针那颗按钮背后的文件选择器（上传三通道的第一条）。 */
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)
  /**
   * 用户此刻**贴着底**没有 —— 决定新条目要不要把视图拽到底（2026-09-07 真机）。
   * ⚠ 初值 `true`：第一屏还没滚过，那时当然该跟着落到底。
   */
  const stickRef = useRef(true)
  const handleThreadScroll = useCallback(() => {
    const node = threadRef.current
    if (!node) return
    stickRef.current = shouldStickOperatorScroll({
      scrollTop: node.scrollTop,
      scrollHeight: node.scrollHeight,
      clientHeight: node.clientHeight,
    })
  }, [])
  // 「问助手」/「按这张继续」按完要把焦点还给输入框（§3.1 ⑲「chip 插入并聚焦」）
  // —— 不还的话用户得再点一次输入框才能接着说，而他刚刚明明就在说话。
  const inputRef = useRef<MentionInputHandle>(null)
  const [dragOver, setDragOver] = useState(false)
  /**
   * **还没落进结论记录的那几条钉住**（v2 §3.2 / §7.2，2026-09-12 实测第三组 B）。
   *
   * ⭐ 钉住的真值从此是**结论记录的 `pinnedEvidence` 一列**（走 §7.7 那条 PATCH）
   * —— 实测第 8 步：钉住条刷新一次就没了，而用户钉它正是为了「接下来别让我忘
   * 了这句」。这里剩下的只有**暂存**：一轮还没结账时库里没有那条记录可写，
   * 先留在本地，结账那一帧再合并进去（下面那条 effect）。
   * ⚠ 拿不到证据编号的那几轮（没有会话 id）**永远停在这里** —— 无号可写，
   * ⛔ 不编一个号出来。
   */
  const [localPins, setLocalPins] = useState<readonly StudioOperatorPinState[]>(
    [],
  )

  /**
   * 点面板顶部那条常驻条 → **滚回时间线里那张卡**（§3.2：常驻条只说结论，
   * 来源 / 候选 / 过程都还在卡上）。
   * ⚠ 走 `threadRef` 里的 `data-research-run` 锚点，⛔ 不用全局 `document`
   * 查询：同一屏上可能挂着两台工作台的面板（手机 Sheet + 桌面 aside 过渡期）。
   */
  const jumpToResearch = useCallback((runKey: string) => {
    const target = threadRef.current?.querySelector(
      `[data-research-run="${CSS.escape(runKey)}"]`,
    )
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [])

  /**
   * 这段会话到手的**全部结论记录** —— 载回来那几条 + 在飞那一条（§7.2）。
   * ⚠ 在飞那条排在后面：同一个 `roundIndex` 两边都可能有，后给的那份才是最新的
   * （`derivePinnedEvidence` 按号去重、留后者）。
   */
  const rounds = useMemo<readonly AssistantOperatorRoundSummary[]>(
    () => [
      ...historyRounds,
      ...entries.flatMap((entry) =>
        entry.kind === 'roundSummary' ? [entry.summary] : [],
      ),
    ],
    [entries, historyRounds],
  )

  /**
   * 证据编号 → 时间线锚点（常驻条点回原卡靠它）。
   * ⚠ 它**只从这一屏的时间线现算**，⛔ 不入库：`runKey` 是这一次页面加载现造的
   * 串，写进记录里刷新之后指不到任何东西。刷新之后那一条常驻条因此点不回卡
   * ——有意的：历史里本来就没有证据卡（`StudioOperatorHistoryStepSchema` 不留
   * 证据列表），那一句结论由记录自己带着。
   */
  const runKeyByRef = useMemo(() => {
    const map = new Map<string, string>()
    for (const entry of entries) {
      if (entry.kind !== 'step') continue
      const { step } = entry
      if (step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.done) continue
      if (step.tool !== ASSISTANT_OPERATOR_TOOL_IDS.research) continue
      for (const item of step.result?.evidence ?? []) {
        if (item.evidenceRef) map.set(item.evidenceRef, entry.runKey)
      }
    }
    return map
  }, [entries])

  /**
   * 钉住那一列的**乐观回写**（与 `saveRoundSummary` 逐字同一条判据）：先写屏幕
   * 再写库，失败用原值退回去。⛔ 不弹错误对话框 —— 钉一条结论是个小动作。
   */
  const savePinnedEvidence = useCallback(
    (patch: StudioOperatorPinPatch) => {
      const sessionId = history.currentSessionId
      const previous =
        rounds.find((round) => round.roundIndex === patch.roundIndex)
          ?.pinnedEvidence ?? []
      updateOperatorRoundSummary(patch.roundIndex, {
        pinnedEvidence: patch.pinnedEvidence,
      })
      if (!sessionId) return
      void updateAssistantConversationRoundAPI({
        id: sessionId,
        roundIndex: patch.roundIndex,
        pinnedEvidence: patch.pinnedEvidence,
      }).then((result) => {
        if (!result.success) {
          updateOperatorRoundSummary(patch.roundIndex, {
            pinnedEvidence: previous,
          })
        }
      })
    },
    [history.currentSessionId, rounds],
  )

  /** 已经落进结论记录的那几条钉住（含它在哪一轮）。 */
  const pinnedRecords = useMemo(() => derivePinnedEvidence(rounds), [rounds])

  /**
   * 面板顶部那条常驻条要画的那几条 = 暂存的 + 已落库的。
   * ⚠ 暂存那几条**已经并进记录的就不再画一遍**：并完之后它仍留在 `localPins`
   * 里（⛔ 不在 effect 里 setState），去重靠编号。
   */
  const pinnedItems = useMemo<readonly StudioOperatorPinnedEvidenceItem[]>(
    () => [
      ...localPins
        .filter((pin) => !isEvidencePinned(rounds, pin.refs))
        .map((pin) => ({
          runKey: pin.runKey,
          conclusion: pin.conclusion,
          sourceCount: pin.sourceCount,
          corroborated: pin.corroborated,
          refs: pin.refs,
        })),
      ...pinnedRecords.map((pinned) => ({
        runKey:
          (pinned.refs[0] ? runKeyByRef.get(pinned.refs[0]) : undefined) ??
          `round:${pinned.roundIndex}`,
        conclusion: pinned.conclusion,
        sourceCount: pinned.sourceCount,
        corroborated: pinned.corroborated,
        refs: pinned.refs,
      })),
    ],
    [localPins, pinnedRecords, rounds, runKeyByRef],
  )

  /** 这张卡（这几条编号）钉住了没有 —— 暂存与记录两处都算。 */
  const isPinned = useCallback(
    (runKey: string, refs: readonly string[]) =>
      localPins.some((pin) => pin.runKey === runKey) ||
      isEvidencePinned(rounds, refs),
    [localPins, rounds],
  )

  /** 一条钉住在「已经并过没有」那张表里的键。 */
  const pinKey = (refs: readonly string[]) => refs.join(' ')
  /**
   * 已经并进记录的那几条暂存 —— ⛔ 不是 state：它只防「同一条并两次」，
   * 重渲染一次不该让它复活。
   */
  const flushedPinsRef = useRef(new Set<string>())

  /**
   * 图钉那一下（§3.2）—— 有结论记录就直接写进它，没有就先暂存。
   */
  const togglePin = useCallback(
    (runKey: string, summary: StudioOperatorResearchSummary) => {
      const pin: StudioOperatorPinState = {
        runKey,
        refs: summary.evidenceRefs,
        conclusion: summary.conclusion,
        sourceCount: summary.sourceCount,
        corroborated: summary.corroborated,
      }
      if (isPinned(runKey, pin.refs)) {
        setLocalPins((current) =>
          current.filter((item) => item.runKey !== runKey),
        )
        flushedPinsRef.current.delete(pinKey(pin.refs))
        if (pin.refs.length > 0 && isEvidencePinned(rounds, pin.refs)) {
          const patch = togglePinnedEvidence(rounds, pin)
          if (patch) savePinnedEvidence(patch)
        }
        return
      }
      const patch =
        pin.refs.length > 0 ? togglePinnedEvidence(rounds, pin) : null
      if (!patch) {
        setLocalPins((current) => [...current, pin])
        return
      }
      flushedPinsRef.current.add(pinKey(pin.refs))
      savePinnedEvidence(patch)
    },
    [isPinned, rounds, savePinnedEvidence],
  )

  /** × 那一下 —— 常驻条上摘掉一条（暂存的就地删，落库的走 PATCH）。 */
  const unpinEvidence = useCallback(
    (runKey: string) => {
      const item = pinnedItems.find((entry) => entry.runKey === runKey)
      setLocalPins((current) => current.filter((pin) => pin.runKey !== runKey))
      const refs = [...(item?.refs ?? [])]
      if (refs.length === 0 || !item) return
      flushedPinsRef.current.delete(pinKey(refs))
      if (!isEvidencePinned(rounds, refs)) return
      const patch = togglePinnedEvidence(rounds, {
        refs,
        conclusion: item.conclusion,
        sourceCount: item.sourceCount,
        corroborated: item.corroborated,
      })
      if (patch) savePinnedEvidence(patch)
    },
    [pinnedItems, rounds, savePinnedEvidence],
  )

  /**
   * **结账那一帧把暂存的钉住并进记录**（§7.5 ⑤：以卡结束的轮次也结账）。
   *
   * ⚠ 一条一条地并，每并一条就把结果喂给下一条：两条暂存都按同一份 `rounds`
   * 算出来的 patch 会互相顶掉（后写的那份里没有前一条）。
   * ⚠ ⛔ 这里不 setState（`react-hooks/set-state-in-effect`）：并过的那几条留在
   * `localPins` 里由上面那层去重，effect 只负责把它写出去一次。
   */
  useEffect(() => {
    if (rounds.length === 0) return
    let working: readonly AssistantOperatorRoundSummary[] = rounds
    for (const pin of localPins) {
      if (pin.refs.length === 0) continue
      const key = pinKey(pin.refs)
      if (flushedPinsRef.current.has(key)) continue
      if (isEvidencePinned(working, pin.refs)) continue
      flushedPinsRef.current.add(key)
      const patch = togglePinnedEvidence(working, pin)
      if (!patch) continue
      working = working.map((round) =>
        round.roundIndex === patch.roundIndex
          ? { ...round, pinnedEvidence: patch.pinnedEvidence }
          : round,
      )
      savePinnedEvidence(patch)
    }
  }, [localPins, rounds, savePinnedEvidence])

  /**
   * 「最近生成」那一批（§3.3：@ 选择器最近生成在前 · §3.1 ⑱ 结果行卡）。
   *
   * ⭐ **数据源改成宿主契约的 `results`**（切片 3a）：此前这里直接
   * `useStudioGenOptional()?.activeRun`，而 `/studio/lora` 故意不挂
   * `<StudioProvider>` —— 那条路上这一段恒空，结果行卡在装配台上**结构性地**
   * 永远不可能出现。映射搬到两个宿主各自那边之后，两边就都有了。
   * ⛔ 面板从此不认识 `useStudioGen`：它挂在哪台工作台上不该由它自己去猜。
   */
  const operatorHost = useStudioOperatorHost()
  const restoreCheckpoint = useCallback(
    (checkpoint: StudioOperatorCheckpoint) => {
      if (getOperatorState().status === 'working') return
      if (!operatorHost.checkpoints?.restore(checkpoint)) {
        toast.error(t('checkpoint.restoreFailed'))
        return
      }
      const current = getOperatorState()
      stop()
      restoreOperatorThreadCheckpoint(
        [...current.history, ...toOperatorHistory(current.entries)],
        t('checkpoint.restoreStep'),
      )
      toast.success(t('checkpoint.restored'))
    },
    [operatorHost.checkpoints, stop, t],
  )

  /**
   * 「按这条建议改提示词」（第二期 · 视频域评审卡）。
   *
   * ⭐ 走的是助手 `set_prompt` **追加**那一支的同一条路：同一个分隔符
   * （`ASSISTANT_OPERATOR_APPEND_SEPARATOR`）、同一个 `SET_PROMPT` dispatch。
   * ⛔ 不用 `appendPromptFragments`：那颗按顿号去重，与协议里那个分隔符是两套
   * 口径，混用之后助手算 `inverse` 时会与表单里真的那串对不上
   * （理由与 `studio-operator-apply.ts` 里那条头注逐字同源）。
   */
  const applyCritiqueAdvice = useCallback(
    (advice: string) => {
      const current = operatorHost.apply.getState().prompt
      operatorHost.apply.dispatch({
        type: 'SET_PROMPT',
        payload: current
          ? `${current}${ASSISTANT_OPERATOR_APPEND_SEPARATOR}${advice}`
          : advice,
      })
    },
    [operatorHost],
  )

  /**
   * 结果卡上的**「用它当参考」**（v2 §6.2 第二行）。
   *
   * ⭐ 走的是 `@` chip 那条**唯一的挂载管线**（`addChip` → Dock 那条 effect →
   * `apply.addReference`）—— 与下行「素材库」按钮逐字同一条路。⛔ 面板不自己去
   * 调宿主的挂载手：两处各挂一遍就是两条会分叉的链（判据与
   * `use-studio-operator-mention.ts` 头注同源）。
   * ⚠ 挂完把焦点还给输入框：用户点这颗的下一个动作多半是接着说「照这张再来一版」。
   */
  const useResultAsReference = useCallback(
    (item: StudioOperatorResultItem) => {
      mention.addChip({
        id: item.id,
        url: item.url,
        label: item.label ?? item.id,
        kind: item.outputType === 'video' ? 'video' : 'image',
        ...(item.thumbnailUrl ? { thumbnailUrl: item.thumbnailUrl } : {}),
        ...(item.seq === undefined ? {} : { seq: item.seq }),
      })
      inputRef.current?.focus()
    },
    [mention],
  )

  const referenceImages = operatorHost.referenceImages
  const referenceTokens: MentionToken[] = referenceImages.map(
    (entry, index) => ({
      name: `Image${index + 1}`,
      kind: 'reference',
      thumbnailUrl: entry.url,
      slotLabel: `@${tReference('image', { index: index + 1 })}`,
    }),
  )
  const referenceCandidates: MentionCandidate[] = referenceTokens.flatMap(
    (token, index) =>
      referenceImages[index].disabledReason
        ? []
        : [
            {
              id: token.name,
              name: token.slotLabel!.slice(1),
              tokenName: token.name,
              thumbnailUrl: token.thumbnailUrl,
            },
          ],
  )

  for (const attachment of attachments) {
    if (attachment.kind !== 'video' && attachment.kind !== 'audio') continue
    const name = `Attachment[${encodeURIComponent(attachment.id)}]`
    referenceTokens.push({
      name,
      kind: attachment.kind === 'audio' ? 'voice' : 'video',
      thumbnailUrl: attachment.thumbnailUrl,
      slotLabel: `@${attachment.label}`,
    })
    referenceCandidates.push({
      id: name,
      name: attachment.label,
      tokenName: name,
      thumbnailUrl: attachment.thumbnailUrl,
    })
  }

  const mentionCandidates = referenceCandidates

  /**
   * 从素材库弹层挑中的那些 = **挂进工作台 + 正文里留一个 @ chip**（切片 #7c）。
   *
   * ⭐ 挂载走的是 `addChip` 那一条（图片档由 `StudioOperatorDock` 的 effect 落到
   * `apply.addReference`），⛔ 面板不自己调宿主的挂载手 —— 两处各挂一遍就是两条
   * 会分叉的链（判据与 `use-studio-operator-mention.ts` 头注同源）。
   * ⚠ 序号按**追加位**逐张往后推：一次挑三张时三个 `@` 必须各指各的那一张。
   * ⚠ 已经在工作台上的那些（按 url）跳过：宿主按 url 去重，再挂一遍等于「点了
   * 没反应」。
   */
  const pickLibraryAssets = (generations: readonly GenerationRecord[]) => {
    let slot = referenceImages.length
    for (const generation of generations) {
      if (!generation.url) continue
      if (referenceImages.some((ref) => ref.url === generation.url)) continue
      const asset = toOperatorAttachment(generation)
      mention.addChip(asset)
      if (asset.kind === 'image') {
        slot += 1
        inputRef.current?.insertToken(`Image${slot}`)
      }
    }
    inputRef.current?.focus()
  }

  const working = status === 'working'
  /**
   * ⭐ 有文件还在传时**不许发送**。
   *
   * 不拦的话：用户拖进一张图、马上打字回车 —— 消息发出去了，图没跟上，而界面
   * 上什么都没说。这正是本仓「三绿而功能失效」那一类的手感（附件字段是空的，
   * 但每一层都没报错）。宁可让发送键停两秒并写清楚在等什么。
   * ⚠ 失败的那些**不拦**：它们摆在那儿带着原因，用户看得见自己在少发什么。
   */
  const uploading = upload.uploads.some((item) => item.status === 'uploading')

  /**
   * 发送键写什么（§3.1 ㉒）—— 三档：还在传 / 运行中排队 / 直接发。
   * ⚠ 运行中那一档说的是「排队」而不是「插话」（拍板 13 改口）：按钮上写着
   * 「插话即转向」而实际是排队，正是本仓最讨厌的那种「界面说一套、代码做一套」。
   */
  const sendLabel = uploading
    ? t('attach.upload.waiting')
    : working
      ? t('sendQueue')
      : t('send')

  /**
   * 新条目进来就滚到底 —— 日志是逐条落地的，不跟着滚等于让用户一直手动拖。
   * ⚠ 载回历史也要滚（P4-B）：刷新之后停在几十条之前的开头，用户以为对话丢了。
   *
   * ⭐ **确认卡也要滚**（2026-09-07 真机）：它不是线程条目（住在 store 的
   * `confirm` 里），只盯 `entries` 的下场是卡出现在屏幕外面，而它正是此刻唯一
   * 要人动手的东西。⚠ 问题卡不在这条里 —— 它钉在输入框上方，本来就不会滚走。
   * ⚠ **用户已经手动上滚就不打扰**（`stickRef`）：他在读三轮之前那段话时被每一条
   *   新日志拽回底部，比不滚更糟。
   */
  useEffect(() => {
    const node = threadRef.current
    if (!node || !stickRef.current) return
    node.scrollTop = node.scrollHeight
  }, [entries, historyEntries, confirm?.id, confirm?.status])

  const submit = useCallback(
    (text: string) => {
      const value = text.trim()
      if (!value) return
      // 见上面 `uploading` 的注释：在飞的上传是发送的硬前提。
      if (uploading) return
      /**
       * ⭐ **问题块开着时，直接打字 = 用一句话回答当前这题**（56b 切片 4）。
       *
       * ⚠ 它替掉了 v2 §3.4 的「不答直接打字」：那一档把没答的问题留到本轮结束
       * 再折进时间线，而用户打的那句话往往**正是**答案（「8 镜，前 3 镜慢一点」）。
       * 当成一条普通发言送出去的表现是助手下一轮把同一道题再问一遍。
       * ⚠ 不想答就按 `Esc`（问题块收起，输入框回到普通发言）。
       * ⚠ ⛔ 这条路不带附件：它走的是那道题的 `otherText`，而附件留在输入区等
       *   下一句真正的发言。
       */
      const pending = getOperatorState().question
      if (pending) {
        answerQuestion(
          {
            questionId:
              pending.questions[pending.answers.length]?.id ?? pending.id,
            optionIds: [],
            otherText: value,
          },
          { label: value },
        )
        onDraftChange('')
        return
      }
      /**
       * ⭐ **@chip 与 📎 附件合成同一个数组送出去**（§7「四条走同一条 chip 管线」）：
       * 服务端一个新字段都没有，`buildMessages` 那条 `[attached: …]` 原样带上它们。
       * ⚠ 去重按 id：同一张图既被 📎 挂过又被 @ 提过时，助手会收到两份同样的地址。
       */
      const merged = attachments.filter(
        (attachment) => attachment.kind !== 'image',
      )
      for (const chip of mention.chips) {
        if (
          chip.kind !== 'image' &&
          !merged.some((item) => item.id === chip.id)
        )
          merged.push(chip)
      }
      const currentReferences = operatorHost.referenceImages
      const indices = getReferenceMentionIndices(value)
      if (
        indices.some(
          (index) =>
            !currentReferences[index] ||
            currentReferences[index].disabledReason,
        )
      ) {
        toast.info(tReference('invalid'))
        return
      }
      for (const index of indices) {
        const url = currentReferences[index].url
        const reference: StudioOperatorAttachment = {
          id: getReferenceImageAttachmentId(url),
          url,
          thumbnailUrl: url,
          kind: 'image',
          label: `reference image ${index + 1}`,
        }
        if (!merged.some((item) => item.url === url)) merged.push(reference)
      }
      let missingAttachment = false
      const compiled = compileReferenceMentions(value).replace(
        /@Attachment\[([^\]]+)\]/g,
        (token, encodedId: string) => {
          const attachment = merged.find(
            (item) => encodeURIComponent(item.id) === encodedId,
          )
          if (!attachment) {
            missingAttachment = true
            return token
          }
          return `@${attachment.label}`
        },
      )
      if (missingAttachment) {
        toast.info(tReference('invalid'))
        return
      }
      send(compiled, merged)
      onDraftChange('')
      onAttachmentsChange(attachments.filter((item) => item.kind === 'image'))
      mention.clearChips()
      mention.closePicker()
      setAttachOpen(false)
    },
    [
      answerQuestion,
      attachments,
      mention,
      onAttachmentsChange,
      onDraftChange,
      operatorHost,
      send,
      uploading,
      tReference,
    ],
  )

  /**
   * 三个手势一条通道（拍板 16）：选文件 / 拖进来 / 粘贴，全落到这里。
   * 挑完就把 📎 面板收掉 —— 与素材库「点即挂」同一个手势节奏，接手的是
   * 输入框上方那排 chip。
   */
  const handleUploadFiles = useCallback(
    (files: readonly File[]) => {
      upload.uploadFiles(files)
      setAttachOpen(false)
    },
    [upload],
  )

  /**
   * 这条线程一个字都还没有（§4.2 的判据）—— 首次打开或刚开一条新会话。
   *
   * ⚠ 载回来的只读历史也要数：翻开一条旧会话时线程里明明有内容，画空态就是在
   * 说「我不记得我们聊过」。
   */
  const threadEmpty = entries.length === 0 && historyEntries.length === 0

  /**
   * checkpoint 二选的落点（§3.2）。
   *
   * ⭐ 两条路共用同一份 `inverse`，⛔ 没有第二套撤销：区别只在「连对话一起回」
   * 多截一刀线程。
   */
  const handleCheckpointRevert = useCallback(
    (runKey: string, choice: StudioOperatorRevertChoice) => {
      if (choice === STUDIO_OPERATOR_REVERT_CHOICES.thread) {
        revertRoundThread(runKey)
        return
      }
      revertRound(runKey)
    },
    [revertRound, revertRoundThread],
  )

  /**
   * 进度带的清单（§2.4）—— **从线程现算**，⛔ store 里不另存一份。
   *
   * ⚠ 数的是**这一轮**（最后一个 runKey）的步：把历史上所有轮的步都列进去，
   * 「还剩几步」就变成了「这条会话一共跑过几步」，而那不是耐心的来源。
   */
  const latestRunKey = useMemo(() => {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index]
      if (entry?.kind === 'step') return entry.runKey
    }
    return null
  }, [entries])

  /**
   * 「修改」（§3.1 ⑤）—— 预填「修改计划：」并聚焦，⛔ **不发请求**：下一条消息
   * 才带 `planApproved: false`（hook 那一侧记着）。
   *
   * ⚠ 计划卡与反问卡**共用这一颗**：两张卡的「修改」是同一件事，各写一遍的下场
   * 是其中一张哪天忘了聚焦，而没有人会注意到。
   */
  const revisePrompt = useCallback(() => {
    revisePlan()
    if (!draft.trim()) onDraftChange(t('plan.revisePrefill'))
    inputRef.current?.focus()
  }, [draft, onDraftChange, revisePlan, t])

  /**
   * 「换个词再搜」（lora-assistant §10.3.1）—— 预填「换个词再搜：」并聚焦，
   * ⛔ **不发请求**。
   *
   * ⚠ 判据与上面那颗逐字同源：新词只有用户说得出，替他发一句「再搜一次」只会
   * 让模型拿同一串词再跑一轮。⛔ 不调 `revisePlan()`：这张卡上没有计划要改。
   */
  const searchLoraAgainPrompt = useCallback(() => {
    if (!draft.trim()) onDraftChange(t('confirm.loraPick.searchAgainPrefill'))
    inputRef.current?.focus()
  }, [draft, onDraftChange, t])

  /**
   * 「已确认 · 11:24」里那个时刻 —— ⚠ 词表在这一层，卡只收一个 `formatTime`。
   */
  const formatDecidedAt = useCallback(
    (iso: string) =>
      format.dateTime(new Date(iso), { hour: '2-digit', minute: '2-digit' }),
    [format],
  )

  /**
   * **加载态那一句状态词**（v2 §3.6）—— 头像旁一行小字，不转圈、不用骨架屏。
   *
   * ⚠ 算法住在 `use-studio-operator-status-word.ts`：收起态那张微状态卡（§4.3）
   * 要读的是**同一句话**，两边各算一遍必然会漂（见那份 hook 的头注）。
   */
  const statusWord = useStudioOperatorStatusWord()

  /**
   * 把线程劈成「渲染块」—— **连续的工具步合成一组**（§2.7）。
   *
   * ⚠ 看图那一条不进组：它渲染成评价卡（拍板 6），是大节点不是过程行 —— 混进
   * ToolGroup 会被折叠掉，而「证据长在结论里」正是它存在的理由。
   * ⚠ 组的边界是 `runKey` 也是「连不连续」：跨轮的两组步长得一样，但它们是两次
   * 不同的委托，合成一行会让 checkpoint 的「这一轮」失去参照。
   */
  /**
   * 结论记录**就地改完之后的回写**（v2 §7.7，commit #13）。
   *
   * ⭐ 先写屏幕再写库（乐观）：那一次往返的空窗里用户会以为自己没点上 ——
   * 与 `reviewStates` 那一格同一条判据。失败时用**原值**再调一次退回去，
   * ⛔ 不弹错误对话框：改一条结论是个小动作。
   * ⚠ 还没落过库的线程（`currentSessionId === null`）只改屏幕：库里根本没有那
   * 一行可写，而下一次 upsert 之后这条记录是**服务端**结账时写进去的那一份 ——
   * ⛔ 别在这里替它新建一行。
   */
  const saveRoundSummary = useCallback(
    (
      summary: AssistantOperatorRoundSummary,
      columns: StudioOperatorRoundColumns,
    ) => {
      const sessionId = history.currentSessionId
      const previous = {
        facts: summary.facts,
        decisions: summary.decisions,
        todos: summary.todos,
        editedByUser: summary.editedByUser,
      }
      updateOperatorRoundSummary(summary.roundIndex, columns)
      if (!sessionId) return
      void updateAssistantConversationRoundAPI({
        id: sessionId,
        roundIndex: summary.roundIndex,
        ...columns,
      }).then((result) => {
        if (!result.success) {
          updateOperatorRoundSummary(summary.roundIndex, previous)
        }
      })
    },
    [history.currentSessionId],
  )

  /**
   * 续跑 chip 挂在**最新那一块结论记录的尾部**（§3.6）。
   *
   * ⚠ 「最新」优先取在飞线程里的那一条；线程是空的（刷新之后）就取载回来的
   * 最后一条 —— 续跑按钮本来就是为「刷新之后」存在的，只认在飞那一条等于它在
   * 最需要的时刻不见了。
   * ⚠ 两边都没有结论记录时**回落到头部**（`StudioOperatorHeader` 那颗）：
   * §3.6 只说了它的去处，没说「没有去处时就不要这个入口」——
   * 而一条从没结过账的会话照样可能断在第四步。
   */
  const resumeHost = useMemo(() => {
    if (resumeStepNumber === null) return null
    const live = [...entries]
      .reverse()
      .find((entry) => entry.kind === 'roundSummary')
    if (live && live.kind === 'roundSummary') {
      return { scope: 'live' as const, roundIndex: live.summary.roundIndex }
    }
    const last = historyRounds.at(-1)
    if (last) {
      return { scope: 'history' as const, roundIndex: last.roundIndex }
    }
    return null
  }, [entries, historyRounds, resumeStepNumber])

  /** 回执那一行的去处（56a）—— `/settings/assistant`，带 `?from=` 当前路径。 */
  const openAssistantMemory = useOpenAssistantMemory()

  const roundResume =
    resumeStepNumber === null
      ? null
      : {
          stepNumber: resumeStepNumber,
          ...(resumeFailedReason ? { failedReason: resumeFailedReason } : {}),
          onResume: resumePlan,
        }

  /** 载回来的结论记录挂在历史的哪几条后面（见 `placeOperatorRoundSummaries`）。 */
  const historyRoundPlacement = useMemo(
    () =>
      placeOperatorRoundSummaries(
        historyEntries.map((entry) => entry.kind),
        historyRounds.length,
      ),
    [historyEntries, historyRounds.length],
  )

  const renderHistoryRound = (summaryIndex: number) => {
    const summary = historyRounds[summaryIndex]
    if (!summary) return null
    return (
      <StudioOperatorRoundSummary
        key={`hr:${summary.roundIndex}`}
        summary={summary}
        defaultCollapsed
        onSave={(columns) => saveRoundSummary(summary, columns)}
        onOpenMemory={openAssistantMemory}
        {...(roundResume &&
        resumeHost?.scope === 'history' &&
        resumeHost.roundIndex === summary.roundIndex
          ? { resume: roundResume }
          : {})}
      />
    )
  }

  /**
   * **哪一段回答底下摆哪几条资料**（56b 切片 1）—— 判据是位置，见
   * `collectOperatorAnswerSources` 的头注。
   */
  const answerSources = useMemo(
    () => collectOperatorAnswerSources(entries),
    [entries],
  )

  const blocks = useMemo(() => {
    type Block =
      | { kind: 'entry'; entry: StudioOperatorThreadEntry }
      | { kind: 'tools'; runKey: string; steps: StudioOperatorStepEntry[] }
    const result: Block[] = []
    let group: {
      kind: 'tools'
      runKey: string
      steps: StudioOperatorStepEntry[]
    } | null = null

    const isCritiqueCard = (entry: StudioOperatorStepEntry) =>
      entry.step.tool === ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult &&
      entry.step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done &&
      Boolean(entry.step.result)

    for (const entry of entries) {
      if (entry.kind === 'step' && !isCritiqueCard(entry)) {
        if (group && group.runKey === entry.runKey) {
          group.steps.push(entry)
        } else {
          group = { kind: 'tools', runKey: entry.runKey, steps: [entry] }
          result.push(group)
        }
        continue
      }
      group = null
      result.push({ kind: 'entry', entry })
    }
    return result
  }, [entries])

  /**
   * 每一轮的**最后一个工具块**是哪一个（按块首条目 id 认，2026-09-07 真机）。
   *
   * ⚠ checkpoint 薄卡按它挂 —— 一轮被劈成两个工具块时，两块的 `runKey` 一样、
   * `countRoundChanges` 也一样，各画一张就是两条重复的「已改 N 项」。
   */
  const lastToolsBlockKeys = useMemo(() => {
    const map = new Map<string, string>()
    for (const block of blocks) {
      if (block.kind !== 'tools') continue
      const first = block.steps[0]
      if (first) map.set(block.runKey, first.id)
    }
    return map
  }, [blocks])

  /**
   * 载回来的历史按**轮**切开，只摊开最近几轮（第 5 件）。
   *
   * ⚠ 切点取的是「最近 N 轮里第一条的下标」：更早的那些整块折进一颗
   * `<details>`。⛔ 不按条数切 —— 从一轮中间切一刀，摊开的那半截会以一句
   * 没头没尾的助手回复开头。
   */
  const historyCutoff = useMemo(() => {
    const rounds = splitOperatorHistoryRounds(
      historyEntries.map((entry) => entry.kind),
    )
    if (rounds.length <= STUDIO_OPERATOR_HISTORY_OPEN_ROUNDS) return 0
    return (
      rounds[rounds.length - STUDIO_OPERATOR_HISTORY_OPEN_ROUNDS]?.indexes[0] ??
      0
    )
  }, [historyEntries])

  const historySessionDate = useMemo(() => {
    const session = history.sessions.find(
      (item) => item.id === history.currentSessionId,
    )
    return session ? format.dateTime(new Date(session.updatedAt)) : null
  }, [format, history.currentSessionId, history.sessions])

  const historyGroups = groupOperatorHistoryTools(historyEntries)
  const liveGroups = groupOperatorResearch(
    blocks.map((block) =>
      block.kind === 'tools' &&
      block.steps.every(
        ({ step }) =>
          step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.error &&
          isOperatorResearchTool(step.tool),
      )
        ? 'research'
        : block.kind === 'entry' && block.entry.kind === 'message'
          ? 'message'
          : 'result',
    ),
  )
  const renderGroups = (
    groups: ReturnType<typeof groupOperatorResearch>,
    renderItem: (index: number) => ReactNode,
  ) =>
    groups.map((group) =>
      group.research ? (
        <details
          key={group.indexes[0]}
          data-testid="operator-research"
          className="mt-2"
        >
          <summary className="ml-8 cursor-pointer py-1 text-2sm text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
            {t('researchDetails')}
          </summary>
          {group.indexes.map(renderItem)}
        </details>
      ) : (
        renderItem(group.indexes[0]!)
      ),
    )
  const renderBlock = (block: (typeof blocks)[number]) => {
    if (block.kind === 'tools') {
      /**
       * ⚠ **跳过不算失败**（2026-09-12 实测第 7 步）：同轮重复的那一步被去重
       * （`repeatedStep`）时日志写的是「刚才做过了，跳过」，而它此前被计进
       * 「N 失败」—— 一轮全做成了的操作顶着一笔红字。名单见
       * `STUDIO_OPERATOR_SKIPPED_REJECT_REASONS`。
       */
      const rejected = block.steps.filter(
        (item) => item.step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
      )
      const skipped = rejected.filter(
        (item) =>
          item.step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.error &&
          STUDIO_OPERATOR_SKIPPED_REJECT_REASONS.includes(
            item.step.error.reason,
          ),
      ).length
      const failed = rejected.length - skipped
      const roundSteps = entries.flatMap((entry) =>
        entry.kind === 'step' && entry.runKey === block.runKey ? [entry] : [],
      )
      const blocker = roundSteps.findLast(
        (item, index) =>
          item.step.status === 'error' &&
          !STUDIO_OPERATOR_SKIPPED_REJECT_REASONS.includes(
            item.step.error.reason,
          ) &&
          !roundSteps
            .slice(index + 1)
            .some(
              (later) =>
                later.step.tool === item.step.tool &&
                later.step.status === 'done',
            ),
      )?.step
      const running = block.steps.some(
        (item) =>
          item.step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.running,
      )
      /* checkpoint 只在**这一轮真的收尾了**之后出现（§2.13）：还在跑就
                 挂一张「已改 3 项」，用户会以为它已经改完了。 */
      /**
       * ⚠ checkpoint 只挂在这一轮**最后一个**工具块上（2026-09-07 真机）：一轮里
       * 「几步 → 说一句 → 又几步」会被劈成两个 `tools` 块（`blocks` 遇到非 step
       * 条目就断组），而 `countRoundChanges` 数的是**整轮**——两个块各画一张，
       * 用户读到的是两条一模一样的「已改 2 项：提示词」。
       */
      const lastToolsBlock = lastToolsBlockKeys.get(block.runKey)
      const roundDone = !working || block.runKey !== latestRunKey
      const changeCountInRound = countRoundChanges(block.runKey)
      /**
       * ⚠ 薄卡的后半句读**这一条**而不是 `roundFields`（2026-09-12 实测第 9 步）：
       * 记规则那一步进得了「N 项」的数（它可撤），却进不了登记簿（表单没动），
       * 于是薄卡上写着「已改 1 项：」——冒号后面空着。见
       * `roundChangeLabelKeys` 的头注。
       */
      const changeLabelKeys = roundChangeLabelKeys(block.runKey)
      /**
       * 这一组是不是一次调查 —— `null` 就退回 `ToolGroup`（56b 切片 2）。
       */
      const researchSummary = summarizeOperatorResearchBlock(block.steps)
      const logItems = block.steps.map((item) => (
        <div key={item.id}>
          <StudioOperatorLogItem
            entryId={item.id}
            step={item.step}
            undone={item.undone}
            onUndo={undoStep}
            // ⚠ 按条取，不是把整个 hook 传下去：日志条是 `memo` 的，
            //    传一个每次 render 都换引用的对象等于把 memo 关掉。
            webImport={webImport.states[item.id]}
            webImportLimit={webImport.limit}
            onToggleWebImage={webImport.toggleCandidate}
            /* ⚠ 候选网格由日志条自己画（56b 切片 1 起没有第二处画它的地方：
               调查卡已经退场）。 */
            renderWebCandidates
          />
          {/* ⚠ 后果落在**库里**的那几步（记规则 / 标审核态 / 素材库四条）
                ⛔ 不挂「还原到这一步」：还原读的是工作台快照，而它们一颗旋钮都
                没动 —— 快照因此从来就没被拍过，用户读到的是一句
                「此步骤未保存完整配置，无法恢复」挂在一步明明成功了的操作下面
                （2026-09-12 实测第 9 步）。它们的回头路是那颗撤销钮（走
                `step.inverse`，记规则那条会真的把库里那行删掉）。 */}
          {operatorHost.checkpoints &&
          item.step.status === 'done' &&
          !studioOperatorChangeSubject(item.step.tool) &&
          (isRevertibleAssistantOperatorTool(item.step.tool) ||
            item.checkpoint) ? (
            <StudioOperatorRestoreButton
              checkpoint={item.checkpoint}
              disabled={working}
              onRestore={restoreCheckpoint}
            />
          ) : null}
        </div>
      ))
      return (
        <div
          key={`tools:${block.runKey}:${block.steps[0]?.id}`}
          /* 面板顶部那条钉住常驻条点回来的锚点（`jumpToResearch`）。 */
          data-research-run={block.runKey}
        >
          <StudioOperatorTimelineRow card={STUDIO_OPERATOR_CARD_KINDS.evidence}>
            {
              /**
               * ⭐ **调查卡退场**（56b 切片 1）：这一轮查到的结论与证据现在长在
               * **回答底下**（来源卡 + 媒体条，`StudioOperatorMessageBody`），过程
               * 留在这一折里。⛔ 别把那张卡找回来 —— 它把证据摆在回答**前面**，
               * 读起来是「先看完它的过程，再看它说了什么」。
               * ⭐ **查过东西的那一组换成调查行**（56b 切片 2）：跑着是一行微光，
               * 跑完收成灰底一行「搜了 N 条 · 读了 M 页」，点它才展开步骤。
               * ⚠ 有失败步时**退回 ToolGroup**：那一行上没有失败的位置，而失败
               * 恰恰是那一刻唯一要读的东西。
               */
              researchSummary && failed === 0 ? (
                <StudioOperatorResearchProgress
                  depth={researchSummary.depth}
                  running={running}
                  found={researchSummary.found}
                  readPages={researchSummary.readPages}
                >
                  {logItems}
                </StudioOperatorResearchProgress>
              ) : (
                <StudioOperatorToolGroup
                  total={block.steps.length}
                  failed={failed}
                  skipped={skipped}
                  running={running}
                  runningTitle={
                    block.steps.findLast(
                      (item) => item.step.status === 'running',
                    )?.step.title
                  }
                  failure={
                    lastToolsBlock === block.steps[0]?.id &&
                    blocker?.status === 'error' ? (
                      <>
                        <p className="font-medium">
                          {blocker.tool ===
                          ASSISTANT_OPERATOR_TOOL_IDS.setPrompt
                            ? t('toolGroup.promptUnchanged')
                            : t('toolGroup.blocked')}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {blocker.error.reason === 'promptConflict' &&
                          blocker.error.detail
                            ? blocker.error.detail
                            : t(`reject.${blocker.error.reason}`)}
                        </p>
                        <p className="mt-1 text-muted-foreground">
                          {t('toolGroup.inspectFailure')}
                        </p>
                      </>
                    ) : null
                  }
                >
                  {logItems}
                </StudioOperatorToolGroup>
              )
            }
          </StudioOperatorTimelineRow>
          {roundDone &&
          changeCountInRound > 0 &&
          lastToolsBlock === block.steps[0]?.id ? (
            <StudioOperatorTimelineRow card={STUDIO_OPERATOR_CARD_KINDS.system}>
              <StudioOperatorCheckpointCard
                runKey={block.runKey}
                count={changeCountInRound}
                fieldSummary={changeLabelKeys.map((key) => t(key)).join(' · ')}
                onRevert={handleCheckpointRevert}
                {...(resumeStepNumber !== null && block.runKey === latestRunKey
                  ? {
                      resume: {
                        stepNumber: resumeStepNumber,
                        ...(resumeFailedReason
                          ? { failedReason: resumeFailedReason }
                          : {}),
                        onResume: resumePlan,
                      },
                    }
                  : {})}
              />
            </StudioOperatorTimelineRow>
          ) : null}
        </div>
      )
    }

    const entry = block.entry
    switch (entry.kind) {
      case 'user':
        return (
          <StudioOperatorTimelineRow
            key={entry.id}
            card={STUDIO_OPERATOR_CARD_KINDS.message}
            speaker={STUDIO_OPERATOR_SPEAKERS.user}
          >
            <StudioOperatorUserText
              text={entry.text}
              attachments={entry.attachments}
            />
            {entry.attachments.some(
              (attachment) => attachment.kind !== 'image',
            ) ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {entry.attachments
                  .filter((attachment) => attachment.kind !== 'image')
                  .map((attachment) => (
                    <span
                      key={attachment.id}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-2sm text-primary"
                    >
                      {attachment.thumbnailUrl && (
                        <Image
                          src={attachment.thumbnailUrl || attachment.url}
                          alt={attachment.label}
                          width={48}
                          height={48}
                          unoptimized
                          className="size-12 shrink-0 rounded object-cover"
                        />
                      )}
                      <span className="min-w-0 break-words">
                        {attachment.label}
                      </span>
                    </span>
                  ))}
              </div>
            ) : null}
          </StudioOperatorTimelineRow>
        )
      /**
       * 助手正文 —— **整段一次到齐**的那一条（v2 §13.1 / 拍板 13）。
       *
       * ⚠ `streaming` 为真且还没有字 = **发送即回显**的占位行：头像已经在了，
       *   正文位画三点脉冲，高度就是一行正文高，第一个字到达时不跳。
       */
      case 'message': {
        /**
         * ⭐ **资料长在回答底下**（56b 切片 1）：这一段话之前查到的证据在这里
         * 变成句尾角标 + 媒体条 + 一排来源卡。⛔ 不再有那张摆在回答前面的调查卡。
         */
        const attached = answerSources.get(entry.id)
        const researchSteps = (attached?.steps ?? []).flatMap((index) => {
          const item = entries[index]
          return item && item.kind === 'step' ? [item] : []
        })
        const answer =
          researchSteps.length > 0
            ? toOperatorAnswerSources(researchSteps)
            : null
        const runKey = attached?.runKey ?? ''
        return (
          <StudioOperatorTimelineRow
            key={entry.id}
            card={STUDIO_OPERATOR_CARD_KINDS.message}
            {...(persona ? { persona } : {})}
          >
            {/* ⚠ 空正文那一行画的是**状态词**而不是三点脉冲（§3.6）：脉冲说的是
                「它还在」，状态词说的是「它在干什么」—— 后者才是耐心的来源。
                ⛔ 有字之后不再传：正文一到，那句状态词就该让位。 */}
            <StudioOperatorMessageBody
              entry={entry}
              {...(statusWord ? { statusText: statusWord } : {})}
              {...(answer
                ? {
                    sources: answer.sources,
                    pinned: isPinned(runKey, answer.summary.evidenceRefs),
                    onTogglePin: () => togglePin(runKey, answer.summary),
                    /* 「深入调查」= 再跑一轮并加源（§9.1 ③）。⚠ 走的是**普通
                       一轮**（发一句话），⛔ 不另开一条绕过工具环的检索路径。 */
                    onDeepResearch: () => submit(t('research.expandPrompt')),
                  }
                : {})}
            />
          </StudioOperatorTimelineRow>
        )
      }
      case 'plan':
        return (
          <StudioOperatorTimelineRow
            key={entry.id}
            card={STUDIO_OPERATOR_CARD_KINDS.message}
            {...(persona ? { persona } : {})}
          >
            {/* ⭐ 不出卡的那一轮，计划**折成一行**（2026-09-06 面板轮，第 2 件）。
                由来：同一份阶段此前会出现两遍 —— 这一条清单卡 + 钉在末尾那张待
                确认卡，读起来是「它规划了两遍」。出卡时这一条根本不落（hook 那一
                侧判的），落下来的都是「没什么可确认、直接开干」的那一轮：那时用户
                要的只是一行「它打算做 N 步」，⛔ 不是一张摊开的卡。 */}
            <details data-testid="operator-plan" className="min-w-0">
              <summary className="cursor-pointer list-none py-0.5 text-2sm text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                {t('planFold', { count: entry.steps.length })}
              </summary>
              <ol className="mt-1 flex flex-col gap-1 border-l border-border pl-2.5">
                {entry.steps.map((step, index) => (
                  <li
                    key={step}
                    className="flex items-baseline gap-2 text-md text-foreground"
                  >
                    <span className="shrink-0 font-mono text-xs tracking-nav tabular-nums text-muted-foreground">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0">{step}</span>
                  </li>
                ))}
              </ol>
            </details>
          </StudioOperatorTimelineRow>
        )
      case 'step': {
        /**
         * ⭐ 看图那一条渲染成**评价卡**而不是日志条（拍板 6）：证据要长在
         * 结论里，而日志条画不下一张图 + 四条结论。这里能走到的只有
         * 「跑完且有结果」那一支 —— 其余在分组时就并进 ToolGroup 了。
         */
        const { step } = entry
        if (
          step.tool !== ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult ||
          step.status !== ASSISTANT_OPERATOR_STEP_STATUS_IDS.done ||
          !step.result
        ) {
          return null
        }
        return (
          <StudioOperatorTimelineRow
            key={entry.id}
            card={STUDIO_OPERATOR_CARD_KINDS.message}
            {...(persona ? { persona } : {})}
          >
            <StudioOperatorCritiqueCard
              step={{ ...step, result: step.result }}
              runKey={entry.runKey}
              roundChangeCount={countRoundChanges(entry.runKey)}
              onRevertRound={revertRound}
              onApplyAdvice={applyCritiqueAdvice}
            />
          </StudioOperatorTimelineRow>
        )
      }
      /**
       * **结果卡**（v2 §6，commit #10）—— 生成中 / 单张 / 多张三态一颗组件。
       *
       * ⚠ 它走**结果**那一档沟位（`big` 实心节点）而不是助手消息：这一条不是
       * 谁说的话，是「这一批出来了」。
       */
      case 'result':
        return (
          <StudioOperatorTimelineRow
            key={entry.id}
            card={STUDIO_OPERATOR_CARD_KINDS.result}
          >
            <StudioOperatorResultRow
              entry={entry}
              onRerun={(target) =>
                target.request && rerunGeneration(target.request)
              }
              onUseAsReference={useResultAsReference}
            />
          </StudioOperatorTimelineRow>
        )
      case 'system':
        return (
          <StudioOperatorTimelineRow
            key={entry.id}
            card={STUDIO_OPERATOR_CARD_KINDS.system}
          >
            <p
              data-testid="operator-system-line"
              className="text-2sm leading-relaxed text-muted-foreground"
            >
              {/* ⚠ 两种 subject：`revertField` 存的是**字段 id**（要过词表
                          才是人话），`undoStep` 存的是模型写的那行标题（本来就是
                          人话，翻译它等于把它弄丢）。 */}
              {/* ⚠ 第三种 subject：`videoFramesFailed` 存的是抽帧失败的**原因码**
                          （六条修法各不相同，见常量头注），人话在这里过词表。 */}
              {t(`system.${entry.code}`, {
                subject:
                  entry.code === 'revertField' && entry.subject
                    ? t(`field.${entry.subject}`)
                    : entry.code === 'videoFramesFailed' && entry.subject
                      ? t(`videoFrameCaptureReason.${entry.subject}`)
                      : (entry.subject ?? ''),
                count: entry.count ?? 0,
              })}
            </p>
          </StudioOperatorTimelineRow>
        )
      /**
       * 规则薄卡（§2.21 / §10，拍板 23）—— **系统行档**，⛔ 不用状态色：
       * 规则不是成功也不是警告。
       */
      case 'rule':
        return (
          <StudioOperatorTimelineRow
            key={entry.id}
            card={STUDIO_OPERATOR_CARD_KINDS.system}
          >
            <RuleChip
              ruleId={entry.ruleId}
              text={entry.text}
              source={entry.source}
              createdAt={entry.createdAt}
              onView={onOpenProjectRules}
            />
          </StudioOperatorTimelineRow>
        )
      /**
       * **本轮结论记录**（v2 §7.7，commit #13）——「这一轮到此为止」的分隔块。
       *
       * ⚠ **不套 `StudioOperatorTimelineRow`**：它是全宽分节符（画板 Main），
       * 而那一颗会把内容推进 24px 的沟里并配一个节点形状 —— 缩进之后它读起来
       * 就成了「时间线上的又一条发言」，而它恰恰是用来把发言分段的。
       * ⛔ 这不是给五类卡开的第六档（`STUDIO_OPERATOR_CARD_KINDS` 一个字没改）。
       */
      case 'roundSummary':
        return (
          <StudioOperatorRoundSummary
            key={entry.id}
            summary={entry.summary}
            onSave={(columns) => saveRoundSummary(entry.summary, columns)}
            onOpenMemory={openAssistantMemory}
            {...(roundResume &&
            resumeHost?.scope === 'live' &&
            resumeHost.roundIndex === entry.summary.roundIndex
              ? { resume: roundResume }
              : {})}
          />
        )
      case 'domainMark':
        return null
    }
  }

  return (
    <>
      {/* ── 头部（v2 §4.1）—— 进度带整条删掉（决策 14），进度由状态词说（§3.6）。 */}
      <StudioOperatorHeader
        domain={domain}
        working={working}
        history={history}
        onNewThread={newThread}
        onOpenAssistantSettings={onOpenAssistantSettings}
        onCollapse={onCollapse}
        avatarOwned={headerAvatarOwned}
        face={operatorHost.face}
        {...(persona ? { persona } : {})}
        /* ⚠ 续跑 chip 的正位是**结论记录块的尾部**（§3.6）——头部这一颗只在
           一条结论记录都没有时出现（见 `resumeHost` 的头注）。 */
        {...(resumeStepNumber === null || resumeHost !== null
          ? {}
          : {
              resume: { stepNumber: resumeStepNumber, onResume: resumePlan },
            })}
      />

      {/* ── 钉住的证据常驻条（§3.2）——钉住之后在面板顶部留一份，可点回卡。
          ⚠ 排在头部之下、时间线之上：它是「这一整轮都别忘了这句」，
            不是一条时间线上的发言。⛔ 一条都没钉住时整条不渲染。 */}
      <StudioOperatorPinnedEvidence
        items={pinnedItems}
        onJump={jumpToResearch}
        onUnpin={unpinEvidence}
      />

      {history.loadingSessionId ? (
        <div
          role="status"
          className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground"
        >
          <Spinner size="sm" />
          {t('history.switching')}
        </div>
      ) : null}
      {history.error ? (
        <p role="alert" className="px-3 py-2 text-sm text-destructive">
          {history.error}
        </p>
      ) : null}
      <div
        className="flex min-h-0 flex-1 flex-col"
        inert={Boolean(history.loadingSessionId)}
        aria-busy={Boolean(history.loadingSessionId)}
        style={{ opacity: history.loadingSessionId ? 0.45 : 1 }}
      >
        {/* ── 时间线沟（§11.3）──────────────────────────────────────
          ⚠ 滚的是外面这一层，贯穿竖线画在里面那一层：线要跟着内容一起滚，
            画在滚动容器上会得到一条钉在视口里、内容从它旁边流过去的假线。 */}
        <StudioOperatorTimelineList
          ref={threadRef}
          data-testid="operator-thread"
          onScroll={handleThreadScroll}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <div className="relative px-3.5 pb-5 pt-3.5">
            {/* 贯穿的 1px border 色线 —— 节点与头像都压在它上面（同轴）。
                ⚠ 空态**不画这条线**（§4.2 / 画板 BEmpty）：一条从头贯到底、
                  上面一个节点都没有的竖线看起来像渲染坏了。 */}
            {threadEmpty ? null : (
              <span
                aria-hidden
                data-testid="operator-timeline-line"
                style={{ left: `${STUDIO_OPERATOR_TIMELINE.linePx}px` }}
                className="pointer-events-none absolute bottom-2 top-4 w-px bg-border"
              />
            )}

            {/* ── 空态（§4.2）—— ⛔ 不再是一行灰字：头像 + 自我介绍 + 三颗起手势。 */}
            {threadEmpty ? (
              <StudioOperatorEmptyState
                face={operatorHost.face}
                onSuggestion={submit}
                {...(persona ? { persona } : {})}
              />
            ) : null}

            {/* ── 载回来的只读历史（P4-B）───────────────────────────────
              ⚠ 条目 id 是**本次页面加载现编的序号**（`user-3`），刷新之后从头再编
                一遍，所以它会在两条轴上撞车：
                ① 历史 ↔ 新线程 —— `h:` 前缀挡住这一条；
                ② 历史 ↔ 历史 —— **一条跨了几次页面加载的线程，存下来的那个数组里
                   本身就有两个 `user-1`**（保存时是「旧历史 + 本次 entries」拼接，
                   而本次 entries 的序号从 1 重新开始）。2026-08-31 P4-C 真机撞到，
                   后果是 React 把两条不同的历史当成同一个节点复用。
              ⭐ 所以 key 里带上**位置**：历史是只读、只追加、按顺序渲染的数组，
                位置在这里是稳定的身份。
              ⚠ 历史行**不画时间戳**：库里那份没有逐条时刻，拿「现在」去填是编数据。 */}
            {(() => {
              const renderHistoryEntry = (
                index: number,
                includeSummary = true,
              ) => {
                const entry = historyEntries[index]!
                const row = (
                  <StudioOperatorTimelineRow
                    key={`h:${index}:${entry.id}`}
                    {...historyCardKind(entry.kind)}
                    {...(persona ? { persona } : {})}
                  >
                    <StudioOperatorHistoryItem entry={entry} />
                    {operatorHost.checkpoints &&
                    entry.kind === 'step' &&
                    entry.status === 'done' &&
                    (entry.checkpoint ||
                      entry.tool.startsWith('set_') ||
                      entry.tool === 'prime_generate' ||
                      entry.tool === 'mount_reference' ||
                      entry.tool === 'import_user_url') ? (
                      <StudioOperatorRestoreButton
                        checkpoint={entry.checkpoint}
                        disabled={working}
                        onRestore={restoreCheckpoint}
                      />
                    ) : null}
                  </StudioOperatorTimelineRow>
                )
                const placed = historyRoundPlacement.byIndex.get(index)
                if (!placed || !includeSummary) return row
                return (
                  <Fragment key={`hrw:${index}`}>
                    {row}
                    {placed.map(renderHistoryRound)}
                  </Fragment>
                )
              }
              const renderHistoryGroups = (groups: typeof historyGroups) =>
                groups.map((group) => {
                  if (!group.tools) return renderHistoryEntry(group.indexes[0]!)
                  const steps = group.indexes.flatMap((index) => {
                    const entry = historyEntries[index]
                    return entry?.kind === 'step' ? [entry] : []
                  })
                  const errors = steps.filter((step) => step.status === 'error')
                  const skipped = errors.filter((step) =>
                    STUDIO_OPERATOR_SKIPPED_REJECT_REASONS.some(
                      (reason) => reason === step.rejectReason,
                    ),
                  ).length
                  const roundGroups = historyGroups.filter(
                    (item) => item.round === group.round && item.tools,
                  )
                  const roundSteps = roundGroups.flatMap((item) =>
                    item.indexes.flatMap((index) => {
                      const entry = historyEntries[index]
                      return entry?.kind === 'step' ? [entry] : []
                    }),
                  )
                  const blocker =
                    roundGroups.at(-1) === group
                      ? roundSteps.findLast(
                          (step, index) =>
                            step.status === 'error' &&
                            !STUDIO_OPERATOR_SKIPPED_REJECT_REASONS.some(
                              (reason) => reason === step.rejectReason,
                            ) &&
                            !roundSteps
                              .slice(index + 1)
                              .some(
                                (later) =>
                                  later.tool === step.tool &&
                                  later.status === 'done',
                              ),
                        )
                      : undefined
                  return (
                    <div
                      key={`history-tools:${group.indexes[0]}`}
                      className="ml-8"
                    >
                      <StudioOperatorToolGroup
                        total={steps.length}
                        failed={errors.length - skipped}
                        skipped={skipped}
                        running={false}
                        failure={
                          blocker ? (
                            <>
                              <p className="font-medium">
                                {blocker.tool ===
                                ASSISTANT_OPERATOR_TOOL_IDS.setPrompt
                                  ? t('toolGroup.promptUnchanged')
                                  : t('toolGroup.blocked')}
                              </p>
                              <p className="text-muted-foreground">
                                {blocker.rejectReason &&
                                t.has(`reject.${blocker.rejectReason}`)
                                  ? t(`reject.${blocker.rejectReason}`)
                                  : blocker.title}
                              </p>
                              <p className="text-muted-foreground">
                                {t('toolGroup.inspectFailure')}
                              </p>
                            </>
                          ) : null
                        }
                      >
                        {group.indexes.map((index) =>
                          renderHistoryEntry(index, false),
                        )}
                      </StudioOperatorToolGroup>
                      {group.indexes.flatMap((index) =>
                        (historyRoundPlacement.byIndex.get(index) ?? []).map(
                          renderHistoryRound,
                        ),
                      )}
                    </div>
                  )
                })
              /* ⚠ 跨切点的那一组算「最近」——⛔ 不从一组研究步中间切一刀，
               那会把「查了什么」折进去、「查出什么」留在外面。 */
              const older = historyGroups.filter((group) =>
                group.indexes.every((index) => index < historyCutoff),
              )
              const recent = historyGroups.filter((group) =>
                group.indexes.some((index) => index >= historyCutoff),
              )
              return (
                <>
                  {/* 没有宿主轮次的那几条（见 `placeOperatorRoundSummaries`）——
                      ⛔ 不丢掉：用户改过的结论凭空消失比位置不精确坏得多。 */}
                  {historyRoundPlacement.leading.map(renderHistoryRound)}
                  {older.length > 0 ? (
                    <details
                      data-testid="operator-history-older"
                      className="min-w-0"
                    >
                      <summary className="cursor-pointer list-none py-1 text-2sm text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                        {t('history.earlierRounds', { count: historyCutoff })}
                      </summary>
                      {renderHistoryGroups(older)}
                    </details>
                  ) : null}
                  {renderHistoryGroups(recent)}
                </>
              )
            })()}

            {/* 分隔线只在**两边都有东西**时出现：只有历史时它是一条没有下文的线。 */}
            {historyEntries.length > 0 ? (
              <p
                data-testid="operator-history-divider"
                className="my-2 flex items-center gap-2 text-xs tracking-nav text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border"
              >
                {/* ⚠ 日期取的是**这条会话的 `updatedAt`**（库里那一份没有逐条时刻，
                  见 `types/studio-operator-history.ts`）——⛔ 不拿「现在」去填每一
                  条，那是编数据。整条历史一个日期，说的正是「这些是那天的事」。 */}
                {historySessionDate
                  ? t('history.readonlyNoteAt', { date: historySessionDate })
                  : t('history.readonlyNote')}
              </p>
            ) : null}

            {renderGroups(liveGroups, (index) => renderBlock(blocks[index]!))}

            {/* ── 确认卡（§3.2 进离场表：帧到即插，⛔ 不离开）──────────────
              ⚠ 此处**只剩一张**：计划卡与花钱卡合成了它（`kind` 两支），而问题卡
                按 §3.4 钉到了输入框上方 —— ⛔ 别把它挪回这里，钉住的整个意义就是
                不随时间线滚走。 */}
            {confirm ? (
              <StudioOperatorTimelineRow
                card={STUDIO_OPERATOR_CARD_KINDS.confirm}
                {...(persona ? { persona } : {})}
              >
                {confirm.kind ===
                ASSISTANT_OPERATOR_CONFIRM_KIND_IDS.loraPick ? (
                  /* ── LoRA 推荐卡（lora-assistant §10.3.1）───────────────
                     ⚠ 与其余三支同一个槽位（帧到即插、不离场、就地换态），
                       ⛔ 不钉到输入框上方 —— 那是问题卡「一次只问一个」的位置，
                       而这张卡是多选 + 一颗「挂载所选」。 */
                  <StudioOperatorLoraPickCard
                    prompt={confirm}
                    assistantName={
                      persona?.name?.trim() || t('timeline.assistantFallback')
                    }
                    onSubmit={submitLoraPicks}
                    onDismiss={dismissLoraPick}
                    /* 「换个词再搜」= 预填一句并聚焦，⛔ 不发请求（判据与确认卡
                       「一步一步来」逐字同源：新词还得用户自己打出来）。 */
                    onSearchAgain={searchLoraAgainPrompt}
                    formatTime={formatDecidedAt}
                    /* 缩略图点开 = 库里那张详情抽屉（§10.3.2）：这里只管
                       「开在哪一条上」，抽屉里那颗「勾上这把」改的是卡自己的
                       勾选态 —— ⛔ 别把勾选态也提上来。 */
                    onOpenDetail={setLoraDetailCandidateId}
                    detailCandidateId={loraDetailCandidateId}
                    onCloseDetail={() => setLoraDetailCandidateId(null)}
                  />
                ) : (
                  <StudioOperatorConfirmCard
                    confirm={confirm}
                    onApprove={approvePlan}
                    /* 「一步一步来」= 预填「修改计划：」并聚焦（§3.1 ⑤）——
                     ⛔ 不发请求，下一条消息才带 `planApproved: false`。 */
                    onDecline={() => {
                      declinePlan()
                      revisePrompt()
                    }}
                    onConfirm={confirmGeneration}
                    onCancel={cancelGeneration}
                    /* 上下文卡提议那一支（§8.1）：提议到达时已写成一行「待确认」，
                     「存这张卡」把它翻面，「不用」把它删掉。 */
                    onSaveCard={() => void saveContextCard()}
                    onDismissCard={() => void dismissContextCard()}
                    onRetry={retryGeneration}
                    formatTime={formatDecidedAt}
                    /* 四颗旋钮的真值 —— 宿主现算的那一份（§5.2）。缺席时卡退回
                     只读读数（LoRA 装配台就是这一档）。 */
                    {...(operatorHost.generationControls
                      ? { controls: operatorHost.generationControls }
                      : {})}
                    onAdjust={adjustGeneration}
                  />
                )}
              </StudioOperatorTimelineRow>
            ) : null}

            {status === 'error' ? (
              <StudioOperatorTimelineRow
                card={STUDIO_OPERATOR_CARD_KINDS.system}
              >
                <p
                  data-testid="operator-error"
                  className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-2sm text-destructive"
                >
                  {errorText ?? t('error.generic')}
                </p>
              </StudioOperatorTimelineRow>
            ) : null}
          </div>
        </StudioOperatorTimelineList>

        {/* ── 起手药丸：点即发送（拍板 15）—— **四处各写各的**（D7b ③）────
          ⚠ 读的是宿主那张脸（`face.starterPills`），⛔ 不再按 domain 取
            `STUDIO_OPERATOR_SUGGESTIONS`（那张带 `minChanges` 门的表连同
            `suggestion.*` 词条已整块删掉）：它回答的是「语境化建议」，而 D7b 的
            药丸是「这个助手会干什么」的自我介绍。
          ⚠ 空态时**这一排不画**：同样几句话已经在空态那张卡上摆成了行（§4.2），
            两处同时出现是同一颗按钮画了两遍。 */}
        {operatorHost.face.starterPills.length > 0 && !threadEmpty ? (
          <div className="flex shrink-0 flex-wrap gap-1.5 px-3 pb-2">
            {operatorHost.face.starterPills.map((text) => (
              <button
                key={text}
                type="button"
                data-testid="operator-suggestion"
                onClick={() => submit(text)}
                className="rounded-full border border-primary/30 bg-card px-2.5 py-1 text-2sm text-primary transition-colors duration-(--duration-fast) ease-standard hover:bg-primary/10"
              >
                {text}
              </button>
            ))}
          </div>
        ) : null}

        {/* ── 排队条（§3.1 ㉒–㉔）────────────────────────────────────
          ⚠ 长在输入框**上方**（不是线程末尾）：它说的是「你刚打的这句还在手上」，
            而线程里的一切都是「已经发生的事」。 */}
        <StudioOperatorQueueBar items={queue} onCancel={cancelQueued} />

        {/* ── 问题块：**与输入框同框、一次一题**（56b 切片 4）──────────
          ⭐ 它不进时间线：未答的问题是当下唯一挡路的东西，滚走了就等于问了个
            寂寞。整组答完块消失，时间线里落几行「问题 · 你选了 X」（系统行）。
          ⚠ 已答的那几道先收成小标签留在块上方 —— 它们此刻还没进线程，所以
            「← 上一题」只要 pop 一格（见 `StudioOperatorQuestionPrompt` 的头注）。
          ⚠ 下面的输入框**始终可用**：直接打字 = 用一句话回答当前这题
            （见 `submitComposer`）。 */}
        {question ? (
          <div className="shrink-0">
            <StudioOperatorQuestionAnswers answers={question.answers} />
            <StudioOperatorQuestionBlock
              /* ⭐ **key 带题序**：换一题 = 换一次挂载，于是键盘高亮、写了一半
                 的「其他」、点过一次的锁全都自己清零 —— ⛔ 不在 effect 里
                 setState 清（`react-hooks/set-state-in-effect`）。 */
              key={`${question.id}:${question.answers.length}`}
              prompt={question}
              onBack={goBackQuestion}
              onDismiss={dismissQuestion}
              onAnswer={(
                answer,
                payload: StudioOperatorQuestionAnswerPayload,
              ) =>
                answerQuestion(answer, {
                  label: payload.label,
                  ...(payload.choice ? { choice: payload.choice } : {}),
                  ...(payload.assetOptionId
                    ? {
                        asset: toQuestionAsset(
                          question.questions[
                            question.answers.length
                          ]?.options.find(
                            (option) => option.id === payload.assetOptionId,
                          ),
                        ),
                      }
                    : {}),
                })
              }
            />
          </div>
        ) : null}

        {/* ── 上传中 / 上传失败的 chip（P3-A）──────────────────────
          ⭐ 与下面「已挂上的附件」是同一排、同一种形状：对用户来说这就是
          「我加进来的东西」的那一行，只是有的还在路上。
          ⛔ 但它们在**代码里**是两个类型（见 `types/studio-assistant-operator.ts`
          的 `StudioOperatorUpload` 头注）：没有 https URL 的东西进不了附件数组，
          于是 `blob:` 地址在结构上不可能被发出去。 */}
        {upload.uploads.length > 0 ? (
          <div
            data-testid="operator-upload-row"
            className="flex shrink-0 flex-wrap gap-1.5 px-3 pb-1.5"
          >
            {upload.uploads.map((item) => {
              const failed = item.status === 'error'
              return (
                <span
                  key={item.id}
                  data-testid={
                    failed ? 'operator-upload-error' : 'operator-upload-pending'
                  }
                  data-progress={item.progress}
                  title={item.error ?? item.fileName}
                  className={cn(
                    'flex items-center gap-1 rounded-lg border py-0.5 pl-0.5 pr-1.5 text-2sm',
                    failed
                      ? 'border-destructive/40 bg-destructive/5 text-destructive'
                      : 'border-border bg-muted/50 text-muted-foreground',
                  )}
                >
                  <span className="relative grid size-5 place-items-center overflow-hidden rounded bg-muted">
                    {/* 本地预览（只有图片有）—— 还没上传完就已经看得见自己加了什么。 */}
                    {item.previewUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.previewUrl}
                        alt=""
                        className={cn(
                          'size-full object-cover',
                          !failed && 'opacity-50',
                        )}
                      />
                    ) : null}
                    <span className="absolute inset-0 grid place-items-center">
                      {failed ? (
                        <TriangleAlert className="size-3" aria-hidden />
                      ) : (
                        <Spinner size="sm" className="size-3" />
                      )}
                    </span>
                  </span>
                  <span className="max-w-24 truncate">{item.fileName}</span>
                  {/* 真进度（R2 直传的 XHR 事件），不是假动画。 */}
                  {failed ? null : (
                    <span className="font-mono tabular-nums">
                      {`${item.progress}%`}
                    </span>
                  )}
                  {failed ? (
                    <button
                      type="button"
                      data-testid="operator-upload-retry"
                      aria-label={t('attach.upload.retry')}
                      title={item.error ?? t('attach.upload.retry')}
                      onClick={() => upload.retryUpload(item.id)}
                      className="hover:text-foreground"
                    >
                      <RotateCw className="size-2.5" aria-hidden />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    data-testid="operator-upload-dismiss"
                    aria-label={t('attach.remove')}
                    onClick={() => upload.dismissUpload(item.id)}
                    className="hover:text-foreground"
                  >
                    <X className="size-2.5" aria-hidden />
                  </button>
                </span>
              )
            })}
          </div>
        ) : null}

        {/* ── 已挂上的附件 chip（可摘）──────────────────────────── */}
        {attachments.length > 0 ? (
          <div className="flex shrink-0 flex-wrap gap-1.5 px-3 pb-1.5">
            {attachments.map((attachment) => (
              <span
                key={attachment.id}
                data-testid="operator-attachment-chip"
                className="flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 py-0.5 pl-0.5 pr-1.5 text-2sm text-primary"
              >
                {/* ⚠ 预览走 `thumbnailUrl`，**不是 `url`** —— 视频 / 音频的 url
                  是媒体文件本身，喂给 `next/image` 得到的是一个碎图标。 */}
                {attachment.thumbnailUrl ? (
                  <Image
                    src={attachment.thumbnailUrl}
                    alt={attachment.label}
                    width={40}
                    height={40}
                    className="size-5 rounded object-cover"
                  />
                ) : (
                  <span className="grid size-5 place-items-center rounded bg-primary/15">
                    <AttachKindGlyph kind={attachment.kind} />
                  </span>
                )}
                <span className="max-w-24 truncate">{attachment.label}</span>
                <button
                  type="button"
                  aria-label={t('attach.remove')}
                  onClick={() =>
                    onAttachmentsChange(
                      attachments.filter((item) => item.id !== attachment.id),
                    )
                  }
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-2.5" aria-hidden />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        {/* ── @chip 区（§11.4「@chip」/ §7）──────────────────────────
          ⚠ 与 📎 附件分成两排是有意的：📎 是「我给你一份材料」，@ 是「看这几张」。
            右端那个计数是这一片的承诺（「将看 N 张」），⛔ 不合并进附件排 ——
            合并之后计数会把材料也算进去，而助手并不会去看一段音频。 */}
        {/* ── 上下文卡 chip（切片 Y）──────────────────────────────
          ⚠ 与图 chip **分成两排**：「看这几张」和「照这张卡干活」不是同一件事，
            合成一排之后右端那个「将看 N 张」的计数会把卡也数进去。 */}
        {mention.cardChips.length > 0 ? (
          <div
            data-testid="operator-card-chip-row"
            className="flex shrink-0 flex-wrap items-center gap-1.5 px-3 pb-1.5"
          >
            {mention.cardChips.map((card) => (
              <ContextCardChip
                key={card.cardId}
                cardId={card.cardId}
                name={card.name}
                kind={card.kind}
                images={card.images}
                active
                onRemove={mention.removeCardChip}
                removeLabel={t('mention.remove')}
              />
            ))}
          </div>
        ) : null}

        {mention.chips.length > 0 ? (
          <div
            data-testid="operator-mention-row"
            className="flex shrink-0 flex-wrap items-center gap-1.5 px-3 pb-1.5"
          >
            {mention.chips.map((chip) => (
              <span
                key={chip.id}
                data-testid="operator-mention-chip"
                className="flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 py-0.5 pl-0.5 pr-1.5 text-2sm text-primary"
              >
                {chip.thumbnailUrl ? (
                  <Image
                    src={chip.thumbnailUrl}
                    alt={chip.label}
                    width={40}
                    height={40}
                    unoptimized
                    className="size-5 rounded object-cover"
                  />
                ) : (
                  <span className="grid size-5 place-items-center rounded bg-primary/15">
                    <AttachKindGlyph kind={chip.kind} />
                  </span>
                )}
                <span className="max-w-24 truncate">{chip.label}</span>
                <button
                  type="button"
                  data-testid="operator-mention-remove"
                  aria-label={t('mention.remove')}
                  onClick={() => mention.removeChip(chip.id)}
                  className="text-primary/70 hover:text-primary"
                >
                  <X className="size-2.5" aria-hidden />
                </button>
              </span>
            ))}
            {/* ⚠ 超过 8 张只**转色 + 加一句**，⛔ 不拦截、⛔ 不截断（owner 2026-09-06）。 */}
            <span
              data-testid="operator-mention-count"
              data-over-limit={mention.overLimit}
              className={cn(
                'ml-auto font-mono text-xs tracking-nav tabular-nums',
                mention.overLimit
                  ? 'text-status-warning'
                  : 'text-muted-foreground',
              )}
            >
              {mention.overLimit
                ? t('mention.countWarn', {
                    count: mention.count,
                    limit: STUDIO_OPERATOR_MENTION.warnAboveCount,
                  })
                : t('mention.count', { count: mention.count })}
            </span>
          </div>
        ) : null}

        {/* ── 输入区：上行工具条 + 下行输入（拍板 12）──────────────── */}
        <div
          data-testid="operator-input-area"
          data-drag-over={dragOver}
          /**
           * 拖图进输入框（§3.3 第 3 行）—— 四入口之三。
           *
           * ⭐ 库内资产（`ASSET_DND_MIME`）成 @chip，其余原样交回上传三通道那一个
           * 出口（拍板 16）。判据在 `use-studio-operator-mention.ts` 里，⛔ 这里
           * 不再判一次。
           * ⚠ `onDragOver` 必须 `preventDefault`，否则浏览器根本不会触发 `drop`
           * （「拖上去光标是禁止号，松手什么都没发生」的经典成因）。
           */
          onDragOver={(event) => {
            event.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragOver(false)
            const files = mention.acceptDrop(event.dataTransfer)
            if (files.length > 0) upload.uploadFiles(files)
          }}
          /* 画板 Main / BEmpty / BCards「输入区 · 静止」：输入区是**浮在面板里
             的一张卡**，不是贴着底边的一条工具栏 —— 玻璃面板上一条横贯的分隔线
             会把面板切成两半，而输入区本来就该读成「当下要你动手的那一件」。
             走 raised 那一档（深一档描边 + 柔扩散影，§12.1）。 */
          className={cn(
            'relative mx-3 mb-3 flex shrink-0 flex-col gap-1.5 rounded-xl border bg-card px-3 py-2.5 shadow-assistant-raised transition-colors duration-(--duration-fast) ease-standard motion-reduce:transition-none',
            dragOver
              ? 'border-primary ring-2 ring-inset ring-primary'
              : 'border-assistant-line-strong',
          )}
        >
          <div className="flex flex-col gap-2">
            <MentionInput
              ref={inputRef}
              /* 浮层 portal 在 `document.body`（面板带 `backdrop-filter` +
                 `overflow-hidden`，portal 进来就会被接管坐标再被裁），所以要自己
                 挂收放法则的豁免标记，否则点候选 = 点面板外面 = 面板收起。 */
              popoverAttributes={{ [STUDIO_OPERATOR_KEEP_OPEN_ATTR]: '' }}
              value={draft}
              aria-label={operatorHost.face.inputPlaceholder}
              onValueChange={onDraftChange}
              tokens={referenceTokens}
              mentionCandidates={mentionCandidates}
              /* 一条都没对上时也要**说话**：两句分得开 —— 一句是「这儿本来就没有
                 参考图」，另一句是「有，但没一条对得上你打的字」。合成一句的话
                 前者会把用户支使去改搜索词。 */
              emptyLabel={
                referenceCandidates.length
                  ? tReference('noMatches')
                  : tReference('empty')
              }
              onMentionSelect={(candidate) => {
                inputRef.current?.insertToken(
                  candidate.tokenName ?? candidate.name,
                )
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || event.keyCode === 229)
                  return
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  submit(draft)
                }
              }}
              /**
               * 粘贴成附件（拍板 16 的第三个手势）。
               *
               * ⚠ 只在剪贴板**没有文本**时 `preventDefault`：从网页上复制一段
               * 图文再粘进来，用户要的是那段文字**和**那张图，吞掉文字是错的。
               * ⚠ 走 `clipboardData.files` 而不是 `items` —— `files` 已经是
               * `File`，`items` 还要 `getAsFile()` 一层且在部分浏览器里会给出
               * 一堆 `string` 类型的空条目。
               */
              onPaste={(event) => {
                const files = [...(event.clipboardData?.files ?? [])]
                if (files.length === 0) return
                if (!event.clipboardData?.getData('text/plain')) {
                  event.preventDefault()
                }
                upload.uploadFiles(files)
              }}
              placeholder={
                /* ⚠ 有未答问题时换一句（§3.4）：用户可以**不答直接打字**，而
                   默认那句「写点什么…」会让人以为必须先答上面那张卡。 */
                question
                  ? t('placeholderQuestion')
                  : working
                    ? t('placeholderWorking')
                    : /* 空闲那一句**四处各写各的**（D7b ③）——这是输入区唯一的
                         文案差异，⛔ 别把它也做成四套输入区。 */
                      operatorHost.face.inputPlaceholder
              }
              className="max-h-40 min-h-9 w-full resize-none overflow-y-auto overscroll-contain rounded-lg border border-border bg-background px-2.5 py-2 text-md outline-none transition-colors duration-(--duration-fast) ease-standard placeholder:text-muted-foreground/70 focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
            />
            {/* ── 下行：+ · 上传 · 文本模型 chip ……… 发送（v2 §4.4）───── */}
            <div
              data-testid="operator-toolbar"
              className="flex items-center gap-2"
            >
              <button
                ref={attachTriggerRef}
                type="button"
                data-testid="operator-plus-toggle"
                aria-label={t('plusMenu.label')}
                aria-expanded={attachOpen}
                aria-controls={
                  attachOpen ? STUDIO_OPERATOR_PLUS_MENU_ID : undefined
                }
                data-operator-plus-trigger
                onClick={() => setAttachOpen((open) => !open)}
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-md border border-border bg-muted text-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
                  // 展开时翻成信号位（近黑实底 + 白字，§12.2）。
                  attachOpen &&
                    'border-foreground bg-foreground text-background hover:bg-foreground',
                )}
              >
                <Plus className="size-4" aria-hidden />
              </button>
              {/*
                ⭐ 上传从「+」菜单搬到了这颗独立按钮上（v2 §4.4「附件不进菜单」）。
                ⚠ 三个手势仍是**一条通道**（拍板 16）：选文件 / 拖进输入框 / 粘贴，
                  全落到 `handleUploadFiles`。⛔ 别在这里另起一条 fetch。
                ⚠ 选完必须清 `value`：不清的话「同一个文件选第二次」不触发 change，
                  表现是「第一次能传，删掉重选就没反应了」。
              */}
              <button
                type="button"
                data-testid="operator-attach-toggle"
                aria-label={t('attach.label')}
                onClick={() => uploadInputRef.current?.click()}
                className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-card text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              >
                <Paperclip className="size-3.5" aria-hidden />
              </button>
              <input
                ref={uploadInputRef}
                type="file"
                multiple
                accept={STUDIO_OPERATOR_UPLOAD_ACCEPT}
                data-testid="operator-attach-file-input"
                className="hidden"
                onChange={(event) => {
                  const files = [...(event.target.files ?? [])]
                  event.target.value = ''
                  if (files.length > 0) handleUploadFiles(files)
                }}
              />
              {/*
                ⭐ 素材库按钮（切片 #7c，owner 2026-09-11）：点开 `AssetSelectorDialog`
                  挑库里的图挂给助手。
                ⚠ 为什么是**显性按钮**而不是 `@` 里的一段：`@` 得先想起来打一个 `@`
                  才看得见，而「从素材库挑图」是用户**一眼要找的入口**。
                ⛔ 不另造一个浏览器：弹层内仍是 `AssetPickerBrowser`（文件夹分类 +
                  无限滚动 + 多选），只把首屏页大小换成 10。
              */}
              <button
                type="button"
                data-testid="operator-library-toggle"
                aria-label={t('library.label')}
                title={t('library.label')}
                onClick={() => setLibraryOpen(true)}
                /* ⚠ 与左边那两颗同尺寸同圆角（`size-8 rounded-md`，对稿
                   2026-09-11）：下行四颗控件是一排并列的入口，⛔ 不许某一颗
                   自己小一号、圆一档。 */
                className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-card text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
              >
                <Images className="size-3.5" aria-hidden />
              </button>
              {/* ⭐ 文本模型 chip（§4.5，commit #8）：「自动」是真选项排第一，
                九条模型按厂商分组，选中即写 `AssistantPersona.routeModel`。
                ⛔ 面板不再持有任何 route 内存态 —— 真值在 persona，服务端自己读。 */}
              <StudioOperatorModelChip
                value={persona?.routeModel ?? ASSISTANT_ROUTE_MODEL_AUTO}
                onChange={onSelectRouteModel}
              />
              <span className="flex-1" />
              {working ? (
                <button
                  type="button"
                  data-testid="operator-stop"
                  aria-label={t('stop')}
                  title={t('stop')}
                  onClick={stop}
                  className="grid size-8 shrink-0 place-items-center rounded-md border border-destructive/40 bg-destructive/5 text-destructive transition-colors duration-(--duration-fast) ease-standard hover:bg-destructive/10 motion-reduce:transition-none"
                >
                  <Square className="size-3" aria-hidden />
                </button>
              ) : null}
              <button
                type="button"
                data-testid="operator-send"
                /**
                 * ⚠ 工作态下发送 = **排队**（§3.1 ㉒，拍板 13 改口）：`send()` 把这一句
                 * 放进队列，到下一个工具步跑完才接住。⛔ 「发送即插话」那条分支已删
                 * （§14「删掉什么」）—— 它此前的实现是 abort + 重发，代价是用户想补
                 * 一句「顺便把比例改成 3:4」会把已经付过钱的三步整个掐掉重跑一遍。
                 * 真要掐掉走 ⏹（`operator-stop`）。
                 * 等上传是**说出来的**等待：停用 + 一句「还有文件在传」，
                 * ⛔ 不做「点了没反应」。
                 */
                disabled={uploading}
                title={sendLabel}
                aria-label={sendLabel}
                onClick={() => submit(draft)}
                className="grid size-8 shrink-0 place-items-center rounded-md bg-foreground text-background transition-[background-color,transform] duration-(--duration-fast) ease-standard hover:bg-foreground/90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-surface-fill-track disabled:text-muted-foreground disabled:opacity-100 motion-reduce:transition-none"
              >
                {uploading ? (
                  <Spinner size="sm" className="text-background" />
                ) : (
                  /* ⚠ 画板 Main 的发送键是一支**↑**不是纸飞机：这一颗提交的是
                     「把这句话推上去」，箭头比纸飞机更直说这件事。底仍是
                     `bg-foreground`（信号位，§12.2）。 */
                  <ArrowUp className="size-4" aria-hidden />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {attachOpen && !history.loadingSessionId ? (
        <StudioOperatorPlusMenu
          triggerRef={attachTriggerRef}
          onDismiss={() => setAttachOpen(false)}
          {...(domain ? { scope: domain } : {})}
          /**
           * 「提及素材」= 插一个 `@` 再把焦点还给输入框 —— 弹出来的是
           * `MentionInput` 现有的那一颗选择器，⛔ 菜单里不另造一份。
           */
          onPickMention={() => inputRef.current?.insertText('@')}
          onPickCard={(card) => {
            onDraftChange(mention.pickCard(draft, card))
            inputRef.current?.focus()
          }}
        />
      ) : null}

      {/*
        素材库弹层（切片 #7c）。⚠ 只在开着时挂：`AssetPickerBrowser` 一挂载就取
        第一页，常驻等于每开一次面板都白打一发请求。
        ⚠ `multiSelect` —— 助手这一侧是**集合**（参考图可以加好几张），不是槽。
      */}
      {libraryOpen ? (
        <AssetSelectorDialog
          open
          onOpenChange={setLibraryOpen}
          title={t('library.title')}
          description={t('library.description')}
          mediaType="image"
          multiSelect
          pageSize={STUDIO_OPERATOR_LIBRARY_PAGE_SIZE}
          onConfirmMany={pickLibraryAssets}
        />
      ) : null}
    </>
  )
}
