'use client'

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Copy, Plus } from '@/components/icons'

import { API_ENDPOINTS, getAppOrigin } from '@/constants/config'
import {
  buildClaudeCodeMcpCommand,
  MCP_ACTIVE_WINDOW_MS,
  MCP_MAX_ACTIVE_TOKENS,
  MCP_TOKEN_DEFAULT_NAME,
  MCP_TOKEN_NAME_MAX_LENGTH,
} from '@/constants/mcp'
import {
  COPIED_ACK_MS,
  DURATION,
  EASE_STANDARD,
  LIQUID_TIMING,
  springTransition,
} from '@/constants/motion'
import type { CreatedMcpToken, McpTokenRecord } from '@/types/mcp'
import { useMcpTokens } from '@/hooks/use-mcp-tokens'
import { toastSuccess } from '@/lib/toast'
import { cn } from '@/lib/utils'

import { useBlurSwapIn } from '@/components/ui/blur-swap'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  FeedbackButton,
  useButtonFeedback,
} from '@/components/ui/feedback-button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'

/**
 * `/settings/connections`（第 0 片令牌入口，owner 2026-10-07 照小样
 * `DqB6AofEnuSAc3uLAPMdqG` 定）—— 让 Claude Code 经 MCP 进来读写画布项目。
 *
 * 与 API key 方向相反：那边是你去用别家的模型，这边是让 Claude 进来用你的项目。
 * 一块「Claude Code」：生成键 → 列表顶上一行填名字 → 刚生成那张卡给明文与
 * 填好令牌的接入命令（**只此一次**）→「我复制好了」收成普通一行。
 * ⛔ 不放 Claude.ai 连接器的占位：那一块做出来（mcp.md S7）才出现在这一页。
 *
 * 动效（owner 2026-10-08 设置页原型 v1）：虚线那一行**长高**出来；回车后同一格长成
 * 黑框卡（糊一下换进来）；「我复制好了」同一格收回普通一行；吊销过正中弹窗，那一行
 * 收起高度、糊掉，底部黑条说一句。⚠ 「同一格」靠同一个 key：填名字那一行的 key
 * 生成后交给新令牌那一行（`slot`），所以三个样子是一个元素在变，⛔ 不是一个走一个来。
 */
export function SettingsConnectionsSection() {
  const t = useTranslations('Settings')
  const { tokens, isLoading, failure, create, revoke, reload } = useMcpTokens()
  const reduceMotion = useReducedMotion()
  const [naming, setNaming] = useState<{ focus: boolean } | null>(null)
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<CreatedMcpToken | null>(null)
  /**
   * 「同一格」：填名字那一行的 key，生成之后交给新令牌那一行（`tokenId`），
   * 好让虚线行 → 黑框卡 → 普通一行是同一个元素长高 / 收回。
   */
  const [slot, setSlot] = useState<{
    key: string
    tokenId: string | null
  } | null>(null)
  const slotCount = useRef(0)
  const [now] = useState(() => Date.now())

  const isFull = tokens.length >= MCP_MAX_ACTIVE_TOKENS
  const grow = springTransition('slot', reduceMotion)
  const motionProps = {
    initial: reduceMotion ? false : { height: 0, opacity: 0 },
    animate: { height: 'auto', opacity: 1 },
    exit: reduceMotion
      ? { opacity: 0, transition: { duration: 0 } }
      : {
          height: 0,
          opacity: 0,
          filter: `blur(${LIQUID_TIMING.blurPx}px)`,
          // ⛔ 移除不走弹簧（ui-defaults §4.1）。
          transition: { duration: DURATION.slow, ease: EASE_STANDARD },
        },
    transition: {
      height: grow,
      opacity: {
        duration: reduceMotion ? 0 : DURATION.base,
        ease: EASE_STANDARD,
      },
    },
  }

  const openNaming = useCallback(() => {
    setCreated(null)
    slotCount.current += 1
    setSlot({ key: `slot-${slotCount.current}`, tokenId: null })
    // 触屏上不自动聚焦：一聚焦就弹键盘、盖住刚长出来的那一行（forbidden.md UI）。
    setNaming({ focus: window.matchMedia('(pointer: fine)').matches })
  }, [])

  const cancelNaming = useCallback(() => {
    setNaming(null)
    setSlot(null)
  }, [])

  const submitName = useCallback(
    async (name: string) => {
      setCreating(true)
      const result = await create(name.trim() || MCP_TOKEN_DEFAULT_NAME)
      setCreating(false)
      if (!result) return
      setSlot((current) =>
        current ? { ...current, tokenId: result.id } : current,
      )
      setNaming(null)
      setCreated(result)
    },
    [create],
  )

  const revokeToken = useCallback(
    async (token: McpTokenRecord) => {
      if (await revoke(token.id)) {
        toastSuccess(t('connections.revoked', { name: token.name }))
      }
    },
    [revoke, t],
  )

  const showList = !(isLoading && tokens.length === 0) && failure !== 'load'
  const hasRows = Boolean(naming || created || tokens.length > 0)

  return (
    <section className="@container">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">{t('sections.connections')}</h2>
        <p className="text-xs text-muted-foreground">
          {t('connections.caption')}
        </p>
      </header>

      <div className="mt-5 flex flex-col gap-3 @md:flex-row @md:items-start">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">
            {t('connections.claudeCode.title')}
          </h3>
          <p className="mt-0.5 text-2sm leading-relaxed text-muted-foreground">
            {t('connections.claudeCode.description')}
          </p>
        </div>
        <Button
          size="sm"
          className="w-full coarse:h-11 @md:w-auto"
          disabled={isFull || naming !== null || !showList}
          onClick={openNaming}
        >
          <Plus />
          {t('connections.create')}
        </Button>
      </div>
      {isFull ? (
        <p className="mt-1.5 text-xs text-muted-foreground @md:text-right">
          {t('connections.limit', { count: MCP_MAX_ACTIVE_TOKENS })}
        </p>
      ) : null}
      {failure && failure !== 'load' ? (
        <p role="alert" className="mt-2 text-xs text-status-risk">
          {t(`connections.failed.${failure}`, { count: MCP_MAX_ACTIVE_TOKENS })}
        </p>
      ) : null}

      {isLoading && tokens.length === 0 ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-border px-4 py-6 text-sm text-muted-foreground">
          <Spinner size="md" />
          {t('connections.loading')}
        </div>
      ) : null}

      {failure === 'load' && tokens.length === 0 && !isLoading ? (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-border px-4 py-3.5 text-sm">
          <span className="flex-1 text-status-risk">
            {t('connections.failed.load')}
          </span>
          <Button variant="outline" size="sm" onClick={() => void reload()}>
            {t('connections.retry')}
          </Button>
        </div>
      ) : null}

      {showList && !hasRows ? (
        <p className="mt-3 rounded-lg border border-dashed border-border px-4 py-6 text-center text-2sm leading-relaxed text-muted-foreground">
          {t('connections.empty')}
        </p>
      ) : null}

      {showList && hasRows ? (
        <ul className="mt-3 flex flex-col">
          <AnimatePresence initial={false}>
            {naming && slot && slot.tokenId === null ? (
              <motion.li key={slot.key} {...motionProps}>
                <GrowingSlot swapKey="naming">
                  <NamingRow
                    autoFocus={naming.focus}
                    busy={creating}
                    onSubmit={(name) => void submitName(name)}
                    onCancel={cancelNaming}
                  />
                </GrowingSlot>
              </motion.li>
            ) : null}
            {tokens.map((token) => {
              const isSlot = slot?.tokenId === token.id
              const isFresh = created?.id === token.id
              return (
                <motion.li
                  key={isSlot && slot ? slot.key : token.id}
                  {...motionProps}
                >
                  <GrowingSlot swapKey={isFresh ? 'created' : 'row'}>
                    {isFresh && created ? (
                      <CreatedCard
                        created={created}
                        onDone={() => setCreated(null)}
                      />
                    ) : (
                      <TokenRow
                        token={token}
                        now={now}
                        onRevoke={() => void revokeToken(token)}
                      />
                    )}
                  </GrowingSlot>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      ) : null}
    </section>
  )
}

/**
 * 一格里换样子（虚线行 → 黑框卡 → 普通一行）时，高度从旧的弹簧到新的（`SPRING.slot`），
 * 新内容糊一下进来。量的是里面那层的真实高度，⛔ 不用 `layout`（scale 会把字压扁）。
 * 底下留 8px 当行距：放在格子里而不是 `ul` 的 gap 上，收起时行距跟着一起收。
 */
function GrowingSlot({
  swapKey,
  children,
}: {
  swapKey: string
  children: ReactNode
}) {
  const reduceMotion = useReducedMotion()
  const innerRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | 'auto'>('auto')
  const swap = useBlurSwapIn(swapKey)

  useLayoutEffect(() => {
    const inner = innerRef.current
    if (!inner || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setHeight(inner.offsetHeight))
    observer.observe(inner)
    return () => observer.disconnect()
  }, [])

  return (
    <motion.div
      initial={false}
      animate={{ height }}
      transition={springTransition('slot', reduceMotion)}
      className="overflow-hidden"
    >
      <div ref={innerRef} className="pb-2">
        <motion.div key={swapKey} {...swap}>
          {children}
        </motion.div>
      </div>
    </motion.div>
  )
}

function NamingRow({
  autoFocus,
  busy,
  onSubmit,
  onCancel,
}: {
  autoFocus: boolean
  busy: boolean
  onSubmit: (name: string) => void
  onCancel: () => void
}) {
  const t = useTranslations('Settings')
  const [name, setName] = useState(MCP_TOKEN_DEFAULT_NAME)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!autoFocus) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [autoFocus])

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (!busy) onSubmit(name)
      }}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-card px-3.5 py-3"
    >
      <span
        className="size-2 shrink-0 rounded-full bg-muted-foreground/25"
        aria-hidden
      />
      <Input
        ref={inputRef}
        value={name}
        maxLength={MCP_TOKEN_NAME_MAX_LENGTH}
        aria-label={t('connections.nameLabel')}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel()
        }}
        className="h-8 min-w-40 flex-1 coarse:h-11"
      />
      <Button type="submit" size="sm" disabled={busy} className="coarse:h-11">
        {busy ? <Spinner size="sm" /> : null}
        {t('connections.generate')}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onCancel}
        className="coarse:h-11"
      >
        {t('connections.cancel')}
      </Button>
      <p className="w-full pl-5 text-xs text-muted-foreground">
        {t('connections.nameHint')}
      </p>
    </form>
  )
}

function CreatedCard({
  created,
  onDone,
}: {
  created: CreatedMcpToken
  onDone: () => void
}) {
  const t = useTranslations('Settings')
  const command = buildClaudeCodeMcpCommand(
    `${getAppOrigin()}${API_ENDPOINTS.MCP}`,
    created.token,
  )

  return (
    <div className="grid gap-2.5 rounded-lg border border-foreground bg-card p-3.5">
      <div className="flex flex-wrap items-baseline gap-2.5">
        <span className="text-sm font-medium">
          {t('connections.created.title', { name: created.name })}
        </span>
        <span className="rounded-full bg-status-warning-surface px-2 text-xs text-status-warning">
          {t('connections.created.once')}
        </span>
      </div>
      <CodeLine
        label={t('connections.created.tokenLabel')}
        value={created.token}
        copyLabel={t('connections.copy')}
      />
      <CodeLine
        label={t('connections.created.commandLabel')}
        value={command}
        copyLabel={t('connections.copyCommand')}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {t('connections.created.verify')}
        </p>
        <Button
          size="sm"
          onClick={onDone}
          className="w-full coarse:h-11 @md:w-auto"
        >
          {t('connections.created.done')}
        </Button>
      </div>
    </div>
  )
}

function CodeLine({
  label,
  value,
  copyLabel,
}: {
  label: string
  value: string
  copyLabel: string
}) {
  const t = useTranslations('Settings')
  const { feedback, show } = useButtonFeedback(COPIED_ACK_MS)
  const codeRef = useRef<HTMLElement>(null)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      show({ label: t('connections.copied') })
    } catch {
      // 剪贴板被拒（权限 / 旧内核）时把那一串选中，让用户自己 ⌘C。
      const node = codeRef.current
      const selection = window.getSelection()
      if (!node || !selection) return
      const range = document.createRange()
      range.selectNodeContents(node)
      selection.removeAllRanges()
      selection.addRange(range)
    }
  }

  return (
    <div className="grid gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex min-w-0 items-center gap-2 rounded-md bg-muted py-1.5 pl-3 pr-1.5">
        <code
          ref={codeRef}
          className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap font-mono text-xs leading-relaxed text-foreground"
        >
          {value}
        </code>
        {/* 复制好了键自己拉长变黑写「✓ 已复制」（ui-defaults §7.1），⛔ 不弹 toast。 */}
        <FeedbackButton
          type="button"
          feedback={feedback}
          onClick={() => void copy()}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:h-11"
        >
          <Copy className="size-3.5" aria-hidden />
          {copyLabel}
        </FeedbackButton>
      </div>
    </div>
  )
}

function TokenRow({
  token,
  now,
  onRevoke,
}: {
  token: McpTokenRecord
  now: number
  onRevoke: () => void
}) {
  const t = useTranslations('Settings')
  const format = useFormatter()
  const lastUsed = token.lastUsedAt ? new Date(token.lastUsedAt) : null
  const live =
    lastUsed !== null && now - lastUsed.getTime() < MCP_ACTIVE_WINDOW_MS
  const usage = live
    ? t('connections.live')
    : lastUsed
      ? t('connections.usedAt', {
          stamp: format.relativeTime(lastUsed, new Date(now)),
        })
      : t('connections.neverUsed')
  const createdOn = t('connections.createdOn', {
    date: format.dateTime(new Date(token.createdAt), {
      month: 'numeric',
      day: 'numeric',
    }),
  })

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-card px-3.5 py-3 text-sm transition-colors duration-fast hover:border-muted-foreground/40">
      <span
        className={cn(
          'size-2 shrink-0 rounded-full',
          live ? 'bg-status-applied' : 'bg-muted-foreground/25',
        )}
        aria-hidden
      />
      <span className="min-w-0 truncate font-medium @md:min-w-28">
        {token.name}
      </span>
      <span className="font-mono text-xs text-muted-foreground">
        …{token.last4}
      </span>
      <span
        className={cn(
          'order-last basis-full pl-5 text-xs @md:order-none @md:flex-1 @md:basis-auto @md:pl-0',
          live ? 'text-status-applied' : 'text-muted-foreground',
        )}
      >
        {usage} · {createdOn}
      </span>
      <span className="flex-1 @md:hidden" aria-hidden />
      <ConfirmDialog
        trigger={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:bg-status-risk-surface hover:text-status-risk coarse:h-11"
          >
            {t('connections.revoke')}
          </Button>
        }
        title={t('connections.revokeDialog.title', { name: token.name })}
        description={t('connections.revokeDialog.description')}
        cancelLabel={t('connections.cancel')}
        confirmLabel={t('connections.revoke')}
        onConfirm={onRevoke}
      />
    </div>
  )
}
