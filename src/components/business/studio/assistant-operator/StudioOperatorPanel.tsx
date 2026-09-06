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
 *  · 输入区双行：上行 📎 + 模型 chip + 工作态 ⏹，下行 输入框 + 发送（拍板 12）
 *  · 工作态占位语「说，我在听 — 插话即转向」；发送键在工作态**就是插话**（拍板 13）
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Paperclip,
  RotateCw,
  Send,
  Square,
  TriangleAlert,
  X,
} from 'lucide-react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'

import {
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_TOOL_IDS,
} from '@/constants/assistant-operator'
import {
  STUDIO_OPERATOR_MENTION,
  STUDIO_OPERATOR_SUGGESTIONS,
  STUDIO_OPERATOR_TIMELINE,
} from '@/constants/studio-assistant-operator'
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
import { openOperatorLightbox } from '@/components/business/studio/assistant-operator/StudioOperatorLightbox'
import { StudioOperatorLogItem } from '@/components/business/studio/assistant-operator/StudioOperatorLogItem'
import { StudioOperatorMentionPicker } from '@/components/business/studio/assistant-operator/StudioOperatorMentionPicker'
import { StudioOperatorQueueBar } from '@/components/business/studio/assistant-operator/StudioOperatorQueueBar'
import {
  StudioOperatorResultRow,
  resultOrdinal,
} from '@/components/business/studio/assistant-operator/StudioOperatorResultRow'
import {
  STUDIO_OPERATOR_BAND_STEP_STATES,
  StudioOperatorProgressBand,
  type StudioOperatorBandStep,
} from '@/components/business/studio/assistant-operator/StudioOperatorProgressBand'
import {
  STUDIO_OPERATOR_NODE_KINDS,
  StudioOperatorTimelineRow,
  type StudioOperatorNodeKind,
} from '@/components/business/studio/assistant-operator/StudioOperatorTimelineRow'
import { StudioOperatorToolGroup } from '@/components/business/studio/assistant-operator/StudioOperatorToolGroup'
import { Spinner } from '@/components/ui/spinner'
import { useStudioGenOptional } from '@/contexts/studio-context'
import type { UseAssistantOperatorResult } from '@/hooks/use-assistant-operator'
import type { UseStudioOperatorHistoryResult } from '@/hooks/use-studio-operator-history'
import type { UseStudioOperatorUploadResult } from '@/hooks/use-studio-operator-upload'
import type { UseStudioOperatorWebImportResult } from '@/hooks/use-studio-operator-web-import'
import { useStudioOperatorMention } from '@/hooks/use-studio-operator-mention'
import { useStudioOperatorRevert } from '@/hooks/use-studio-operator-revert'
import { useStudioAssistantControls } from '@/hooks/use-studio-assistant-controls'
import {
  setOperatorAskFirst,
  setOperatorSelectedResult,
  useStudioOperatorState,
} from '@/hooks/use-studio-operator-store'
import { cn } from '@/lib/utils'
import type { StudioOperatorHistoryEntry } from '@/types/studio-operator-history'
import type {
  StudioOperatorAttachment,
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
  onCollapse,
}: StudioOperatorPanelProps) {
  const t = useTranslations('StudioOperator')
  const tPrompt = useTranslations('PromptAssistant')
  const {
    entries,
    status,
    errorText,
    history: historyEntries,
    stepsDone,
    plannedSteps,
    queue,
    selectedResultId,
    askFirst,
  } = useStudioOperatorState()
  const { domain, send, stop, cancelQueued, newThread } = operator
  /**
   * `@` 的那条 chip 管线（§3.3 四入口）—— chips 住在 store（收放法则会卸载这颗
   * 组件），触发解析与选择器开合住在 hook 里。
   */
  const mention = useStudioOperatorMention()
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
  // 「问助手」/「按这张继续」按完要把焦点还给输入框（§3.1 ⑲「chip 插入并聚焦」）
  // —— 不还的话用户得再点一次输入框才能接着说，而他刚刚明明就在说话。
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [dragOver, setDragOver] = useState(false)

  /**
   * 「最近生成」那一批（§3.3：@ 选择器最近生成在前 · §3.1 ⑱ 结果行卡）。
   *
   * ⭐ 数据源是工作台**本来就在跑**的那条回流（`activeRun`），⛔ 没有新轮询器 ——
   * 与 `use-studio-operator-critique.ts` 读的是同一处。
   * ⚠ 走 `useStudioGenOptional()`：面板也挂在 `/studio/lora` 上，而那条路由故意
   * 不挂 `<StudioProvider>`，会抛的那版会把整颗面板打红。装配台那边这一段恒空
   * （结果行卡整块不渲染），接它自己的结果列是第 3 轮的事。
   */
  const activeRun = useStudioGenOptional()?.activeRun
  const resultItems = useMemo<readonly StudioOperatorResultItem[]>(() => {
    const items = activeRun?.items ?? []
    return items.flatMap((item) => {
      const generation = item.generation
      if (item.status !== 'completed' || !generation?.url) return []
      return [
        {
          id: generation.id,
          url: generation.url,
          ...(generation.thumbnailUrl
            ? { thumbnailUrl: generation.thumbnailUrl }
            : {}),
          ...(generation.prompt
            ? { label: generation.prompt.slice(0, 40) }
            : {}),
        },
      ]
    })
  }, [activeRun])

  /**
   * 结果格 → chip。
   *
   * ⚠ `label` 兜底成序号（「结果②」）而不是空串：chip 上什么都不写的话，挂了三张
   * 之后用户分不出哪一枚是哪一张。⚠ `kind` 恒 `image`：结果行卡只画得下静态图，
   * 视频域的结果行是第二期。
   */
  const toResultChip = useCallback(
    (
      item: StudioOperatorResultItem,
      index: number,
    ): StudioOperatorAttachment => ({
      id: item.id,
      url: item.url,
      label:
        item.label ?? t('result.chipLabel', { ordinal: resultOrdinal(index) }),
      kind: 'image',
      ...(item.thumbnailUrl ? { thumbnailUrl: item.thumbnailUrl } : {}),
    }),
    [t],
  )

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

  // 新条目进来就滚到底 —— 日志是逐条落地的，不跟着滚等于让用户一直手动拖。
  // ⚠ 载回历史也要滚（P4-B）：刷新之后停在几十条之前的开头，用户以为对话丢了。
  useEffect(() => {
    const node = threadRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [entries, historyEntries])

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
      const merged = [...attachments]
      for (const chip of mention.chips) {
        if (!merged.some((item) => item.id === chip.id)) merged.push(chip)
      }
      send(value, merged)
      onDraftChange('')
      onAttachmentsChange([])
      mention.clearChips()
      mention.closePicker()
      setAttachOpen(false)
    },
    [attachments, mention, onAttachmentsChange, onDraftChange, send, uploading],
  )

  /**
   * 四入口共用的那一步：插 chip、（可选）预填一句、把焦点还给输入框。
   *
   * ⛔ 不在四个调用点各写一遍：那正是「结果卡插进来的 chip 与 @ 选出来的 chip
   * 行为不一样」这类不对称的来源。
   */
  const attachChip = useCallback(
    (chip: StudioOperatorAttachment, prefill?: string) => {
      mention.addChip(chip)
      if (prefill && !draft.trim()) onDraftChange(prefill)
      inputRef.current?.focus()
    },
    [draft, mention, onDraftChange],
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

  const currentStepTitle =
    bandSteps.find(
      (step) => step.state === STUDIO_OPERATOR_BAND_STEP_STATES.running,
    )?.title ?? null

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

  return (
    <>
      {/* ── 顶部进度带（拍板 10 改口 · §2.4）──────────────────────── */}
      <StudioOperatorProgressBand
        domain={domain}
        working={working}
        stepsDone={stepsDone}
        plannedSteps={plannedSteps}
        currentStepTitle={currentStepTitle}
        steps={bandSteps}
        history={history}
        onNewThread={newThread}
        onCollapse={onCollapse}
      />

      {/* ── 时间线沟（§11.3）──────────────────────────────────────
          ⚠ 滚的是外面这一层，贯穿竖线画在里面那一层：线要跟着内容一起滚，
            画在滚动容器上会得到一条钉在视口里、内容从它旁边流过去的假线。 */}
      <div
        ref={threadRef}
        data-testid="operator-thread"
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
            <p className="px-1 py-6 text-center text-xs leading-relaxed text-muted-foreground">
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
          {historyEntries.map((entry, index) => (
            <StudioOperatorTimelineRow
              key={`h:${index}:${entry.id}`}
              node={historyNodeKind(entry.kind)}
              withTimestamp={false}
            >
              <StudioOperatorHistoryItem entry={entry} />
            </StudioOperatorTimelineRow>
          ))}

          {/* 分隔线只在**两边都有东西**时出现：只有历史时它是一条没有下文的线。 */}
          {historyEntries.length > 0 ? (
            <p
              data-testid="operator-history-divider"
              className="my-2 flex items-center gap-2 font-mono text-3xs tracking-nav text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border"
            >
              {t('history.readonlyNote')}
            </p>
          ) : null}

          {blocks.map((block) => {
            if (block.kind === 'tools') {
              const failed = block.steps.filter(
                (item) =>
                  item.step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.error,
              ).length
              const running = block.steps.some(
                (item) =>
                  item.step.status ===
                  ASSISTANT_OPERATOR_STEP_STATUS_IDS.running,
              )
              /* checkpoint 只在**这一轮真的收尾了**之后出现（§2.13）：还在跑就
                 挂一张「已改 3 项」，用户会以为它已经改完了。 */
              const roundDone = !working || block.runKey !== latestRunKey
              const changeCountInRound = countRoundChanges(block.runKey)
              const fields = roundFields(block.runKey)
              return (
                <div key={`tools:${block.runKey}:${block.steps[0]?.id}`}>
                  <StudioOperatorTimelineRow
                    node={STUDIO_OPERATOR_NODE_KINDS.tool}
                  >
                    <StudioOperatorToolGroup
                      total={block.steps.length}
                      failed={failed}
                      running={running}
                    >
                      {block.steps.map((item) => (
                        <StudioOperatorLogItem
                          key={item.id}
                          entryId={item.id}
                          step={item.step}
                          undone={item.undone}
                          onUndo={undoStep}
                          // ⚠ 按条取，不是把整个 hook 传下去：日志条是 `memo` 的，
                          //    传一个每次 render 都换引用的对象等于把 memo 关掉。
                          webImport={webImport.states[item.id]}
                          webImportLimit={webImport.limit}
                          onToggleWebImage={webImport.toggleCandidate}
                        />
                      ))}
                    </StudioOperatorToolGroup>
                  </StudioOperatorTimelineRow>
                  {roundDone && changeCountInRound > 0 ? (
                    <StudioOperatorTimelineRow
                      node={STUDIO_OPERATOR_NODE_KINDS.system}
                    >
                      <StudioOperatorCheckpointCard
                        runKey={block.runKey}
                        count={changeCountInRound}
                        fieldSummary={fields
                          .map((field) => t(`field.${field}`))
                          .join(' · ')}
                        onRevert={handleCheckpointRevert}
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
                    <p className="whitespace-pre-wrap text-xs font-medium leading-relaxed text-foreground">
                      {entry.text}
                    </p>
                    {entry.attachments.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {entry.attachments.map((attachment) => (
                          <span
                            key={attachment.id}
                            className="rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-2xs text-primary"
                          >
                            {attachment.label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </StudioOperatorTimelineRow>
                )
              case 'message':
                return (
                  <StudioOperatorTimelineRow
                    key={entry.id}
                    node={STUDIO_OPERATOR_NODE_KINDS.assistant}
                  >
                    <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                      {entry.text}
                    </p>
                  </StudioOperatorTimelineRow>
                )
              case 'plan':
                return (
                  <StudioOperatorTimelineRow
                    key={entry.id}
                    node={STUDIO_OPERATOR_NODE_KINDS.assistant}
                  >
                    <div
                      data-testid="operator-plan"
                      className="overflow-hidden rounded-xl border border-border bg-card"
                    >
                      <p className="border-b border-border px-3 py-2 text-xs font-semibold text-foreground">
                        {t('planTitle')}
                      </p>
                      <ul className="flex flex-col gap-1 p-3">
                        {entry.steps.map((step, index) => (
                          <li
                            key={step}
                            className="flex items-baseline gap-2 text-xs text-foreground"
                          >
                            <span className="shrink-0 font-mono text-3xs tracking-nav tabular-nums text-muted-foreground">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <span className="min-w-0">{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
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
                  >
                    <StudioOperatorCritiqueCard
                      step={{ ...step, result: step.result }}
                      runKey={entry.runKey}
                      roundChangeCount={countRoundChanges(entry.runKey)}
                      onRevertRound={revertRound}
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
                      className="text-2xs leading-relaxed text-muted-foreground"
                    >
                      {/* ⚠ 两种 subject：`revertField` 存的是**字段 id**（要过词表
                          才是人话），`undoStep` 存的是模型写的那行标题（本来就是
                          人话，翻译它等于把它弄丢）。 */}
                      {t(`system.${entry.code}`, {
                        subject:
                          entry.code === 'revertField' && entry.subject
                            ? t(`field.${entry.subject}`)
                            : (entry.subject ?? ''),
                        count: entry.count ?? 0,
                      })}
                    </p>
                  </StudioOperatorTimelineRow>
                )
              /**
               * 切域标记（拍板 8：切域换工具，会话不断）。
               *
               * ⚠ `entry.domain` 存的是**域 id**，印之前必须过词表 —— 直接塞进
               * 文案会在中文界面上印出一个英文的 `video`。
               */
              case 'domainMark':
                return (
                  <StudioOperatorTimelineRow
                    key={entry.id}
                    node={STUDIO_OPERATOR_NODE_KINDS.system}
                  >
                    <p
                      data-testid="operator-domain-mark"
                      data-domain={entry.domain}
                      className="text-2xs leading-relaxed text-muted-foreground"
                    >
                      {t('domainMark', {
                        domain: t(`domainName.${entry.domain}`),
                      })}
                    </p>
                  </StudioOperatorTimelineRow>
                )
            }
          })}

          {/* ── 结果行卡（§3.1 ⑱）────────────────────────────────────
              ⚠ 钉在流末尾而不是插进 `blocks`：那一批结果不是线程条目（它来自
                工作台的在飞回流，不落线程、不进上下文）。真正把它变成对话的是
                用户点「问助手」之后插的那枚 @chip —— 那一条才进消息。
              ⚠ LoRA 装配台上 `resultItems` 恒空 → 整块不渲染（⛔ 不做空占位）。 */}
          {resultItems.length > 0 ? (
            <StudioOperatorTimelineRow
              node={STUDIO_OPERATOR_NODE_KINDS.assistant}
            >
              <StudioOperatorResultRow
                items={resultItems}
                selectedId={selectedResultId}
                onSelect={setOperatorSelectedResult}
                onAsk={(item, index) => attachChip(toResultChip(item, index))}
                onZoom={(item, index) =>
                  openOperatorLightbox(
                    item.url,
                    item.label ??
                      t('result.chipLabel', { ordinal: resultOrdinal(index) }),
                  )
                }
                onContinue={(item, index) =>
                  attachChip(
                    toResultChip(item, index),
                    t('result.continuePrefill'),
                  )
                }
              />
            </StudioOperatorTimelineRow>
          ) : null}

          {status === 'error' ? (
            <StudioOperatorTimelineRow node={STUDIO_OPERATOR_NODE_KINDS.system}>
              <p
                data-testid="operator-error"
                className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-2xs text-destructive"
              >
                {errorText ?? t('error.generic')}
              </p>
            </StudioOperatorTimelineRow>
          ) : null}
        </div>
      </div>

      {/* ── 建议药丸：语境化，点即发送（拍板 15）────────────────── */}
      {suggestions.length > 0 ? (
        <div className="flex shrink-0 flex-wrap gap-1.5 px-3 pb-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              data-testid="operator-suggestion"
              onClick={() => submit(t(`suggestion.${suggestion.id}`))}
              className="rounded-full border border-primary/30 bg-card px-2.5 py-1 text-2xs text-primary transition-colors duration-(--duration-fast) ease-standard hover:bg-primary/10"
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
                  'flex items-center gap-1 rounded-lg border py-0.5 pl-0.5 pr-1.5 text-2xs',
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
              className="flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 py-0.5 pl-0.5 pr-1.5 text-2xs text-primary"
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
      {mention.chips.length > 0 ? (
        <div
          data-testid="operator-mention-row"
          className="flex shrink-0 flex-wrap items-center gap-1.5 px-3 pb-1.5"
        >
          {mention.chips.map((chip) => (
            <span
              key={chip.id}
              data-testid="operator-mention-chip"
              className="flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 py-0.5 pl-0.5 pr-1.5 text-2xs text-primary"
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
              'ml-auto font-mono text-3xs tracking-nav tabular-nums',
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
        className={cn(
          'relative flex shrink-0 flex-col gap-1.5 border-t bg-card px-3 py-2.5 transition-colors duration-(--duration-fast) ease-standard',
          dragOver
            ? 'border-primary ring-2 ring-inset ring-primary'
            : 'border-border',
        )}
      >
        <div data-testid="operator-toolbar" className="flex items-center gap-2">
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
              'rounded-lg border px-2 py-1 text-2xs transition-colors duration-(--duration-fast) ease-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
          <textarea
            ref={inputRef}
            data-testid="operator-input"
            value={draft}
            rows={1}
            /**
             * ⚠ 每次变化都把草稿与**光标位置**喂给 `@` 解析（§3.3 第 1 行）：
             * 只传文本的话，在一句话中间回头补一个 `@` 时会去匹配句尾那个 ——
             * 表现是「选择器弹了，但选完插到了别的地方」。
             */
            onChange={(event) => {
              onDraftChange(event.target.value)
              mention.syncDraft(
                event.target.value,
                event.target.selectionStart ?? event.target.value.length,
              )
            }}
            onKeyDown={(event) => {
              /**
               * ⚠ 选择器开着时上下键 / 回车 / Esc **不归这里管**：它们由选择器挂在
               * window 上的捕获监听吃掉（焦点必须留在输入框里，见那颗组件的头注）。
               * 这里只处理「没开选择器时的回车 = 发送」。
               */
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
            className="max-h-24 min-h-9 flex-1 resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-xs outline-none transition-colors duration-(--duration-fast) ease-standard placeholder:text-muted-foreground/70 focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
          />
          <button
            type="button"
            data-testid="operator-send"
            // 工作态下发送 = 插话即转向（拍板 13）：`send` 内部先 abort 再带着
            // 新消息重发，所以这里不需要第二条分支。
            // 等上传是**说出来的**等待：停用 + 一句「还有文件在传」，
            // ⛔ 不做「点了没反应」（那正是本片在修的病）。
            disabled={uploading}
            title={
              uploading
                ? t('attach.upload.waiting')
                : working
                  ? t('sendInterrupt')
                  : t('send')
            }
            aria-label={
              uploading
                ? t('attach.upload.waiting')
                : working
                  ? t('sendInterrupt')
                  : t('send')
            }
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

        {/* ── `@` 选择器（§3.3 第 1 行）—— 就地弹在输入区上方 ────────
            ⚠ 定位锚是输入区自己（`relative`），⛔ 不用 portal：面板是 `fixed`
              的覆盖层，portal 出去之后它会跟着页面滚而不是跟着面板。 */}
        {mention.trigger ? (
          <StudioOperatorMentionPicker
            query={mention.trigger.query}
            recent={resultItems.map((item, index) => toResultChip(item, index))}
            onPick={(attachment) => {
              onDraftChange(mention.pick(draft, attachment))
              inputRef.current?.focus()
            }}
            onDismiss={mention.closePicker}
          />
        ) : null}
      </div>

      {attachOpen ? (
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
