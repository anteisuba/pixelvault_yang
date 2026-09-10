'use client'
import { StudioOperatorReferenceAnalysisCard } from './StudioOperatorReferenceAnalysisCard'

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
import { StudioOperatorRestoreButton } from './StudioOperatorRestoreButton'
import { isRevertibleAssistantOperatorTool } from '@/constants/assistant-operator'
import { toOperatorHistory } from '@/lib/studio-operator-history'
import type { StudioOperatorCheckpoint } from '@/types/studio-operator-checkpoint'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  Paperclip,
  RotateCw,
  Send,
  Square,
  TriangleAlert,
  X,
} from 'lucide-react'
import {
  groupOperatorResearch,
  groupOperatorResearchRuns,
  hasOperatorResearchFindings,
  isOperatorResearchTool,
  shouldStickOperatorScroll,
  splitOperatorHistoryRounds,
} from '@/lib/studio-operator-timeline'
import Image from 'next/image'
import { toast } from 'sonner'
import { useFormatter, useTranslations } from 'next-intl'

import {
  ASSISTANT_OPERATOR_APPEND_SEPARATOR,
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_TOOL_IDS,
} from '@/constants/assistant-operator'
import {
  STUDIO_OPERATOR_HISTORY_OPEN_ROUNDS,
  STUDIO_OPERATOR_MENTION,
  STUDIO_OPERATOR_SUGGESTIONS,
  STUDIO_OPERATOR_TIMELINE,
} from '@/constants/studio-assistant-operator'
import { RuleChip } from '@/components/business/studio/assistant-operator/RuleChip'
import { StudioOperatorAssetChoiceCard } from '@/components/business/studio/assistant-operator/StudioOperatorAssetChoiceCard'
import { StudioOperatorSpendConfirmCard } from '@/components/business/studio/assistant-operator/StudioOperatorSpendConfirmCard'
import { CanvasAssistantRouteSelector } from '@/components/business/node/CanvasAssistantRouteSelector'
import {
  AttachKindGlyph,
  STUDIO_OPERATOR_ATTACH_MENU_ID,
  StudioOperatorAttachMenu,
} from '@/components/business/studio/assistant-operator/StudioOperatorAttachMenu'
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
  type MentionInputHandle,
  type MentionToken,
} from '@/components/ui/mention-input'
import {
  getReferenceMentionIndices,
  getReferenceImageAttachmentId,
  compileReferenceMentions,
} from '@/lib/studio-reference-mentions'
import {
  StudioOperatorMessageBody,
  StudioOperatorUserText,
} from '@/components/business/studio/assistant-operator/StudioOperatorMessageBody'
import { StudioOperatorResearchCard } from '@/components/business/studio/assistant-operator/StudioOperatorResearchCard'
import { StudioOperatorQuestionCard } from '@/components/business/studio/assistant-operator/StudioOperatorQuestionCard'
import { StudioOperatorQueueBar } from '@/components/business/studio/assistant-operator/StudioOperatorQueueBar'
import {
  STUDIO_OPERATOR_BAND_STEP_STATES,
  StudioOperatorProgressBand,
  type StudioOperatorBandStep,
} from '@/components/business/studio/assistant-operator/StudioOperatorProgressBand'
import {
  STUDIO_OPERATOR_NODE_KINDS,
  StudioOperatorTimelineList,
  StudioOperatorTimelineRow,
  type StudioOperatorNodeKind,
} from '@/components/business/studio/assistant-operator/StudioOperatorTimelineRow'
import { StudioOperatorToolGroup } from '@/components/business/studio/assistant-operator/StudioOperatorToolGroup'
import { Spinner } from '@/components/ui/spinner'
import { useStudioOperatorHost } from '@/contexts/studio-operator-host'
import type { UseAssistantOperatorResult } from '@/hooks/use-assistant-operator'
import type { UseStudioOperatorHistoryResult } from '@/hooks/use-studio-operator-history'
import type { UseStudioOperatorUploadResult } from '@/hooks/use-studio-operator-upload'
import type { UseStudioOperatorWebImportResult } from '@/hooks/use-studio-operator-web-import'
import { useStudioOperatorMention } from '@/hooks/use-studio-operator-mention'
import { useStudioOperatorRevert } from '@/hooks/use-studio-operator-revert'
import { useStudioAssistantControls } from '@/hooks/use-studio-assistant-controls'
import {
  hydrateOperatorResume,
  getOperatorState,
  restoreOperatorThreadCheckpoint,
  setOperatorAskFirst,
  setOperatorResumeScope,
  useStudioOperatorState,
} from '@/hooks/use-studio-operator-store'
import {
  failedResumeStep,
  nextResumeStepNumber,
} from '@/lib/studio-operator-resume'
import { cn } from '@/lib/utils'
import type { AssistantPersona } from '@/types/assistant-persona'
import type { StudioOperatorHistoryEntry } from '@/types/studio-operator-history'
import type {
  StudioOperatorAttachment,
  StudioOperatorStepEntry,
  StudioOperatorThreadEntry,
} from '@/types/studio-assistant-operator'

/**
 * 载回来的历史条目在沟里占哪一档（§11.3）。
 *
 * ⚠ 与实时线程用**同一张分级表**：历史里同一种条目换个形状，用户会以为那是
 * 另一种东西 —— 而它只是同一条会话的昨天。
 */
function historyNodeKind(
  kind: StudioOperatorHistoryEntry['kind'],
): StudioOperatorNodeKind {
  if (kind === 'user') return STUDIO_OPERATOR_NODE_KINDS.user
  if (kind === 'message' || kind === 'plan') {
    return STUDIO_OPERATOR_NODE_KINDS.assistant
  }
  if (kind === 'step') return STUDIO_OPERATOR_NODE_KINDS.tool
  return STUDIO_OPERATOR_NODE_KINDS.system
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
  /** ⋯ 菜单 →「助手设置」（§8.1 主入口）。弹层住在外壳里（收放法则会卸载面板）。 */
  onOpenAssistantSettings(): void
  /** 规则薄卡上的「查看规则」（§10）—— 打开助手设置并落到规则那一页。 */
  onOpenProjectRules(): void
  onCollapse(): void
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
  onOpenAssistantSettings,
  onOpenProjectRules,
  onCollapse,
}: StudioOperatorPanelProps) {
  const t = useTranslations('StudioOperator')
  const format = useFormatter()
  const tPrompt = useTranslations('PromptAssistant')
  const tReference = useTranslations('StudioPromptArea.referenceMention')
  const {
    entries: allEntries,
    status,
    errorText,
    history: allHistoryEntries,
    stepsDone,
    plannedSteps,
    queue,
    askFirst,
    plan,
    spend,
    choice,
    confirm,
    capturingFrames,
    costs,
    costDetails,
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
    answerConfirm,
    answerQuestions,
    revisePlan,
    answerSpend,
    cancelSpend,
    answerChoice,
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
    roundFields,
    changeCount,
  } = useStudioOperatorRevert()
  const { route, setRoute } = useStudioAssistantControls()

  // 📎 面板开着与否**是**局部态：它是一次性的挑选动作，收起再展开时它该是关的。
  const [attachOpen, setAttachOpen] = useState(false)
  const attachTriggerRef = useRef<HTMLButtonElement>(null)
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
  const inputAreaRef = useRef<HTMLDivElement>(null)
  const [dragOver, setDragOver] = useState(false)

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

  const referenceImages = operatorHost.referenceImages
  const referenceTokens: MentionToken[] = referenceImages.map(
    (entry, index) => ({
      name: `Image${index + 1}`,
      kind: 'reference',
      thumbnailUrl: entry.url,
      slotLabel: `@${tReference('image', { index: index + 1 })}`,
    }),
  )
  const referenceCandidates = referenceTokens.flatMap((token, index) =>
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
   * ⭐ **三张「等你定」的卡也要滚**（2026-09-07 真机）：它们不是线程条目（住在
   * store 的 `plan` / `spend` / `choice` 里），只盯 `entries` 的下场是反问卡出现在
   * 屏幕外面，而那张卡正是此刻唯一要人动手的东西。
   * ⚠ **用户已经手动上滚就不打扰**（`stickRef`）：他在读三轮之前那段话时被每一条
   *   新日志拽回底部，比不滚更糟。
   */
  useEffect(() => {
    const node = threadRef.current
    if (!node || !stickRef.current) return
    node.scrollTop = node.scrollHeight
  }, [
    entries,
    historyEntries,
    confirm,
    plan?.id,
    plan?.resolved,
    spend?.id,
    spend?.resolved,
    choice?.id,
  ])

  const submit = useCallback(
    (text: string) => {
      const value = text.trim()
      if (!value) return
      // 见上面 `uploading` 的注释：在飞的上传是发送的硬前提。
      if (uploading) return
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

  const suggestions = useMemo(
    () =>
      STUDIO_OPERATOR_SUGGESTIONS[domain].filter(
        (item) => changeCount >= item.minChanges,
      ),
    [changeCount, domain],
  )

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

  const bandSteps = useMemo<readonly StudioOperatorBandStep[]>(() => {
    if (!latestRunKey) return []
    return entries
      .filter(
        (entry): entry is StudioOperatorStepEntry =>
          entry.kind === 'step' && entry.runKey === latestRunKey,
      )
      .map((entry) => ({
        id: entry.id,
        title: entry.step.title,
        state:
          entry.step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.error
            ? STUDIO_OPERATOR_BAND_STEP_STATES.failed
            : entry.step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.running
              ? STUDIO_OPERATOR_BAND_STEP_STATES.running
              : STUDIO_OPERATOR_BAND_STEP_STATES.done,
      }))
  }, [entries, latestRunKey])

  /**
   * ⚠ **抽帧那一段压过步标题**（第二期最后一环）：它跑在请求发出去之前，进度带上
   * 一步都还没有，而它实测要几秒（浏览器解码 + 三次 seek）。不说这一句的话，
   * 那几秒里带上写的是「思考中」—— 而它并没有在思考。
   */
  const currentStepTitle = capturingFrames
    ? t('band.capturingFrames')
    : (bandSteps.find(
        (step) => step.state === STUDIO_OPERATOR_BAND_STEP_STATES.running,
      )?.title ?? null)

  /**
   * 把线程劈成「渲染块」—— **连续的工具步合成一组**（§2.7）。
   *
   * ⚠ 看图那一条不进组：它渲染成评价卡（拍板 6），是大节点不是过程行 —— 混进
   * ToolGroup 会被折叠掉，而「证据长在结论里」正是它存在的理由。
   * ⚠ 组的边界是 `runKey` 也是「连不连续」：跨轮的两组步长得一样，但它们是两次
   * 不同的委托，合成一行会让 checkpoint 的「这一轮」失去参照。
   */
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

  const historyGroups = groupOperatorResearch(
    historyEntries.map((entry) =>
      entry.kind === 'message'
        ? 'message'
        : entry.kind === 'step' &&
            entry.status === 'done' &&
            isOperatorResearchTool(entry.tool)
          ? 'research'
          : 'result',
    ),
  )
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
      const failed = block.steps.filter(
        (item) => item.step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
      ).length
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
      const fields = roundFields(block.runKey)
      /**
       * ⭐ 这一组里有调查步 → 整组改画**调查卡**（第 6 件）：结论 + 证据 + 候选
       * 在明面上，翻页读页那一串折进「过程」。⛔ 不与 ToolGroup 并排画 —— 那会
       * 让同一轮检索在流里出现两次。
       * ⚠ 有失败步时**退回 ToolGroup**：卡上没有失败那一档的位置，而失败恰恰是
       * 那一刻唯一要读的东西（ToolGroup 会自动展开它）。
       */
      const researchSteps =
        failed === 0
          ? groupOperatorResearchRuns(
              block.steps.map((item) => ({
                runKey: item.runKey,
                tool: item.step.tool,
              })),
            ).flatMap((group) =>
              group.indexes.map((index) => block.steps[index]!),
            )
          : []
      /**
       * ⭐ **一条证据、一张候选都没有就不出卡**（2026-09-07 真机）：那样的卡结论行
       * 回落成占位文案「查了一下」、右上角写着「0 条证据」，整张卡讲的是零。
       * ⚠ 退回 `ToolGroup`（下面那一支）而不是整组不渲染：过程照旧可展开复核。
       */
      const showResearchCard =
        researchSteps.length > 0 && hasOperatorResearchFindings(researchSteps)
      /**
       * ⚠ `logItems` 必须**排在 `showResearchCard` 之后**算：出卡时这几条日志是
       * 卡底那段「过程」的内容，而候选网格已经画在卡面上了 —— 日志条这时候
       * ⛔ 不能再画一份（2026-09-07 真机：16 个格子 / 8 张唯一候选）。
       */
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
            renderWebCandidates={!showResearchCard}
          />
          {operatorHost.checkpoints &&
          item.step.status === 'done' &&
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
        <div key={`tools:${block.runKey}:${block.steps[0]?.id}`}>
          <StudioOperatorTimelineRow node={STUDIO_OPERATOR_NODE_KINDS.tool}>
            {showResearchCard ? (
              <StudioOperatorResearchCard
                steps={researchSteps}
                webImportStates={webImport.states}
                webImportLimit={webImport.limit}
                onToggleWebImage={webImport.toggleCandidate}
              >
                {logItems}
              </StudioOperatorResearchCard>
            ) : (
              <StudioOperatorToolGroup
                total={block.steps.length}
                failed={failed}
                running={running}
              >
                {logItems}
              </StudioOperatorToolGroup>
            )}
          </StudioOperatorTimelineRow>
          {block.steps.map((item) =>
            item.step.tool === ASSISTANT_OPERATOR_TOOL_IDS.analyzeReferences &&
            item.step.status === 'done' &&
            item.step.result ? (
              <StudioOperatorTimelineRow
                key={item.id}
                node={STUDIO_OPERATOR_NODE_KINDS.tool}
              >
                <StudioOperatorReferenceAnalysisCard
                  analysis={item.step.result}
                />
              </StudioOperatorTimelineRow>
            ) : null,
          )}
          {roundDone &&
          changeCountInRound > 0 &&
          lastToolsBlock === block.steps[0]?.id ? (
            <StudioOperatorTimelineRow node={STUDIO_OPERATOR_NODE_KINDS.system}>
              <StudioOperatorCheckpointCard
                runKey={block.runKey}
                count={changeCountInRound}
                fieldSummary={fields
                  .map((field) => t(`field.${field}`))
                  .join(' · ')}
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
            node={STUDIO_OPERATOR_NODE_KINDS.user}
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
       * 助手正文 —— 逐字长出来的那一条（§4.1）。
       *
       * ⚠ `streaming` 为真且还没有字 = **发送即回显**的占位行：头像已经在了，
       *   正文位画三点脉冲，高度就是一行正文高，第一个字到达时不跳。
       */
      case 'message':
        return (
          <StudioOperatorTimelineRow
            key={entry.id}
            node={STUDIO_OPERATOR_NODE_KINDS.assistant}
            {...(persona ? { persona } : {})}
          >
            <StudioOperatorMessageBody entry={entry} />
          </StudioOperatorTimelineRow>
        )
      case 'plan':
        return (
          <StudioOperatorTimelineRow
            key={entry.id}
            node={STUDIO_OPERATOR_NODE_KINDS.assistant}
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
            node={STUDIO_OPERATOR_NODE_KINDS.assistant}
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
      case 'system':
        return (
          <StudioOperatorTimelineRow
            key={entry.id}
            node={STUDIO_OPERATOR_NODE_KINDS.system}
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
            node={STUDIO_OPERATOR_NODE_KINDS.system}
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
      case 'domainMark':
        return null
    }
  }

  return (
    <>
      {/* ── 顶部进度带（拍板 10 改口 · §2.4）──────────────────────── */}
      <StudioOperatorProgressBand
        domain={domain}
        costs={costs}
        costDetails={costDetails}
        working={working}
        awaitingPlan={status === 'awaitingPlan'}
        stepsDone={stepsDone}
        plannedSteps={plannedSteps}
        currentStepTitle={currentStepTitle}
        steps={bandSteps}
        history={history}
        onNewThread={newThread}
        onOpenAssistantSettings={onOpenAssistantSettings}
        onCollapse={onCollapse}
        {...(resumeStepNumber === null
          ? {}
          : {
              resume: { stepNumber: resumeStepNumber, onResume: resumePlan },
            })}
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
            {/* 贯穿的 1px border 色线 —— 节点与头像都压在它上面（同轴）。 */}
            <span
              aria-hidden
              data-testid="operator-timeline-line"
              style={{ left: `${STUDIO_OPERATOR_TIMELINE.linePx}px` }}
              className="pointer-events-none absolute bottom-2 top-4 w-px bg-border"
            />

            {entries.length === 0 && historyEntries.length === 0 ? (
              <p className="px-1 py-6 text-center text-md leading-relaxed text-muted-foreground">
                {t('empty')}
              </p>
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
              const renderHistoryEntry = (index: number) => {
                const entry = historyEntries[index]!
                return (
                  <StudioOperatorTimelineRow
                    key={`h:${index}:${entry.id}`}
                    node={historyNodeKind(entry.kind)}
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
              }
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
                  {older.length > 0 ? (
                    <details
                      data-testid="operator-history-older"
                      className="min-w-0"
                    >
                      <summary className="cursor-pointer list-none py-1 text-2sm text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                        {t('history.earlierRounds', { count: historyCutoff })}
                      </summary>
                      {renderGroups(older, renderHistoryEntry)}
                    </details>
                  ) : null}
                  {renderGroups(recent, renderHistoryEntry)}
                </>
              )
            })()}

            {/* 分隔线只在**两边都有东西**时出现：只有历史时它是一条没有下文的线。 */}
            {historyEntries.length > 0 ? (
              <p
                data-testid="operator-history-divider"
                className="my-2 flex items-center gap-2 font-mono text-xs tracking-nav text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border"
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

            {/* ── 三张「等你定」的卡（§4.1「钉在流末尾」）──────────────────
              ⚠ 顺序是**计划 → 反问 → 花钱**，与它们在一轮里出现的先后一致：
                计划卡在任何一步之前，反问在中途，花钱在最后一步。三张同时在场
                在协议上不可能（每一帧之后流都停了），顺序只是为了「万一」时读起来
                仍然像一条时间线。 */}
            {plan ? (
              <StudioOperatorTimelineRow
                node={STUDIO_OPERATOR_NODE_KINDS.big}
                {...(persona ? { persona } : {})}
              >
                {/* ⭐ **一轮只有一张**待确认卡（2026-09-06 面板轮，第 2 件）：阶段
                  清单折在它头上，题在中间。⛔ 旧的计划卡已整块删掉 —— 两张卡列
                  同一份阶段、各带一颗「开始」，用户要答两遍。 */}
                <StudioOperatorQuestionCard
                  steps={plan.steps}
                  estimate={plan.estimate}
                  questions={plan.questions}
                  answers={plan.answers}
                  resolved={plan.resolved}
                  onSubmit={answerQuestions}
                  /* 「修改」= 预填「修改计划：」并聚焦（§3.1 ⑤）——⛔ 不发请求，
                   下一条消息才带 `planApproved: false`（hook 那一侧记着）。 */
                  onRevise={revisePrompt}
                />
              </StudioOperatorTimelineRow>
            ) : null}

            {choice ? (
              <StudioOperatorTimelineRow
                node={STUDIO_OPERATOR_NODE_KINDS.big}
                {...(persona ? { persona } : {})}
              >
                <StudioOperatorAssetChoiceCard
                  question={choice.question}
                  options={choice.options}
                  chosenId={choice.chosenId}
                  onChoose={(option) =>
                    answerChoice(
                      option,
                      t('choice.answer', {
                        label: option.label,
                      }),
                    )
                  }
                />
              </StudioOperatorTimelineRow>
            ) : null}

            {confirm ? (
              <StudioOperatorTimelineRow
                node={STUDIO_OPERATOR_NODE_KINDS.assistant}
              >
                <StudioOperatorConfirmCard
                  confirm={confirm}
                  onAnswer={answerConfirm}
                />
              </StudioOperatorTimelineRow>
            ) : null}

            {spend ? (
              <StudioOperatorTimelineRow
                node={STUDIO_OPERATOR_NODE_KINDS.big}
                {...(persona ? { persona } : {})}
              >
                <StudioOperatorSpendConfirmCard
                  request={spend.request}
                  resolved={spend.resolved}
                  onConfirm={answerSpend}
                  onCancel={cancelSpend}
                />
              </StudioOperatorTimelineRow>
            ) : null}

            {status === 'error' ? (
              <StudioOperatorTimelineRow
                node={STUDIO_OPERATOR_NODE_KINDS.system}
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

        {/* ── 建议药丸：语境化，点即发送（拍板 15）────────────────── */}
        {suggestions.length > 0 ? (
          <div className="flex shrink-0 flex-wrap gap-1.5 px-3 pb-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                data-testid="operator-suggestion"
                onClick={() => submit(t(`suggestion.${suggestion.id}`))}
                className="rounded-full border border-primary/30 bg-card px-2.5 py-1 text-2sm text-primary transition-colors duration-(--duration-fast) ease-standard hover:bg-primary/10"
              >
                {t(`suggestion.${suggestion.id}`)}
              </button>
            ))}
          </div>
        ) : null}

        {/* ── 排队条（§3.1 ㉒–㉔）────────────────────────────────────
          ⚠ 长在输入框**上方**（不是线程末尾）：它说的是「你刚打的这句还在手上」，
            而线程里的一切都是「已经发生的事」。 */}
        <StudioOperatorQueueBar items={queue} onCancel={cancelQueued} />

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
          ref={inputAreaRef}
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
          className={cn(
            'relative flex shrink-0 flex-col gap-1.5 border-t bg-card px-3 py-2.5 transition-colors duration-(--duration-fast) ease-standard',
            dragOver
              ? 'border-primary ring-2 ring-inset ring-primary'
              : 'border-border',
          )}
        >
          <div
            data-testid="operator-toolbar"
            className="flex items-center gap-2"
          >
            <button
              ref={attachTriggerRef}
              type="button"
              data-testid="operator-attach-toggle"
              aria-label={t('attach.label')}
              aria-expanded={attachOpen}
              aria-controls={
                attachOpen ? STUDIO_OPERATOR_ATTACH_MENU_ID : undefined
              }
              data-operator-attach-trigger
              onClick={() => setAttachOpen((open) => !open)}
              className={cn(
                'grid size-7 place-items-center rounded-lg border border-border/70 text-muted-foreground transition-colors duration-(--duration-fast) ease-standard hover:text-foreground',
                attachOpen && 'border-primary/40 bg-primary/10 text-primary',
              )}
            >
              <Paperclip className="size-3.5" aria-hidden />
            </button>
            {/* ⭐ 模型 chip = 现有「自动路由」组件（拍板 11），不另行设计。
              `emptyRouteLabel` 必须由调用方给：studio 没有 gateway 分支，
              写死任何一个具体型号都是在说谎（2026-08-19 生产事故）。 */}
            <span data-testid="operator-model-chip">
              <CanvasAssistantRouteSelector
                value={route}
                onChange={setRoute}
                emptyRouteLabel={tPrompt('routeAuto')}
              />
            </span>
            {/* ── 「先问我」（§3.3 后两行）────────────────────────────
              ⚠ 本片**只做开关与状态**：开着时占位语加一句「本轮先出计划卡」，
                真正强制出卡的那一半由计划卡片那一片接（§5 的客户端硬判）。
                ⛔ 但它不是假开关 —— 值真的存进 store，接线那片读它即可。 */}
            <button
              type="button"
              data-testid="operator-ask-first"
              aria-pressed={askFirst}
              title={t('askFirst.hint')}
              onClick={() => setOperatorAskFirst(!askFirst)}
              className={cn(
                'rounded-lg border px-2 py-1 text-2sm transition-colors duration-(--duration-fast) ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                askFirst
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border/70 text-muted-foreground hover:text-foreground',
              )}
            >
              {t('askFirst.label')}
            </button>
            <span className="flex-1" />
            {working ? (
              <button
                type="button"
                data-testid="operator-stop"
                aria-label={t('stop')}
                title={t('stop')}
                onClick={stop}
                className="grid size-7 place-items-center rounded-lg border border-destructive/40 bg-destructive/5 text-destructive transition-colors duration-(--duration-fast) ease-standard hover:bg-destructive/10"
              >
                <Square className="size-3" aria-hidden />
              </button>
            ) : null}
          </div>
          <div className="flex items-end gap-2">
            <MentionInput
              ref={inputRef}
              portalContainerRef={inputAreaRef}
              value={draft}
              aria-label={t('placeholderIdle')}
              onValueChange={onDraftChange}
              tokens={referenceTokens}
              mentionCandidates={referenceCandidates}
              onMentionSelect={(candidate) =>
                inputRef.current?.insertToken(
                  candidate.tokenName ?? candidate.name,
                )
              }
              emptyLabel={
                referenceCandidates.length
                  ? tReference('noMatches')
                  : tReference('empty')
              }
              onKeyDown={(event) => {
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
                askFirst
                  ? t('placeholderAskFirst')
                  : working
                    ? t('placeholderWorking')
                    : t('placeholderIdle')
              }
              className="max-h-24 min-h-9 flex-1 resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-md outline-none transition-colors duration-(--duration-fast) ease-standard placeholder:text-muted-foreground/70 focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
            />
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
              className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-colors duration-(--duration-fast) ease-standard hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? (
                <Spinner size="sm" className="text-primary-foreground" />
              ) : (
                <Send className="size-4" aria-hidden />
              )}
            </button>
          </div>
        </div>
      </div>

      {attachOpen && !history.loadingSessionId ? (
        <StudioOperatorAttachMenu
          triggerRef={attachTriggerRef}
          onUploadFiles={handleUploadFiles}
          onDismiss={() => setAttachOpen(false)}
          onAttach={(attachment) => {
            onAttachmentsChange(
              attachments.some((item) => item.id === attachment.id)
                ? attachments
                : [...attachments, attachment],
            )
            setAttachOpen(false)
          }}
        />
      ) : null}
    </>
  )
}
