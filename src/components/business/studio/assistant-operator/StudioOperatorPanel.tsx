'use client'

/**
 * 操作员面板的**内容**（头部 / 线程 / 药丸 / 输入区）。外壳（宽度、收放、胶囊）
 * 在 `StudioOperatorDock.tsx`。
 *
 * 逐条对应切片 v4：
 *  · 头部只剩「身份 + 域 chip · 会话 · ⋯ · 收起」（拍板 10）
 *  · **模型 chip 住输入框上方工具条明面**，点开是现有「自动路由」组件（拍板 11）——
 *    ⛔ 没有另行设计一个选择器：那件事 2026-08-19 出过生产事故（界面显示 GPT、
 *    实际打 Gemini），复用是唯一不会再犯的做法
 *  · 输入区双行：上行 📎 + 模型 chip + 工作态 ⏹，下行 输入框 + 发送（拍板 12）
 *  · 工作态占位语「说，我在听 — 插话即转向」；发送键在工作态**就是插话**（拍板 13）
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  MessageSquarePlus,
  MoreHorizontal,
  Paperclip,
  PanelRightClose,
  RotateCw,
  Send,
  Square,
  TriangleAlert,
  X,
} from 'lucide-react'
import Image from 'next/image'
import { useFormatter, useTranslations } from 'next-intl'

import {
  ASSISTANT_OPERATOR_STEP_STATUS_IDS,
  ASSISTANT_OPERATOR_TOOL_IDS,
  type AssistantOperatorDomain,
} from '@/constants/assistant-operator'
import { ASSISTANT_PROTOCOL_DOMAIN_IDS } from '@/constants/assistant-protocol'
import { STUDIO_OPERATOR_SUGGESTIONS } from '@/constants/studio-assistant-operator'
import { CanvasAssistantRouteSelector } from '@/components/business/node/CanvasAssistantRouteSelector'
import {
  AttachKindGlyph,
  STUDIO_OPERATOR_ATTACH_MENU_ID,
  StudioOperatorAttachMenu,
} from '@/components/business/studio/assistant-operator/StudioOperatorAttachMenu'
import { StudioOperatorCritiqueCard } from '@/components/business/studio/assistant-operator/StudioOperatorCritiqueCard'
import { StudioOperatorHistoryItem } from '@/components/business/studio/assistant-operator/StudioOperatorHistoryItem'
import { StudioOperatorLogItem } from '@/components/business/studio/assistant-operator/StudioOperatorLogItem'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import type { UseAssistantOperatorResult } from '@/hooks/use-assistant-operator'
import type { UseStudioOperatorHistoryResult } from '@/hooks/use-studio-operator-history'
import type { UseStudioOperatorUploadResult } from '@/hooks/use-studio-operator-upload'
import type { UseStudioOperatorWebImportResult } from '@/hooks/use-studio-operator-web-import'
import { useStudioOperatorRevert } from '@/hooks/use-studio-operator-revert'
import { useStudioAssistantControls } from '@/hooks/use-studio-assistant-controls'
import { useStudioOperatorState } from '@/hooks/use-studio-operator-store'
import { cn } from '@/lib/utils'
import {
  ASSISTANT_SURFACE_IDS,
  type AssistantSurfaceId,
} from '@/types/assistant-conversation'
import type { StudioOperatorAttachment } from '@/types/studio-assistant-operator'

/**
 * 会话行上那枚域标签读哪条词条。
 *
 * ⚠ `Record<Surface, …>`：surface 表加一档而这里没跟上，编译期就红 ——
 * 而漏掉的表现是菜单上一枚印着 `undefined` 的标签。
 * ⚠ LoRA / 画布也列在这儿是因为类型要求穷举；它们的会话**根本不会进这个列表**
 * （`use-studio-operator-history.ts` 只查图片与视频两个槽）。
 */
const SESSION_DOMAIN_BY_SURFACE: Record<
  AssistantSurfaceId,
  AssistantOperatorDomain | null
> = {
  [ASSISTANT_SURFACE_IDS.imageStudio]: ASSISTANT_PROTOCOL_DOMAIN_IDS.image,
  [ASSISTANT_SURFACE_IDS.videoStudio]: ASSISTANT_PROTOCOL_DOMAIN_IDS.video,
  [ASSISTANT_SURFACE_IDS.lora]: ASSISTANT_PROTOCOL_DOMAIN_IDS.lora,
  /** ⚠ 画布不是操作员的域，`domainName` 里也没有它的词条 —— 不画标签。 */
  [ASSISTANT_SURFACE_IDS.nodeCanvas]: null,
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
  const format = useFormatter()
  const {
    entries,
    status,
    errorText,
    history: historyEntries,
  } = useStudioOperatorState()
  const { domain, send, stop, newThread } = operator
  const { undoStep, revertRound, countRoundChanges, changeCount } =
    useStudioOperatorRevert()
  const { route, setRoute } = useStudioAssistantControls()

  // 📎 面板开着与否**是**局部态：它是一次性的挑选动作，收起再展开时它该是关的。
  const [attachOpen, setAttachOpen] = useState(false)
  const attachTriggerRef = useRef<HTMLButtonElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)

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
      send(value, attachments)
      onDraftChange('')
      onAttachmentsChange([])
      setAttachOpen(false)
    },
    [attachments, onAttachmentsChange, onDraftChange, send, uploading],
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

  return (
    <>
      {/* ── 头部：身份 + 域 chip · 会话 · ⋯ · 收起（拍板 10）─────── */}
      <header className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-background/95 px-3 py-2.5">
        <span
          className={cn(
            'size-2 shrink-0 rounded-full bg-primary',
            working && 'animate-pulse',
          )}
          aria-hidden
        />
        <span className="text-sm font-semibold text-foreground">
          {t('title')}
        </span>
        <span
          data-testid="operator-domain-chip"
          className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-2xs font-medium text-primary"
        >
          {t(`domainChip.${domain}`)}
        </span>
        <span className="flex-1" />

        {/* ── 会话 = 历史 + 新对话合一（拍板 10），P4-B 起接的是真库 ────── */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-testid="operator-session-menu"
              className="rounded-lg border border-border/70 px-2 py-1 text-2xs text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground"
            >
              {t('session')}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="max-h-96 min-w-72 overflow-y-auto"
          >
            <DropdownMenuItem onSelect={() => newThread()}>
              <MessageSquarePlus className="size-4" aria-hidden />
              {t('newThread')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-2xs font-normal text-muted-foreground">
              {t('history.heading')}
            </DropdownMenuLabel>
            {history.isHydrating ? (
              <DropdownMenuItem disabled className="text-2xs">
                {t('history.loading')}
              </DropdownMenuItem>
            ) : null}
            {!history.isHydrating && history.sessions.length === 0 ? (
              <DropdownMenuItem disabled className="text-2xs">
                {t('history.empty')}
              </DropdownMenuItem>
            ) : null}
            {history.sessions.map((session) => {
              /* ⚠ 域标签读的是 `surface`（线程**起始**域）—— 一条线程后来切去
                 哪儿只在它自己的域标记里，列表这一层看不到，也不该猜。
                 ⚠ 先取出来再判：直接把索引表达式塞进模板串，`null` 会一起进
                 `t()` 的键类型里（编译期就红）。 */
              const sessionDomain = SESSION_DOMAIN_BY_SURFACE[session.surface]
              return (
                <DropdownMenuItem
                  key={session.id}
                  data-testid="operator-session-item"
                  data-session-id={session.id}
                  data-surface={session.surface}
                  data-current={
                    session.id === history.currentSessionId ? 'true' : 'false'
                  }
                  onSelect={() => history.selectSession(session)}
                >
                  {sessionDomain ? (
                    <span className="shrink-0 rounded-full border border-border bg-muted/60 px-1.5 py-0.5 text-2xs text-muted-foreground">
                      {t(`domainName.${sessionDomain}`)}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">
                    {session.title ?? t('history.untitled')}
                  </span>
                  <span className="ml-auto shrink-0 text-2xs text-muted-foreground">
                    {format.dateTime(new Date(session.updatedAt), {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {session.id === history.currentSessionId ? (
                    <Check className="size-3.5 shrink-0" aria-hidden />
                  ) : null}
                </DropdownMenuItem>
              )
            })}
            {history.error ? (
              <DropdownMenuItem disabled className="text-2xs text-destructive">
                {history.error}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t('more')}
              className="rounded-lg border border-border/70 px-2 py-1 text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground"
            >
              <MoreHorizontal className="size-3.5" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            {/* 分享要有一条落了库的会话才有东西可分享（P4）—— 现在诚实地停用。 */}
            <DropdownMenuItem disabled>{t('share')}</DropdownMenuItem>
            <DropdownMenuItem disabled>{t('feedback')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          data-testid="operator-collapse"
          aria-label={t('collapse')}
          onClick={onCollapse}
          className="rounded-lg border border-border/70 px-2 py-1 text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground"
        >
          <PanelRightClose className="size-3.5" aria-hidden />
        </button>
      </header>

      {/* ── 线程 ────────────────────────────────────────────────── */}
      <div
        ref={threadRef}
        data-testid="operator-thread"
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-3"
      >
        {entries.length === 0 && historyEntries.length === 0 ? (
          <p className="my-auto rounded-xl bg-background/90 px-4 py-3 text-center text-xs leading-relaxed text-foreground">
            {t('empty')}
          </p>
        ) : null}

        {/* ── 载回来的只读历史（P4-B）───────────────────────────────
            ⚠ 条目 id 是**本次页面加载现编的序号**（`user-3`），刷新之后从头再编
              一遍，所以它会在两条轴上撞车：
              ① 历史 ↔ 新线程 —— `h:` 前缀挡住这一条；
              ② 历史 ↔ 历史 —— **一条跨了几次页面加载的线程，存下来的那个数组里
                 本身就有两个 `user-1`**（保存时是「旧历史 + 本次 entries」拼接，
                 而本次 entries 的序号从 1 重新开始）。2026-08-31 P4-C 真机撞到：
                 控制台连着五条 `Encountered two children with the same key`
                 （`h:user-1` / `h:plan-3` / `h:msg-4` / `h:run-2:step-1` / `h:msg-5`），
                 后果是 React 把两条不同的历史当成同一个节点复用。
            ⭐ 所以 key 里带上**位置**：历史是只读、只追加、按顺序渲染的数组，
              位置在这里是稳定的身份；id 留在 key 里只是为了调试时看得出是哪一条。
            ⛔ 别改成「保存时给历史重新编号」：那要动 P4-B 的落库格式，而这只是一个
              渲染键的问题 —— 库里那份数据本身没有错，它只是不保证 id 唯一。 */}
        {historyEntries.map((entry, index) => (
          <StudioOperatorHistoryItem
            key={`h:${index}:${entry.id}`}
            entry={entry}
          />
        ))}

        {/* 分隔线只在**两边都有东西**时出现：只有历史时它是一条没有下文的线。 */}
        {historyEntries.length > 0 ? (
          <p
            data-testid="operator-history-divider"
            className="my-1 flex items-center gap-2 text-2xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border"
          >
            {t('history.readonlyNote')}
          </p>
        ) : null}

        {entries.map((entry) => {
          switch (entry.kind) {
            case 'user':
              return (
                <div
                  key={entry.id}
                  className="ml-8 flex flex-col items-end gap-1"
                >
                  <p className="rounded-xl rounded-br-sm bg-foreground px-3 py-2 text-xs text-background">
                    {entry.text}
                  </p>
                  {entry.attachments.length > 0 ? (
                    <div className="flex flex-wrap justify-end gap-1">
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
                </div>
              )
            case 'message':
              return (
                <p
                  key={entry.id}
                  className="mr-6 whitespace-pre-wrap rounded-xl rounded-bl-sm bg-background/95 px-3 py-2 text-xs text-foreground"
                >
                  {entry.text}
                </p>
              )
            case 'plan':
              return (
                <div
                  key={entry.id}
                  data-testid="operator-plan"
                  className="rounded-xl border border-primary/30 bg-primary/5 px-2.5 py-2"
                >
                  <p className="mb-1.5 text-2xs font-medium text-primary">
                    {t('planTitle')}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {entry.steps.map((step) => (
                      <span
                        key={step}
                        className="rounded-full border border-primary/30 bg-background px-2 py-0.5 text-2xs text-primary"
                      >
                        {step}
                      </span>
                    ))}
                  </div>
                </div>
              )
            case 'step': {
              /**
               * ⭐ 看图那一条渲染成**评价卡**而不是日志条（拍板 6）：证据要长在
               * 结论里，而日志条画不下一张图 + 四条结论。
               * ⚠ 只有跑完（`result` 已经在）才换脸：`running` 那一帧和被拒的那
               * 一支（没有结果可看 / 借不到视觉线）照旧走日志条 —— 它们本来就
               * 只有一行标题加一句理由。
               */
              const { step } = entry
              if (
                step.tool === ASSISTANT_OPERATOR_TOOL_IDS.critiqueResult &&
                step.status === ASSISTANT_OPERATOR_STEP_STATUS_IDS.done &&
                step.result
              ) {
                return (
                  <StudioOperatorCritiqueCard
                    key={entry.id}
                    step={{ ...step, result: step.result }}
                    runKey={entry.runKey}
                    roundChangeCount={countRoundChanges(entry.runKey)}
                    onRevertRound={revertRound}
                  />
                )
              }
              return (
                <StudioOperatorLogItem
                  key={entry.id}
                  entryId={entry.id}
                  step={step}
                  undone={entry.undone}
                  onUndo={undoStep}
                  // ⚠ 按条取，不是把整个 hook 传下去：日志条是 `memo` 的，
                  //    传一个每次 render 都换引用的对象等于把 memo 关掉。
                  webImport={webImport.states[entry.id]}
                  webImportLimit={webImport.limit}
                  onToggleWebImage={webImport.toggleCandidate}
                />
              )
            }
            case 'system':
              return (
                <p
                  key={entry.id}
                  data-testid="operator-system-line"
                  className="mx-auto rounded-full border border-dashed border-destructive/40 bg-destructive/5 px-3 py-1 text-2xs text-destructive"
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
              )
            /**
             * 切域标记（拍板 8：切域换工具，会话不断）。
             *
             * ⚠ `entry.domain` 存的是**域 id**，印之前必须过词表 —— 直接塞进
             * 文案会在中文界面上印出一个英文的 `video`。
             * ⚠ 用的是 `domainName` 而**不是** chip 那三条：chip 写的是「在视频
             * 工作台」（一句状语），塞进「切到{domain}」会读成「切到在视频工作台」。
             * 同一个东西的两种语法位置，两套词条。
             */
            case 'domainMark':
              return (
                <p
                  key={entry.id}
                  data-testid="operator-domain-mark"
                  data-domain={entry.domain}
                  className="mx-auto rounded-full border border-dashed border-border px-3 py-1 text-2xs text-muted-foreground"
                >
                  {t('domainMark', { domain: t(`domainName.${entry.domain}`) })}
                </p>
              )
          }
        })}

        {status === 'error' ? (
          <p
            data-testid="operator-error"
            className="rounded-lg border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-2xs text-destructive"
          >
            {errorText ?? t('error.generic')}
          </p>
        ) : null}
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
              className="rounded-full border border-primary/30 bg-background px-2.5 py-1 text-2xs text-primary transition-colors duration-fast ease-standard hover:bg-primary/10"
            >
              {t(`suggestion.${suggestion.id}`)}
            </button>
          ))}
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

      {/* ── 输入区：上行工具条 + 下行输入（拍板 12）──────────────── */}
      <div className="flex shrink-0 flex-col gap-1.5 border-t border-border/60 bg-background/95 px-3 py-2.5">
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
              'grid size-7 place-items-center rounded-lg border border-border/70 text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground',
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
          <span className="flex-1" />
          {working ? (
            <button
              type="button"
              data-testid="operator-stop"
              aria-label={t('stop')}
              title={t('stop')}
              onClick={stop}
              className="grid size-7 place-items-center rounded-lg border border-destructive/40 bg-destructive/5 text-destructive transition-colors duration-fast ease-standard hover:bg-destructive/10"
            >
              <Square className="size-3" aria-hidden />
            </button>
          ) : null}
        </div>
        <div className="flex items-end gap-2">
          <textarea
            data-testid="operator-input"
            value={draft}
            rows={1}
            onChange={(event) => onDraftChange(event.target.value)}
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
              working ? t('placeholderWorking') : t('placeholderIdle')
            }
            className="max-h-24 min-h-9 flex-1 resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-xs outline-none transition-colors duration-fast ease-standard placeholder:text-muted-foreground/70 focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
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
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition-colors duration-fast ease-standard hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? (
              <Spinner size="sm" className="text-primary-foreground" />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
          </button>
        </div>
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
