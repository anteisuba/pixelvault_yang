'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { EyeOff, Sparkles, Trash2, X } from '@/components/icons'

import {
  ASSISTANT_MEMORY_FILTER_SCOPES,
  ASSISTANT_MEMORY_LIMITS,
  type AssistantMemoryScopeId,
} from '@/constants/assistant-memory'
import {
  ASSISTANT_PROJECT_RULE_LIMITS,
  PROJECT_RULE_KIND_IDS,
  PROJECT_RULE_KINDS,
  type ProjectRuleKindId,
} from '@/constants/assistant-operator'
import { SETTINGS_PREFERENCE_KEYS } from '@/constants/settings'
import type { UseAssistantMemoriesValue } from '@/hooks/use-assistant-memories'
import { useLocalPreference } from '@/hooks/use-local-preference'
import { useProjectRules } from '@/hooks/use-project-rules'
import { cn } from '@/lib/utils'
import type { AssistantMemory } from '@/types/assistant-memory'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

/**
 * 记忆页 —— 本片先把**现有的两块原样搬进来**（记忆清单 + 项目规则），外壳换成
 * 助手设置 B 的「人设 / 记忆」两页。并成一列（M-A）、「你写的 / 助手记的」、
 * 「让助手记住」在下一片。
 */
export function AssistantMemoryPane({
  memories,
}: {
  memories: UseAssistantMemoriesValue
}) {
  return (
    <div className="flex flex-col gap-7">
      <MemoryBlock memories={memories} />
      <RulesBlock />
    </div>
  )
}

/** 筛选 chip 的取值：`null` = 全部（默认那一档，⛔ 不是某个域）。 */
type MemoryFilter = AssistantMemoryScopeId | null

function MemoryBlock({
  memories: store,
}: {
  memories: UseAssistantMemoriesValue
}) {
  const t = useTranslations('Settings')
  const { memories, isLoading, error, update, remove, clearAll } = store
  const [filter, setFilter] = useState<MemoryFilter>(null)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [, setIncognito] = useLocalPreference(
    SETTINGS_PREFERENCE_KEYS.assistantIncognito,
  )

  /**
   * ⚠ **纯前端过滤**（画板）：一次全取，四颗 chip 之间不再打一次网。
   * ⚠ `global` 那些跟着「全部」出现，⛔ 不单独一颗 chip（见 constants 里那条）。
   */
  const visible = useMemo(
    () =>
      filter === null
        ? memories
        : memories.filter((memory) => memory.scope === filter),
    [filter, memories],
  )

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-2sm font-semibold text-muted-foreground">
          {t('assistant.memoryLabel')}
          {memories.length > 0 ? (
            <span className="ml-1.5 tabular-nums">{memories.length}</span>
          ) : null}
        </p>
        {memories.length > 0 ? (
          <button
            type="button"
            onClick={() => setConfirmingClear(true)}
            className="text-xs underline underline-offset-2 transition-colors duration-fast hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:min-h-11"
          >
            {t('assistant.memoryClearAll')}
          </button>
        ) : null}
      </div>

      {memories.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5" role="group">
          <FilterChip
            label={t('assistant.memoryScope.all')}
            isActive={filter === null}
            onClick={() => setFilter(null)}
          />
          {ASSISTANT_MEMORY_FILTER_SCOPES.map((scope) => (
            <FilterChip
              key={scope}
              label={t(`assistant.memoryScope.${scope}`)}
              isActive={filter === scope}
              onClick={() => setFilter(scope)}
            />
          ))}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {memories.length === 0 ? (
        <MemoryEmptyState
          isLoading={isLoading}
          onIncognito={() => setIncognito('1')}
        />
      ) : (
        <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
          {visible.map((memory) => (
            <MemoryRow
              key={memory.id}
              memory={memory}
              onSave={(text) => update(memory.id, text)}
              onDelete={() => remove(memory.id)}
            />
          ))}
        </ul>
      )}

      <AlertDialog open={confirmingClear} onOpenChange={setConfirmingClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('assistant.memoryClearTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('assistant.memoryClearDescription', {
                count: memories.length,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('assistant.memoryCancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void clearAll()}>
              {t('assistant.memoryClearConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function FilterChip({
  label,
  isActive,
  onClick,
}: {
  label: string
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={cn(
        'inline-flex h-7 items-center rounded-full px-2.5 text-xs transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring coarse:h-11',
        isActive
          ? 'bg-muted text-foreground'
          : 'border border-border text-muted-foreground hover:bg-accent',
      )}
    >
      {label}
    </button>
  )
}

/**
 * 空态（画板）：一句话说清会记什么、能改能删，加一个隐身入口。
 *
 * ⚠ 起手动作直接**切开关**而不是滚到一段说明：这一页上没有别的地方讲隐身，
 * 跳过去等于跳到自己。
 */
function MemoryEmptyState({
  isLoading,
  onIncognito,
}: {
  isLoading: boolean
  onIncognito: () => void
}) {
  const t = useTranslations('Settings')
  return (
    <EmptyState
      className="mt-2"
      icon={<Sparkles aria-hidden />}
      title={
        isLoading ? t('assistant.memoryLoading') : t('assistant.memoryEmpty')
      }
      description={t('assistant.memoryEmptyHint')}
      action={
        <Button
          type="button"
          size="sm"
          className="rounded-full"
          onClick={onIncognito}
        >
          <EyeOff className="size-3.5" aria-hidden />
          {t('assistant.memoryIncognitoCta')}
        </Button>
      }
    />
  )
}

/**
 * 一行 = 一条记忆。
 *
 * 三态：默认（文字 + 时间）· hover / focus（行尾出「删」）· 就地改（回车保存、
 * Esc 取消）。⛔ 改不弹层 —— 画板上那一下就是把文字变成可编辑。
 * ⚠ 触屏上「删」**常显**（`coarse:`，ui-defaults §6：hover 显示的操作在手机上
 * 要常显或长按菜单）。
 */
function MemoryRow({
  memory,
  onSave,
  onDelete,
}: {
  memory: AssistantMemory
  onSave(text: string): Promise<AssistantMemory | null>
  onDelete(): Promise<boolean>
}) {
  const t = useTranslations('Settings')
  const [draft, setDraft] = useState<string | null>(null)
  /**
   * Esc 按下之后那一拍的 blur **不许当成保存**。
   *
   * ⚠ 走 ref 不走 state：`setDraft(null)` 要到下一次渲染才生效，而 blur 就在
   * 这一拍紧接着发生 —— 只看 state 的表现是 Esc 把改坏的那一版存了进去。
   */
  const cancelledRef = useRef(false)

  const commit = useCallback(() => {
    const cancelled = cancelledRef.current
    cancelledRef.current = false
    const value = (draft ?? '').trim()
    setDraft(null)
    if (cancelled || !value || value === memory.text) return
    void onSave(value.slice(0, ASSISTANT_MEMORY_LIMITS.maxTextChars))
  }, [draft, memory.text, onSave])

  return (
    <li className="group flex items-center gap-2 px-3 py-2 coarse:min-h-11">
      {draft === null ? (
        <button
          type="button"
          onClick={() => setDraft(memory.text)}
          className="flex-1 text-left text-sm leading-snug focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {memory.text}
        </button>
      ) : (
        <input
          autoFocus
          type="text"
          value={draft}
          maxLength={ASSISTANT_MEMORY_LIMITS.maxTextChars}
          aria-label={t('assistant.memoryEditLabel')}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            // ⚠ Esc 只立起那面旗、让 blur 自己收尾（见 `cancelledRef` 的头注）。
            if (event.key === 'Escape') {
              cancelledRef.current = true
              event.currentTarget.blur()
            }
          }}
          className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      )}

      {draft === null ? (
        <>
          <time
            dateTime={memory.updatedAt}
            className="shrink-0 text-2xs tabular-nums text-muted-foreground group-hover:hidden group-focus-within:hidden coarse:hidden"
          >
            <MemoryStamp iso={memory.updatedAt} />
          </time>
          <button
            type="button"
            onClick={() => void onDelete()}
            aria-label={t('assistant.memoryDelete')}
            className="hidden size-7 shrink-0 place-items-center rounded-md border border-border text-muted-foreground transition-colors duration-fast hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:grid group-focus-within:grid coarse:grid coarse:size-11"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </>
      ) : (
        <span className="shrink-0 text-2xs text-muted-foreground">
          {t('assistant.memoryEditHint')}
        </span>
      )}
    </li>
  )
}

/** 一天的毫秒数 —— 只给下面那个「今天 / 昨天」的日差用。 */
const MS_PER_DAY = 86_400_000

/**
 * 时间戳（画板：今天 HH:mm · 昨天 · M/D）。
 *
 * ⚠ 判据是**日差**不是 24 小时差：昨天 23:50 与今天 00:10 差 20 分钟，按小时算
 * 会写成「今天」。判法与 `StudioOperatorHeader` 里那一份逐字同源。
 */
function MemoryStamp({ iso }: { iso: string }) {
  const t = useTranslations('Settings')
  const format = useFormatter()
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null

  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const days = Math.round(
    (startOfDay(new Date()) - startOfDay(date)) / MS_PER_DAY,
  )

  if (days <= 0) {
    return (
      <>
        {t('assistant.memoryToday', {
          time: format.dateTime(date, { hour: '2-digit', minute: '2-digit' }),
        })}
      </>
    )
  }
  if (days === 1) return <>{t('assistant.memoryYesterday')}</>
  return <>{format.dateTime(date, { month: 'numeric', day: 'numeric' })}</>
}

/**
 * 项目规则（原助手设置弹层的第二页，原样搬来）。下一片并进上面那一列。
 */
function RulesBlock() {
  const t = useTranslations('StudioOperator.persona')
  const tRule = useTranslations('StudioOperator.rule')
  const rules = useProjectRules()
  const [ruleDraft, setRuleDraft] = useState('')
  const [ruleKind, setRuleKind] = useState<ProjectRuleKindId>(
    PROJECT_RULE_KIND_IDS.note,
  )
  /** 同类相邻，组内仍是「最新的在前」（服务端那份排序）。 */
  const sortedRules = useMemo(
    () =>
      [...rules.rules].sort(
        (a, b) =>
          PROJECT_RULE_KINDS.indexOf(a.kind) -
          PROJECT_RULE_KINDS.indexOf(b.kind),
      ),
    [rules.rules],
  )

  return (
    <div data-testid="assistant-rules" className="flex flex-col gap-2">
      <p className="text-2sm font-semibold text-muted-foreground">
        {t('tabRules')}
      </p>
      <p className="text-md text-muted-foreground">{t('rulesHint')}</p>
      <form
        data-testid="assistant-rule-add"
        className="flex flex-col gap-1.5"
        onSubmit={(event) => {
          event.preventDefault()
          const text = ruleDraft.trim()
          if (!text) return
          void rules.add({ text, kind: ruleKind }).then((ok) => {
            if (ok) setRuleDraft('')
          })
        }}
      >
        <ToggleGroup
          type="single"
          value={ruleKind}
          onValueChange={(value) => {
            if (value) setRuleKind(value as ProjectRuleKindId)
          }}
          className="justify-start"
        >
          {PROJECT_RULE_KINDS.map((kind) => (
            <ToggleGroupItem
              key={kind}
              value={kind}
              data-testid={`assistant-rule-kind-${kind}`}
              aria-label={t(`ruleKind.${kind}`)}
              className="text-md"
            >
              {t(`ruleKind.${kind}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="flex items-center gap-1.5">
          <Input
            value={ruleDraft}
            data-testid="assistant-rule-input"
            aria-label={t('ruleAddLabel')}
            maxLength={ASSISTANT_PROJECT_RULE_LIMITS.maxTextChars}
            placeholder={
              ruleKind === PROJECT_RULE_KIND_IDS.note
                ? t('rulePlaceholderNote')
                : t('rulePlaceholderSource')
            }
            onChange={(event) => setRuleDraft(event.target.value)}
          />
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            data-testid="assistant-rule-add-submit"
            disabled={!ruleDraft.trim()}
          >
            {t('ruleAdd')}
          </Button>
        </div>
      </form>
      {rules.isLoading ? (
        <p className="flex items-center gap-1.5 text-md text-muted-foreground">
          <Spinner size="sm" />
          {t('rulesLoading')}
        </p>
      ) : null}
      {!rules.isLoading && rules.rules.length === 0 ? (
        <p className="text-md text-muted-foreground">{t('rulesEmpty')}</p>
      ) : null}
      {sortedRules.map((rule) => (
        <div
          key={rule.id}
          data-testid="assistant-rule-item"
          data-rule-kind={rule.kind}
          className="flex items-start gap-2 rounded-r-md border-l-2 border-border bg-muted/40 px-3 py-2"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-sm leading-snug text-foreground">{rule.text}</p>
            <p className="text-md text-muted-foreground">
              {rule.kind === PROJECT_RULE_KIND_IDS.note
                ? tRule('recordedOn', { date: rule.createdAt.slice(0, 10) })
                : `${t(`ruleKind.${rule.kind}`)} · ${tRule('recordedOn', {
                    date: rule.createdAt.slice(0, 10),
                  })}`}
            </p>
          </div>
          <button
            type="button"
            data-testid="assistant-rule-delete"
            aria-label={t('ruleDelete')}
            title={t('ruleDelete')}
            onClick={() => void rules.remove(rule.id)}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors duration-fast ease-standard hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      ))}
      {rules.error ? (
        <p role="alert" className="text-md text-status-risk">
          {rules.error}
        </p>
      ) : null}
    </div>
  )
}
