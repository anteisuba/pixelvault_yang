'use client'

import { useId, useMemo, useRef, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ChevronDown, PencilLine, Plus, X } from '@/components/icons'

import {
  ASSISTANT_MEMORY_LIMITS,
  ASSISTANT_MEMORY_SCOPE_IDS,
  ASSISTANT_MEMORY_SCOPES,
  ASSISTANT_MEMORY_SOURCE_IDS,
  type AssistantMemoryScopeId,
  type AssistantMemorySourceId,
} from '@/constants/assistant-memory'
import {
  PROJECT_RULE_KIND_IDS,
  PROJECT_RULE_SOURCE_KINDS,
} from '@/constants/assistant-operator'
import { DURATION, EASE_STANDARD } from '@/constants/motion'
import type { UseAssistantMemoriesValue } from '@/hooks/use-assistant-memories'
import type { UseAssistantPersonaAutosaveValue } from '@/hooks/use-assistant-persona'
import { useProjectRules } from '@/hooks/use-project-rules'
import { getApiErrorMessage } from '@/lib/api-error-message'
import { cn } from '@/lib/utils'
import type { AssistantMemory } from '@/types/assistant-memory'
import { ProjectRuleSourceTokenSchema } from '@/types/assistant-persona'
import { getChipZoomMotion } from '@/components/business/studio-shared/primitives/tool-surface'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'

/**
 * 记忆页（助手设置 B · M-A，画板「助手设置 B · 全部状态」记忆那四块）。
 *
 * ⭐ **一列**（owner 2026-09-26「这次就并成一列」）：助手在对话里记下的和你自己
 * 写的都在这里，每行标「你写的 / 助手记的」；你写的优先（进系统提示的规则段）。
 * 顶上一行说明 +「让助手记住」开关（关 = 只停记新的，清单照样生效）；下面一格
 * 「写一条，回车存下」；筛选三颗 chip，清空跟着筛选走。
 * 搜图来源白 / 黑名单在下面单独一块 —— 它们是闸，不是一句话。
 */

type MemoryFilter = 'all' | AssistantMemorySourceId

const MEMORY_FILTERS: readonly MemoryFilter[] = [
  'all',
  ASSISTANT_MEMORY_SOURCE_IDS.creator,
  ASSISTANT_MEMORY_SOURCE_IDS.assistant,
]

/** 「用在哪」下拉的次序：全部工作台在最前（画板）。 */
const SCOPE_MENU: readonly AssistantMemoryScopeId[] = [
  ASSISTANT_MEMORY_SCOPE_IDS.global,
  ...ASSISTANT_MEMORY_SCOPES.filter(
    (scope) => scope !== ASSISTANT_MEMORY_SCOPE_IDS.global,
  ),
]

/** 菜单与确认卡都「从按钮长出来」（动效表：与工具行弹层同一种）。 */
const MENU_MOTION = getChipZoomMotion({
  side: 'bottom',
  align: 'end',
  sideOffset: 6,
})

export function AssistantMemoryPane({
  memories,
  autosave,
}: {
  memories: UseAssistantMemoriesValue
  autosave: UseAssistantPersonaAutosaveValue
}) {
  return (
    <div className="flex flex-col gap-7 @container">
      <MemorySection store={memories} autosave={autosave} />
      <SourceListSection />
    </div>
  )
}

function MemorySection({
  store,
  autosave,
}: {
  store: UseAssistantMemoriesValue
  autosave: UseAssistantPersonaAutosaveValue
}) {
  const t = useTranslations('AssistantSettings')
  const tErrors = useTranslations('Errors')
  const reducedMotion = useReducedMotion()
  const captureId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const { memories, isLoading, error, create, update, remove, clear } = store
  const capture = autosave.draft.memoryCapture

  const [draft, setDraft] = useState('')
  const [creating, setCreating] = useState(false)
  const [filter, setFilter] = useState<MemoryFilter>('all')
  const [freshId, setFreshId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [clearOpen, setClearOpen] = useState(false)
  /**
   * 删 / 清空之后行还在退场（动效表：一起淡出再收起）。退完之前 ⛔ 不出空态、
   * 不出「这一类还没有」；清空的那一次退完才把筛选归到「全部」（画板）。
   */
  const [settling, setSettling] = useState<false | 'delete' | 'clear'>(false)

  const mine = memories.filter(
    (memory) => memory.source === ASSISTANT_MEMORY_SOURCE_IDS.creator,
  ).length
  const theirs = memories.length - mine
  const shown = useMemo(
    () =>
      filter === 'all'
        ? memories
        : memories.filter((memory) => memory.source === filter),
    [filter, memories],
  )

  const pickFilter = (next: MemoryFilter) => {
    setFilter(next)
    setClearOpen(false)
    setConfirmingId(null)
    setFreshId(null)
  }

  const submit = async () => {
    const text = draft.trim()
    if (!text || creating) return
    setCreating(true)
    const memory = await create({ text })
    setCreating(false)
    if (!memory) return
    setDraft('')
    setFreshId(memory.id)
    // 筛着「助手记的」时新写的那条看不见 —— 回到全部（画板）。
    if (filter === ASSISTANT_MEMORY_SOURCE_IDS.assistant) setFilter('all')
  }

  const confirmClear = async () => {
    setClearOpen(false)
    setSettling('clear')
    const ok = await clear(filter === 'all' ? undefined : filter)
    if (!ok) setSettling(false)
  }

  const deleteMemory = async (memoryId: string) => {
    setConfirmingId(null)
    setSettling('delete')
    const ok = await remove(memoryId)
    if (!ok) setSettling(false)
  }

  const clearLabel = t(`memory.clear.${filter}`)
  const clearTitle =
    filter === 'all'
      ? t('memory.clear.titleAll', { count: memories.length })
      : filter === ASSISTANT_MEMORY_SOURCE_IDS.creator
        ? t('memory.clear.titleCreator', { count: mine })
        : t('memory.clear.titleAssistant', { count: theirs })
  const clearDescription =
    filter === 'all'
      ? mine > 0
        ? t('memory.clear.descAllWithMine', { count: mine })
        : t('memory.clear.descAll')
      : filter === ASSISTANT_MEMORY_SOURCE_IDS.creator
        ? t('memory.clear.descCreator')
        : t('memory.clear.descAssistant')

  const errorText = error
    ? getApiErrorMessage(
        tErrors,
        error.i18nKey ? { i18nKey: error.i18nKey } : {},
        t('memory.failed'),
      )
    : null

  const rowTransition = reducedMotion
    ? { duration: 0 }
    : {
        height: { duration: DURATION.slow, ease: EASE_STANDARD },
        opacity: { duration: DURATION.base, ease: EASE_STANDARD },
      }
  const rowExit = reducedMotion
    ? { opacity: 0, height: 0, transition: { duration: 0 } }
    : {
        opacity: 0,
        height: 0,
        transition: {
          opacity: { duration: DURATION.fast, ease: 'linear' as const },
          height: { duration: DURATION.base, ease: EASE_STANDARD },
        },
      }

  return (
    <section aria-label={t('tabs.memory')} className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 @md:flex-nowrap">
        <p className="basis-full text-2sm leading-5 text-muted-foreground @md:basis-auto @md:flex-1">
          {capture ? t('memory.caption') : t('memory.captionPaused')}
        </p>
        <label
          htmlFor={captureId}
          className="text-2sm font-medium text-muted-foreground"
        >
          {t('memory.capture')}
        </label>
        <Switch
          id={captureId}
          size="lg"
          data-testid="assistant-memory-capture"
          checked={capture}
          onCheckedChange={(memoryCapture) => autosave.apply({ memoryCapture })}
        />
      </div>

      <Input
        ref={inputRef}
        data-testid="assistant-memory-new"
        value={draft}
        maxLength={ASSISTANT_MEMORY_LIMITS.maxTextChars}
        aria-label={t('memory.newLabel')}
        placeholder={t('memory.newPlaceholder')}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setDraft('')
            return
          }
          if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
          event.preventDefault()
          void submit()
        }}
        className="h-10 rounded-lg text-base md:text-md coarse:h-11"
      />

      {errorText ? (
        <p role="alert" className="text-2sm text-status-risk">
          {errorText}
        </p>
      ) : null}

      {memories.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <div
            role="group"
            aria-label={t('memory.filters.label')}
            className="flex flex-wrap items-center gap-1.5"
          >
            {MEMORY_FILTERS.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={filter === id}
                data-testid={`assistant-memory-filter-${id}`}
                onClick={() => pickFilter(id)}
                className={cn(
                  'inline-flex h-7 items-center rounded-full border px-2.75 text-2sm whitespace-nowrap transition-colors duration-fast ease-linear focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none coarse:h-8.5 coarse:px-3.25',
                  filter === id
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-muted-foreground hover:bg-surface-fill hover:text-foreground',
                )}
              >
                {t(`memory.filters.${id}`)}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          {shown.length > 0 ? (
            <Popover open={clearOpen} onOpenChange={setClearOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  data-testid="assistant-memory-clear"
                  onClick={() => setConfirmingId(null)}
                  className="-mx-2 -my-1 rounded-lg px-2 py-1 text-2sm text-muted-foreground transition-colors duration-fast ease-linear hover:bg-surface-fill hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none coarse:-my-3 coarse:py-3 coarse:text-md"
                >
                  {clearLabel}
                </button>
              </PopoverTrigger>
              <PopoverContent
                role="alertdialog"
                aria-label={clearTitle}
                align="end"
                sideOffset={6}
                className={cn(
                  'flex w-75 flex-col gap-1.5 rounded-2xl p-4',
                  MENU_MOTION.className,
                )}
                style={MENU_MOTION.style}
              >
                <p className="text-md font-semibold">{clearTitle}</p>
                <p className="text-2sm leading-5 text-muted-foreground">
                  {clearDescription}
                </p>
                <div className="mt-2 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8.5 rounded-lg shadow-none"
                    onClick={() => setClearOpen(false)}
                  >
                    {t('memory.clear.cancel')}
                  </Button>
                  <Button
                    type="button"
                    data-testid="assistant-memory-clear-confirm"
                    className="h-8.5 rounded-lg bg-status-risk font-semibold text-background hover:bg-status-risk/90"
                    onClick={() => void confirmClear()}
                  >
                    {clearLabel}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          ) : null}
        </div>
      ) : null}

      {/* 换筛选 = 换一张清单（按 key 整张换，⛔ 不逐行淡入淡出）。 */}
      <ul key={filter} className="flex flex-col">
        <AnimatePresence
          initial={false}
          onExitComplete={() => {
            if (settling === 'clear') setFilter('all')
            setSettling(false)
          }}
        >
          {shown.map((memory) => (
            <motion.li
              key={memory.id}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={rowExit}
              transition={rowTransition}
              data-testid="assistant-memory-row"
              className={cn(
                'overflow-hidden border-t border-border/60 last:border-b',
                freshId === memory.id && 'motion-safe:animate-row-fresh',
              )}
            >
              <MemoryRow
                memory={memory}
                editing={editingId === memory.id}
                confirming={confirmingId === memory.id}
                onStartEdit={() => {
                  setEditingId(memory.id)
                  setConfirmingId(null)
                  setClearOpen(false)
                }}
                onEndEdit={() => setEditingId(null)}
                onSave={(input) => update(memory.id, input)}
                onAskDelete={() => {
                  setConfirmingId(memory.id)
                  setClearOpen(false)
                }}
                onCancelDelete={() => setConfirmingId(null)}
                onDelete={() => void deleteMemory(memory.id)}
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      {memories.length > 0 && shown.length === 0 && !settling ? (
        <p className="text-2sm text-muted-foreground">
          {t('memory.filteredEmpty')}
        </p>
      ) : null}

      {memories.length === 0 && !settling ? (
        isLoading ? (
          <p className="text-2sm text-muted-foreground">
            {t('memory.loading')}
          </p>
        ) : (
          <EmptyState
            className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-base"
            icon={<PencilLine aria-hidden />}
            title={t('memory.emptyTitle')}
            description={t('memory.emptyDescription')}
            action={
              <Button
                type="button"
                size="sm"
                className="rounded-full"
                onClick={() => inputRef.current?.focus()}
              >
                {t('memory.emptyAction')}
              </Button>
            }
          />
        )
      ) : null}
    </section>
  )
}

/**
 * 一行 = 一条记忆（画板 M-A）。
 *
 * 默认：文字（点一下就地改）· 行尾「范围标签 + 你写的 / 助手记的 · 时间」·
 * 悬停出「删」（触屏常显）。点「删」原地变红「确认删除」，再点才删（⛔ 不弹框）。
 * 就地改：输入框 + 右边「用在哪」下拉，下面一行提示；回车存、Esc 退、点到别处也存。
 * 选「用在哪」当场存（改了就存）。
 */
function MemoryRow({
  memory,
  editing,
  confirming,
  onStartEdit,
  onEndEdit,
  onSave,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  memory: AssistantMemory
  editing: boolean
  confirming: boolean
  onStartEdit(): void
  onEndEdit(): void
  onSave(input: {
    text?: string
    scope?: AssistantMemoryScopeId
  }): Promise<AssistantMemory | null>
  onAskDelete(): void
  onCancelDelete(): void
  onDelete(): void
}) {
  const t = useTranslations('AssistantSettings')
  const [draft, setDraft] = useState(memory.text)
  const [scopeOpen, setScopeOpen] = useState(false)
  /**
   * Esc 之后那一拍的 blur **不许当成保存**。⚠ 走 ref：`onEndEdit` 要到下一次
   * 渲染才生效，而 blur 就在这一拍紧接着发生。
   */
  const cancelledRef = useRef(false)
  const rowRef = useRef<HTMLDivElement>(null)

  const startEdit = () => {
    setDraft(memory.text)
    onStartEdit()
  }

  const finish = () => {
    const cancelled = cancelledRef.current
    cancelledRef.current = false
    onEndEdit()
    const text = draft.trim()
    if (cancelled || !text || text === memory.text) return
    void onSave({ text })
  }

  const scopeLabel = t(`memory.scope.${memory.scope}`)

  if (editing) {
    return (
      <div
        ref={rowRef}
        className="flex flex-col gap-1.5 pt-2 pb-2.5"
        onBlur={(event) => {
          // 焦点还在这一行里（输入框 ↔ 下拉按钮），或者下拉正开着 —— 不算离开。
          if (scopeOpen) return
          const next = event.relatedTarget
          if (next instanceof Node && rowRef.current?.contains(next)) return
          finish()
        }}
      >
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            value={draft}
            maxLength={ASSISTANT_MEMORY_LIMITS.maxTextChars}
            aria-label={t('memory.editLabel')}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault()
                finish()
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                cancelledRef.current = true
                finish()
              }
            }}
            className="h-9 flex-1 rounded-lg text-base md:text-md coarse:h-11"
          />
          <DropdownMenu open={scopeOpen} onOpenChange={setScopeOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t('memory.scopeAria', { scope: scopeLabel })}
                data-testid="assistant-memory-scope"
                className="flex h-9 w-34 shrink-0 items-center gap-2 rounded-lg border border-input pr-2.5 pl-3 text-left text-sm transition-colors duration-fast ease-linear hover:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none data-[state=open]:border-foreground coarse:h-11"
              >
                <span className="min-w-0 flex-1 truncate">{scopeLabel}</span>
                <ChevronDown
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={6}
              aria-label={t('memory.scopeLabel')}
              className={cn('w-44 rounded-xl p-1.5', MENU_MOTION.className)}
              style={MENU_MOTION.style}
              onCloseAutoFocus={(event) => {
                // 关下拉后焦点回到输入框：用户接着改字，而不是停在按钮上。
                event.preventDefault()
                rowRef.current?.querySelector('input')?.focus()
              }}
            >
              <DropdownMenuRadioGroup
                value={memory.scope}
                onValueChange={(value) => {
                  const scope = value as AssistantMemoryScopeId
                  if (scope !== memory.scope) void onSave({ scope })
                }}
              >
                {SCOPE_MENU.map((scope) => (
                  <DropdownMenuRadioItem
                    key={scope}
                    value={scope}
                    indicator="check-end"
                    className="min-h-9 rounded-lg coarse:min-h-11"
                  >
                    {t(`memory.scope.${scope}`)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <p className="text-2sm text-muted-foreground">{t('memory.editHint')}</p>
      </div>
    )
  }

  return (
    <div className="group flex min-h-11 items-center gap-3 coarse:min-h-13">
      <button
        type="button"
        onClick={startEdit}
        aria-label={t('memory.edit', { text: memory.text })}
        className="min-w-0 flex-1 cursor-text rounded-md py-2.75 text-left text-sm leading-5.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {memory.text}
      </button>
      <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
        {memory.scope !== ASSISTANT_MEMORY_SCOPE_IDS.global ? (
          <span className="inline-flex h-5 items-center rounded-md bg-surface-fill px-1.5 text-2xs whitespace-nowrap text-foreground/75">
            {scopeLabel}
          </span>
        ) : null}
        <MemoryMeta memory={memory} />
      </span>
      <button
        type="button"
        aria-label={
          confirming ? t('memory.deleteConfirmAria') : t('memory.deleteAria')
        }
        data-testid="assistant-memory-delete"
        onClick={confirming ? onDelete : onAskDelete}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && confirming) onCancelDelete()
        }}
        onBlur={() => {
          if (confirming) onCancelDelete()
        }}
        className={cn(
          'h-7 shrink-0 rounded-lg px-2.5 text-2sm transition-[opacity,background-color,color] duration-fast ease-linear focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none coarse:h-9 coarse:opacity-100',
          confirming
            ? 'bg-status-risk font-semibold text-background opacity-100'
            : 'text-status-risk opacity-0 group-hover:opacity-100 hover:bg-status-risk-surface',
        )}
      >
        {confirming ? t('memory.deleteConfirm') : t('memory.delete')}
      </button>
    </div>
  )
}

/** 一天的毫秒数 —— 只给下面那个「今天 / 昨天」的日差用。 */
const MS_PER_DAY = 86_400_000

/**
 * 行尾那一小行：「你写的 · 今天 14:20」（画板：今天 HH:mm · 昨天 · MM-DD）。
 *
 * ⚠ 判据是**日差**不是 24 小时差：昨天 23:50 与今天 00:10 差 20 分钟，按小时算
 * 会写成「今天」。判法与 `StudioOperatorHeader` 里那一份逐字同源。
 */
function MemoryMeta({ memory }: { memory: AssistantMemory }) {
  const t = useTranslations('AssistantSettings')
  const format = useFormatter()
  const date = new Date(memory.updatedAt)
  const source = t(`memory.source.${memory.source}`)
  if (Number.isNaN(date.getTime())) return <span>{source}</span>

  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const days = Math.round(
    (startOfDay(new Date()) - startOfDay(date)) / MS_PER_DAY,
  )
  const time =
    days <= 0
      ? t('memory.today', {
          time: format.dateTime(date, { hour: '2-digit', minute: '2-digit' }),
        })
      : days === 1
        ? t('memory.yesterday')
        : format.dateTime(date, { month: '2-digit', day: '2-digit' })

  return (
    <time dateTime={memory.updatedAt} className="tabular-nums">
      {t('memory.meta', { source, time })}
    </time>
  )
}

/**
 * 搜图来源白 / 黑名单（v2 §9.3）—— 搜图时服务端直接按名单过滤，⛔ 不靠助手自觉。
 * 每类一行：已有的是可移除的 chip，末尾「+ 添加」点开就地写一个站点。
 */
function SourceListSection() {
  const t = useTranslations('AssistantSettings')
  const tErrors = useTranslations('Errors')
  const rules = useProjectRules()
  const [invalid, setInvalid] = useState(false)

  const errorText = invalid
    ? t('sources.invalid')
    : rules.error
      ? getApiErrorMessage(
          tErrors,
          rules.error.i18nKey ? { i18nKey: rules.error.i18nKey } : {},
          t('sources.failed'),
        )
      : null

  return (
    <section
      aria-labelledby="assistant-sources-title"
      className="flex flex-col gap-3.5"
    >
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h2
          id="assistant-sources-title"
          className="text-2sm font-semibold text-muted-foreground"
        >
          {t('sources.title')}
        </h2>
        <p className="text-2sm text-muted-foreground">{t('sources.caption')}</p>
      </div>
      {PROJECT_RULE_SOURCE_KINDS.map((kind) => (
        <SourceListRow
          key={kind}
          label={
            kind === PROJECT_RULE_KIND_IDS.sourceAllow
              ? t('sources.allow')
              : t('sources.deny')
          }
          tokens={rules.rules
            .filter((rule) => rule.kind === kind)
            .map((rule) => ({ id: rule.id, text: rule.text }))}
          onAdd={async (raw) => {
            const token = ProjectRuleSourceTokenSchema.safeParse(raw)
            if (!token.success) {
              setInvalid(true)
              return false
            }
            setInvalid(false)
            return rules.add({ text: token.data, kind })
          }}
          onRemove={(id) => void rules.remove(id)}
          onTyping={() => setInvalid(false)}
        />
      ))}
      {errorText ? (
        <p role="alert" className="text-2sm text-status-risk">
          {errorText}
        </p>
      ) : null}
    </section>
  )
}

function SourceListRow({
  label,
  tokens,
  onAdd,
  onRemove,
  onTyping,
}: {
  label: string
  tokens: readonly { id: string; text: string }[]
  onAdd(raw: string): Promise<boolean>
  onRemove(id: string): void
  onTyping(): void
}) {
  const t = useTranslations('AssistantSettings')
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const close = () => {
    setAdding(false)
    setDraft('')
  }

  const submit = async () => {
    const raw = draft.trim()
    if (!raw) {
      close()
      return
    }
    if (await onAdd(raw)) close()
  }

  const chip =
    'inline-flex h-7 items-center gap-1.5 rounded-full border border-border px-2.75 text-2sm whitespace-nowrap coarse:h-8.5 coarse:px-3.25'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-full shrink-0 text-2sm text-muted-foreground @md:w-24">
        {label}
      </span>
      {tokens.map((token) => (
        <span key={token.id} className={cn(chip, 'pr-1 text-foreground/80')}>
          {token.text}
          <button
            type="button"
            aria-label={t('sources.remove', { token: token.text })}
            onClick={() => onRemove(token.id)}
            className="grid size-4.5 place-items-center rounded-full text-muted-foreground transition-colors duration-fast ease-linear hover:bg-surface-fill hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none coarse:size-7"
          >
            <X className="size-2.5" aria-hidden />
          </button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          value={draft}
          aria-label={t('sources.addLabel')}
          placeholder={t('sources.placeholder')}
          onChange={(event) => {
            setDraft(event.target.value)
            onTyping()
          }}
          onBlur={() => void submit()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault()
              void submit()
            }
            if (event.key === 'Escape') close()
          }}
          className={cn(
            chip,
            'w-48 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-foreground md:text-2sm',
          )}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className={cn(
            chip,
            'text-muted-foreground transition-colors duration-fast ease-linear hover:bg-surface-fill hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          )}
        >
          <Plus className="size-3" aria-hidden />
          {t('sources.add')}
        </button>
      )}
    </div>
  )
}
