'use client'

/**
 * 镜头表 · 画布的第三个视图（`p-canvas-shotlist` 第 2 步，方向 A「整张表」，owner 2026-11-01）。
 *
 * ⭐ 一行 = 一张有镜号的 `video.shot` 镜头卡，每一格都是卡上已有的东西（`buildShotTableRows`）。
 * 改格 = 发 op（`set_shot_spec` / `set_prompt` / `set_params` / `set_shotlist`），走画布同一条
 * 写入路径、同一个撤销栈 —— ⛔ 表自己不存任何一份，改表就是改片。
 *
 * ── 为什么是全屏模式而不是新页 ──────────────────────────────────────────
 * 同剪辑台（`EditDesk` 头注）：URL 只加 `?mode=table`，画布留在 DOM 里只是被盖住，
 * 退出时视口与选择原样还在。整块 portal 到 body、z 只取 `z-canvas-workspace`（45），
 * 理由也同剪辑台：要盖住外壳旁的助手窄条，又不能压过自己弹出的 Popover（z-50）。
 *
 * ── 这一步不做的 ────────────────────────────────────────────────────────
 * 「逐镜生成」（第 4 步，走点数）与「助手按总时长分配」（第 3 步，等自主度定稿）都不在这里。
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'

import {
  ChevronDown,
  ChevronLeft,
  Columns,
  Locate,
  Lock,
  LockOpen,
  Undo2,
} from '@/components/icons'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import {
  SHOT_SIZES,
  SHOT_SPEC_LIMITS,
  SHOTLIST_OPTIONAL_COLUMN_IDS,
  SHOTLIST_OPTIONAL_COLUMNS,
  type ShotSize,
  type ShotlistOptionalColumn,
} from '@/constants/shot-spec'
import {
  buildShotTableRows,
  summarizeShotTable,
  type ShotTableRow,
} from '@/lib/shot-table-rows'
import { cn } from '@/lib/utils'
import type { CharacterCardRecord } from '@/types'
import type { NodeAssistantOpV4 } from '@/types/node-assistant-ops'
import type {
  NodeWorkflowShotlist,
  NodeWorkflowStateV4,
} from '@/types/node-workflow'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

export interface ShotTableProps {
  readonly state: NodeWorkflowStateV4
  readonly characterCards: readonly CharacterCardRecord[]
  dispatch(op: NodeAssistantOpV4): boolean
  dispatchBatch(ops: readonly NodeAssistantOpV4[]): unknown
  readonly canUndo: boolean
  onUndo(): void
  onExit(): void
  /** 「回到这张卡」：关模式 + 定位并选中。 */
  onBackToNode(nodeId: string): void
  /** 画布那块助手面板（同剪辑台：头像留在顶栏最右那一格）。 */
  readonly assistant?: ReactNode
}

/** 一次撤销里改一行的几格（`set_shot_spec` 的补丁形状）。 */
type ShotSpecPatch = {
  size?: ShotSize | null
  move?: string | null
  look?: string | null
  durationLocked?: boolean | null
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

/** 去掉空键；整份都空了就是「没设过」（`set_shotlist` 省略 = 清空，撤销能退回不存在）。 */
function compactShotlist(
  shotlist: NodeWorkflowShotlist,
): NodeWorkflowShotlist | undefined {
  const next: NodeWorkflowShotlist = {}
  if (shotlist.look) next.look = shotlist.look
  if (shotlist.totalDurationSec)
    next.totalDurationSec = shotlist.totalDurationSec
  if (shotlist.hiddenColumns && shotlist.hiddenColumns.length > 0) {
    next.hiddenColumns = shotlist.hiddenColumns
  }
  return Object.keys(next).length > 0 ? next : undefined
}

export function ShotTable({
  state,
  characterCards,
  dispatch,
  dispatchBatch,
  canUndo,
  onUndo,
  onExit,
  onBackToNode,
  assistant,
}: ShotTableProps) {
  const t = useTranslations('StudioNode.shotTable')
  const shotlist = state.shotlist
  const rows = useMemo(
    () =>
      buildShotTableRows({
        nodes: state.nodes,
        edges: state.edges,
        shotlist,
        characterCards,
      }),
    [state.nodes, state.edges, shotlist, characterCards],
  )
  const summary = useMemo(() => summarizeShotTable(rows), [rows])
  const hidden = useMemo(
    () => new Set<ShotlistOptionalColumn>(shotlist?.hiddenColumns ?? []),
    [shotlist?.hiddenColumns],
  )
  const showDuration = !hidden.has(SHOTLIST_OPTIONAL_COLUMN_IDS.duration)
  const showCast = !hidden.has(SHOTLIST_OPTIONAL_COLUMN_IDS.cast)

  /* ── 写入：全部走 op ─────────────────────────────────────────────────── */
  const setSpec = useCallback(
    (nodeId: string, spec: ShotSpecPatch) => {
      dispatch({
        op: NODE_ASSISTANT_OP_V4_IDS.setShotSpec,
        target: nodeId,
        spec,
      })
    },
    [dispatch],
  )

  const setPrompt = useCallback(
    (nodeId: string, prompt: string) => {
      dispatch({
        op: NODE_ASSISTANT_OP_V4_IDS.setPrompt,
        target: nodeId,
        prompt,
        mode: 'replace',
      })
    },
    [dispatch],
  )

  /** 手改时长 = 这一镜锁定（助手按总时长分配时不动它），一步撤销。 */
  const setDuration = useCallback(
    (nodeId: string, seconds: number) => {
      dispatchBatch([
        {
          op: NODE_ASSISTANT_OP_V4_IDS.setParams,
          target: nodeId,
          params: { duration: String(seconds) },
        },
        {
          op: NODE_ASSISTANT_OP_V4_IDS.setShotSpec,
          target: nodeId,
          spec: { durationLocked: true },
        },
      ])
    },
    [dispatchBatch],
  )

  const patchShotlist = useCallback(
    (patch: Partial<NodeWorkflowShotlist>) => {
      dispatch({
        op: NODE_ASSISTANT_OP_V4_IDS.setShotlist,
        shotlist: compactShotlist({ ...(shotlist ?? {}), ...patch }),
      })
    },
    [dispatch, shotlist],
  )

  const toggleColumn = useCallback(
    (column: ShotlistOptionalColumn) => {
      const next = new Set(hidden)
      if (next.has(column)) next.delete(column)
      else next.add(column)
      patchShotlist({
        hiddenColumns: SHOTLIST_OPTIONAL_COLUMNS.filter((id) => next.has(id)),
      })
    },
    [hidden, patchShotlist],
  )

  /* ── 键盘：Esc 回画布 · ⌘Z 撤销（输入框里一律让开）─────────────────── */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onExit()
        return
      }
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === 'z' &&
        canUndo
      ) {
        event.preventDefault()
        onUndo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canUndo, onExit, onUndo])

  const root = (
    <div
      data-testid="shot-table"
      role="region"
      aria-label={t('title')}
      className="fixed inset-0 z-canvas-workspace flex"
    >
      <div className="flex min-w-0 flex-1 flex-col bg-background text-foreground">
        {/* 顶栏：回画布 · 标题 · 全片风格 · 总时长 · 读数 ｜ 列 · 撤销 */}
        <div
          data-testid="shot-table-top-bar"
          className={cn(
            'flex h-12 shrink-0 items-center gap-2.5 border-b border-border bg-background px-3.5',
            assistant && 'pr-16',
          )}
        >
          <button
            type="button"
            data-testid="shot-table-back"
            onClick={onExit}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg pl-1.5 pr-3 text-2sm text-muted-foreground transition-colors duration-fast hover:bg-surface-fill hover:text-foreground"
          >
            <ChevronLeft className="size-4 shrink-0" aria-hidden />
            <span>{t('back')}</span>
          </button>
          <span className="shrink-0 text-sm font-semibold">{t('title')}</span>

          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
            <PillInput
              testId="shot-table-film-look"
              label={t('filmLook')}
              value={shotlist?.look ?? ''}
              placeholder={t('filmLookEmpty')}
              maxLength={SHOT_SPEC_LIMITS.lookMaxLength}
              onCommit={(look) => patchShotlist({ look: look || undefined })}
            />
            <PillInput
              testId="shot-table-total-duration"
              label={t('totalDuration')}
              value={
                shotlist?.totalDurationSec
                  ? String(shotlist.totalDurationSec)
                  : ''
              }
              placeholder={t('totalDurationEmpty')}
              suffix="s"
              numeric
              onCommit={(raw) => {
                const seconds = Number(raw)
                patchShotlist({
                  totalDurationSec:
                    Number.isFinite(seconds) && seconds > 0
                      ? Math.min(
                          Math.round(seconds),
                          SHOT_SPEC_LIMITS.totalDurationMaxSeconds,
                        )
                      : undefined,
                })
              }}
            />
            <span
              data-testid="shot-table-summary"
              className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground"
            >
              {t('summary', {
                shots: summary.shots,
                withVideo: summary.withVideo,
                seconds: Number(summary.durationSec.toFixed(1)),
              })}
            </span>
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                data-testid="shot-table-columns"
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-2sm text-muted-foreground transition-colors duration-fast hover:bg-surface-fill hover:text-foreground"
              >
                <Columns className="size-4 shrink-0" aria-hidden />
                <span>{t('columnsMenu')}</span>
                <ChevronDown className="size-3.5 shrink-0" aria-hidden />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48 p-1.5">
              {SHOTLIST_OPTIONAL_COLUMNS.map((column) => (
                <label
                  key={column}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-surface-fill"
                >
                  <input
                    type="checkbox"
                    data-testid={`shot-table-column-${column}`}
                    checked={!hidden.has(column)}
                    onChange={() => toggleColumn(column)}
                    className="size-3.5 accent-primary"
                  />
                  <span>{t(`columns.${column}`)}</span>
                </label>
              ))}
            </PopoverContent>
          </Popover>
          <button
            type="button"
            data-testid="shot-table-undo"
            aria-label={t('undo')}
            title={t('undo')}
            disabled={!canUndo}
            onClick={onUndo}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-fast hover:bg-surface-fill hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            <Undo2 className="size-4" aria-hidden />
          </button>
        </div>

        {rows.length === 0 ? (
          <div
            data-testid="shot-table-empty"
            className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center"
          >
            <p className="text-sm font-medium">{t('empty')}</p>
            <p className="max-w-sm text-2sm text-muted-foreground">
              {t('emptyHint')}
            </p>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <Th>{t('columns.shotNo')}</Th>
                  <Th>{t('columns.frame')}</Th>
                  <Th>{t('columns.size')}</Th>
                  <Th>{t('columns.move')}</Th>
                  <Th>{t('columns.note')}</Th>
                  <Th>{t('columns.look')}</Th>
                  {showDuration ? <Th>{t('columns.duration')}</Th> : null}
                  {showCast ? <Th>{t('columns.cast')}</Th> : null}
                  <Th>
                    <span className="sr-only">{t('locate')}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <ShotTableRowView
                    key={row.nodeId}
                    row={row}
                    showDuration={showDuration}
                    showCast={showCast}
                    onSpec={(spec) => setSpec(row.nodeId, spec)}
                    onPrompt={(prompt) => setPrompt(row.nodeId, prompt)}
                    onDuration={(seconds) => setDuration(row.nodeId, seconds)}
                    onLocate={() => onBackToNode(row.nodeId)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {assistant}
    </div>
  )

  if (typeof document === 'undefined') return root
  return createPortal(root, document.body)
}

function Th({ children }: { readonly children: ReactNode }) {
  return <th className="whitespace-nowrap px-3 py-2 font-medium">{children}</th>
}

function ShotTableRowView({
  row,
  showDuration,
  showCast,
  onSpec,
  onPrompt,
  onDuration,
  onLocate,
}: {
  readonly row: ShotTableRow
  readonly showDuration: boolean
  readonly showCast: boolean
  onSpec(spec: ShotSpecPatch): void
  onPrompt(prompt: string): void
  onDuration(seconds: number): void
  onLocate(): void
}) {
  const t = useTranslations('StudioNode.shotTable')
  return (
    <tr
      data-testid="shot-table-row"
      data-node-id={row.nodeId}
      className="border-b border-border align-top"
    >
      <td className="px-3 py-2.5 font-mono text-xs tabular-nums text-muted-foreground">
        {String(row.shotNo).padStart(2, '0')}
      </td>
      <td className="px-3 py-2.5">
        <FrameThumb row={row} generatingLabel={t('generating')} />
      </td>
      <td className="px-3 py-2.5">
        <SizePicker value={row.size} onChange={(size) => onSpec({ size })} />
      </td>
      <td className="w-40 px-3 py-2.5">
        <CellInput
          testId="shot-table-move"
          value={row.move ?? ''}
          placeholder={t('movePlaceholder')}
          maxLength={SHOT_SPEC_LIMITS.moveMaxLength}
          onCommit={(move) => onSpec({ move: move || null })}
        />
      </td>
      <td className="min-w-64 px-3 py-2.5">
        <CellInput
          testId="shot-table-note"
          multiline
          value={row.prompt}
          placeholder={t('notePlaceholder')}
          // ⚠ 说明不能清空：`set_prompt` 要至少一个字，清空等于没说这一镜拍什么。
          onCommit={(prompt) => {
            if (prompt) onPrompt(prompt)
          }}
        />
      </td>
      <td className="w-48 px-3 py-2.5">
        <CellInput
          testId="shot-table-look"
          multiline
          value={row.look ?? ''}
          placeholder={
            row.effectiveLook
              ? t('followFilmWith', { look: row.effectiveLook })
              : t('followFilm')
          }
          maxLength={SHOT_SPEC_LIMITS.lookMaxLength}
          onCommit={(look) => onSpec({ look: look || null })}
        />
      </td>
      {showDuration ? (
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1">
            <CellInput
              testId="shot-table-duration"
              numeric
              className="w-14 font-mono tabular-nums"
              value={row.durationSec ? String(row.durationSec) : ''}
              placeholder="—"
              onCommit={(raw) => {
                const seconds = Number(raw)
                if (Number.isFinite(seconds) && seconds > 0) onDuration(seconds)
              }}
            />
            <button
              type="button"
              data-testid="shot-table-duration-lock"
              aria-pressed={row.durationLocked}
              aria-label={
                row.durationLocked ? t('durationUnlock') : t('durationLock')
              }
              title={
                row.durationLocked ? t('durationUnlock') : t('durationLock')
              }
              onClick={() =>
                onSpec({ durationLocked: row.durationLocked ? null : true })
              }
              className={cn(
                'inline-flex size-7 items-center justify-center rounded-md transition-colors duration-fast hover:bg-surface-fill',
                row.durationLocked
                  ? 'text-foreground'
                  : 'text-muted-foreground',
              )}
            >
              {row.durationLocked ? (
                <Lock className="size-3.5" aria-hidden />
              ) : (
                <LockOpen className="size-3.5" aria-hidden />
              )}
            </button>
          </div>
        </td>
      ) : null}
      {showCast ? (
        <td className="px-3 py-2.5">
          <div className="flex flex-wrap gap-1">
            {row.cast.map((entry) => (
              <span
                key={`${entry.kind}-${entry.id}`}
                title={entry.name}
                className={cn(
                  'inline-flex size-7 items-center justify-center rounded-full text-xs',
                  entry.kind === 'character'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-surface-fill text-foreground',
                )}
              >
                {Array.from(entry.name)[0] ?? '?'}
              </span>
            ))}
          </div>
        </td>
      ) : null}
      <td className="px-3 py-2.5">
        <button
          type="button"
          data-testid="shot-table-locate"
          aria-label={t('locate')}
          title={t('locate')}
          onClick={onLocate}
          className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-fast hover:bg-surface-fill hover:text-foreground"
        >
          <Locate className="size-4" aria-hidden />
        </button>
      </td>
    </tr>
  )
}

function FrameThumb({
  row,
  generatingLabel,
}: {
  readonly row: ShotTableRow
  readonly generatingLabel: string
}) {
  const frame = row.frame
  return (
    <div className="relative aspect-video w-28 overflow-hidden rounded-md bg-surface-fill">
      {frame.kind === 'video' ? (
        frame.poster ? (
          // eslint-disable-next-line @next/next/no-img-element -- R2 产物直链，不走优化
          <img
            src={frame.poster}
            alt={row.label}
            className="size-full object-cover"
          />
        ) : (
          <video
            src={frame.url}
            muted
            playsInline
            preload="metadata"
            className="size-full object-cover"
          />
        )
      ) : frame.kind === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element -- 同上
        <img
          src={frame.url}
          alt={row.label}
          className="size-full object-cover"
        />
      ) : (
        <div className="size-full rounded-md border border-dashed border-border" />
      )}
      {row.generating ? (
        <span className="absolute inset-x-0 bottom-0 bg-background/80 px-1.5 py-0.5 text-center text-xs text-muted-foreground">
          {generatingLabel}
        </span>
      ) : null}
    </div>
  )
}

function SizePicker({
  value,
  onChange,
}: {
  readonly value?: ShotSize
  onChange(size: ShotSize | null): void
}) {
  const t = useTranslations('StudioNode.shotTable')
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="shot-table-size"
          className={cn(
            'inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-sm transition-colors duration-fast hover:bg-surface-fill',
            !value && 'text-muted-foreground',
          )}
        >
          <span>{value ? t(`sizes.${value}`) : '—'}</span>
          <ChevronDown
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-40 p-1">
        {SHOT_SIZES.map((size) => (
          <button
            key={size}
            type="button"
            data-testid={`shot-table-size-${size}`}
            onClick={() => {
              onChange(size)
              setOpen(false)
            }}
            className={cn(
              'flex w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-fill',
              size === value && 'font-semibold',
            )}
          >
            {t(`sizes.${size}`)}
          </button>
        ))}
        {value ? (
          <button
            type="button"
            onClick={() => {
              onChange(null)
              setOpen(false)
            }}
            className="flex w-full rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-surface-fill"
          >
            {t('sizeClear')}
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

/**
 * 一格里就地改字：失焦 / 回车提交，Esc 退回。⚠ 值没变不发 op —— 每发一条就是一步撤销。
 */
function CellInput({
  testId,
  value,
  placeholder,
  maxLength,
  multiline = false,
  numeric = false,
  className,
  onCommit,
}: {
  readonly testId: string
  readonly value: string
  readonly placeholder?: string
  readonly maxLength?: number
  readonly multiline?: boolean
  readonly numeric?: boolean
  readonly className?: string
  onCommit(next: string): void
}) {
  // 只在改的时候有草稿；没在改就直接显示外面的值（撤销、助手改了都跟着换）。
  const [draft, setDraft] = useState<string | null>(null)

  const commit = () => {
    if (draft === null) return
    setDraft(null)
    const next = draft.trim()
    if (next !== value.trim()) onCommit(next)
  }
  const shared = {
    'data-testid': testId,
    value: draft ?? value,
    placeholder,
    maxLength,
    onFocus: () => setDraft(value),
    onBlur: commit,
    className: cn(
      'w-full resize-none rounded-md border border-transparent bg-transparent px-1.5 py-1 text-base text-foreground outline-none transition-colors duration-fast placeholder:text-muted-foreground hover:border-border focus:border-input focus:bg-card lg:text-sm',
      className,
    ),
  }
  if (multiline) {
    return (
      <textarea
        {...shared}
        rows={2}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setDraft(null)
            event.currentTarget.blur()
          }
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.currentTarget.blur()
          }
        }}
      />
    )
  }
  return (
    <input
      {...shared}
      inputMode={numeric ? 'decimal' : undefined}
      onChange={(event) =>
        setDraft(
          numeric
            ? event.target.value.replace(/[^\d.]/g, '')
            : event.target.value,
        )
      }
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setDraft(null)
          event.currentTarget.blur()
        }
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
    />
  )
}

/** 顶栏那两颗胶囊（全片风格 / 总时长）：看是读数，点进去就地改。 */
function PillInput({
  testId,
  label,
  value,
  placeholder,
  maxLength,
  suffix,
  numeric = false,
  onCommit,
}: {
  readonly testId: string
  readonly label: string
  readonly value: string
  readonly placeholder: string
  readonly maxLength?: number
  readonly suffix?: string
  readonly numeric?: boolean
  onCommit(next: string): void
}) {
  return (
    <label className="inline-flex h-8 min-w-0 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-xs text-muted-foreground">
      <span className="shrink-0">{label}</span>
      <CellInput
        testId={testId}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        numeric={numeric}
        className={cn(
          'h-6 px-1 py-0 text-xs lg:text-xs',
          numeric ? 'w-12 font-mono tabular-nums' : 'w-40',
        )}
        onCommit={onCommit}
      />
      {suffix && value ? <span className="shrink-0">{suffix}</span> : null}
    </label>
  )
}
