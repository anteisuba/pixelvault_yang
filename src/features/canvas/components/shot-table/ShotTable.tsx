'use client'

/**
 * 镜头表的**卡体**（`p-canvas-shotlist`；H1「表上画布」，owner 2026-11-06）。
 *
 * ⭐ 一行 = 一张有镜号的 `video.shot` 镜头卡，每一格都是卡上已有的东西（`buildShotTableRows`）。
 * 改格 = 发 op（`set_shot_spec` / `set_prompt` / `set_params` / `set_shotlist`），走画布同一条
 * 写入路径、同一个撤销栈 —— ⛔ 表自己不存任何一份，改表就是改片。
 *
 * ── 表坐在画布上（H1 起）──────────────────────────────────────────────
 * 全屏 `?mode=table` 已删：表是画布上的一张宽卡（`ShotTableNode` 包这一层），撤销走画布
 * 底栏 / ⌘Z 那一份，⛔ 表里不再自带撤销键和 Esc。
 * - 格子里能点能写的件一律带 `nodrag`：在画布卡里，按下去默认是拖卡。
 * - 每行最右一格留给 `renderRowPort`（画布在那里挂一颗出口，连到这一镜的镜头卡）。
 *   ⛔ 这一层不认识 ReactFlow —— 单测直接渲染它，不必搭画布。
 *
 * ── 素材列（H2a，owner 2026-11-07）────────────────────────────────────
 * 「素材」= 这一镜真实挂着的边 + `@` 到的角色库人物（`ShotTableMaterialsCell`，以图为主，
 * 第 25 条）。
 * 改列 = 改边：op 由 `shot-table-materials.ts` 的规划函数编好，一次点击一步撤销。
 *
 * ── 全片素材与画布侧（H2b，owner 2026-11-07 第 26 条）──────────────────
 * 全片素材 = 有镜在用的 + 拖进来还闲着的（`shot-film-materials.ts`）。「+」里闲着的悬停出 ✕
 * 移出；最后一格「从画布 / 角色库拿」换成两段大图格子，点一张 = 加进这一镜。
 * 画布点着一张素材时（`focusSourceId`），用到它的几行变浅蓝、其它行变淡、它的格子描蓝边。
 * 每行最左一格 / 表头左缘留给 `renderRowInPort` / `renderTopInPort`（素材卡的线落在这里）。
 *
 * ── 这一刀不做的 ────────────────────────────────────────────────────────
 * 拉片（H4）· 逐镜出片（H3，走点数）· 多选统一改与手机（H5）。
 * 空表三颗键里「让助手填」「拉片」先摆着、不能点。
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import {
  ChevronDown,
  Columns,
  Locate,
  Lock,
  LockOpen,
  Plus,
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
  compactShotlist,
  summarizeShotTable,
  type ShotTableRow,
} from '@/lib/shot-table-rows'
import {
  filmMaterialShots,
  listIdleFilmMaterials,
  listMaterialPicks,
  planFilmMaterialRemove,
} from '@/lib/shot-film-materials'
import {
  listFilmMaterials,
  planMaterialAdd,
  planMaterialRemove,
  planMaterialReplace,
  planMaterialSlot,
  type ShotMaterialPlanContext,
} from '@/lib/shot-table-materials'
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

import { ShotTableMaterialsCell } from './ShotTableMaterialsCell'

export interface ShotTableProps {
  readonly state: NodeWorkflowStateV4
  readonly characterCards: readonly CharacterCardRecord[]
  dispatch(op: NodeAssistantOpV4): boolean
  dispatchBatch(ops: readonly NodeAssistantOpV4[]): unknown
  /** 「+ 加一镜」/ 空表「自己写」：在画布上长一张新镜头卡（位置由宿主算）。 */
  onAddShot(): void
  /** 「回到这张卡」/ 素材弹层「在画布上看它」：定位并选中。 */
  onLocate(nodeId: string): void
  /** 每行右缘那颗出口（画布给；单测不给）。 */
  renderRowPort?(nodeId: string): ReactNode
  /** 每行左缘那颗入口：在用的素材卡的线落在这里（画布给；单测不给）。 */
  renderRowInPort?(nodeId: string): ReactNode
  /** 表头左缘那颗入口：进了全片素材、还没人用的卡的淡线落在这里。 */
  renderTopInPort?(): ReactNode
  /** 画布上点着的那张素材卡（H2b）：用到它的行变浅蓝、其它行变淡。 */
  readonly focusSourceId?: string | null
}

/** 一次撤销里改一行的几格（`set_shot_spec` 的补丁形状）。 */
type ShotSpecPatch = {
  size?: ShotSize | null
  move?: string | null
  look?: string | null
  durationLocked?: boolean | null
}

/** 空表的三条来路（mock 11-03 晚）。H1 只有「自己写」能点。 */
const SHOT_TABLE_SOURCES = ['write', 'assistant', 'breakdown'] as const

export function ShotTable({
  state,
  characterCards,
  dispatch,
  dispatchBatch,
  onAddShot,
  onLocate,
  renderRowPort,
  renderRowInPort,
  renderTopInPort,
  focusSourceId = null,
}: ShotTableProps) {
  const t = useTranslations('StudioNode.shotTable')
  const locale = useLocale()
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
  const usedBy = useMemo(() => filmMaterialShots(rows), [rows])
  const film = useMemo(
    () => [
      ...listFilmMaterials(rows),
      ...listIdleFilmMaterials({
        nodes: state.nodes,
        shotlist,
        used: usedBy,
      }),
    ],
    [rows, state.nodes, shotlist, usedBy],
  )
  const picks = useMemo(
    () => listMaterialPicks({ nodes: state.nodes, film, characterCards }),
    [state.nodes, film, characterCards],
  )
  const focusRows = useMemo(
    () => (focusSourceId ? new Set(usedBy.get(focusSourceId) ?? []) : null),
    [focusSourceId, usedBy],
  )
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

  /** 素材列的一次点击 = 一批 op = 一步撤销（规划函数已排好「先断后写」）。 */
  const applyOps = useCallback(
    (ops: readonly NodeAssistantOpV4[]) => {
      if (ops.length === 0) return
      if (ops.length === 1 && ops[0]) dispatch(ops[0])
      else dispatchBatch(ops)
    },
    [dispatch, dispatchBatch],
  )
  const planContext = useCallback(
    (shotId: string): ShotMaterialPlanContext => ({ state, shotId, locale }),
    [state, locale],
  )

  /** ⚠ 整份替换：`compactShotlist` 会带上 `board`，否则改一下风格表就从画布上消失。 */
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

  return (
    <div
      data-testid="shot-table"
      role="region"
      aria-label={t('title')}
      className="flex flex-col text-foreground"
    >
      {/* 表头：全片风格 · 总时长 · 列 ▾ ｜ 读数 · + 加一镜 */}
      <div
        data-testid="shot-table-top-bar"
        className="relative flex h-12 shrink-0 items-center gap-2 border-b border-border px-3.5"
      >
        {renderTopInPort?.()}
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
            shotlist?.totalDurationSec ? String(shotlist.totalDurationSec) : ''
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
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              data-testid="shot-table-columns"
              className="nodrag inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-2sm text-muted-foreground transition-colors duration-fast hover:bg-surface-fill hover:text-foreground"
            >
              <Columns className="size-4 shrink-0" aria-hidden />
              <span>{t('columnsMenu')}</span>
              <ChevronDown className="size-3.5 shrink-0" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-48 p-1.5">
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

        <span className="min-w-0 flex-1" aria-hidden />
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
        <button
          type="button"
          data-testid="shot-table-add-shot"
          onClick={onAddShot}
          className="nodrag inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-primary pl-2 pr-3 text-2sm font-medium text-primary-foreground transition-colors duration-fast hover:bg-primary/90"
        >
          <Plus className="size-4 shrink-0" aria-hidden />
          <span>{t('addShot')}</span>
        </button>
      </div>

      {rows.length === 0 ? (
        <div data-testid="shot-table-empty" className="px-6 py-8">
          <p className="mb-4 text-sm text-muted-foreground">{t('emptyLead')}</p>
          <div className="grid grid-cols-3 gap-3">
            {SHOT_TABLE_SOURCES.map((source) => {
              const live = source === 'write'
              return (
                <button
                  key={source}
                  type="button"
                  data-testid={`shot-table-source-${source}`}
                  disabled={!live}
                  onClick={live ? onAddShot : undefined}
                  className="nodrag flex flex-col items-start gap-1 rounded-xl border border-border px-4 py-3.5 text-left transition-colors duration-fast hover:bg-surface-fill disabled:pointer-events-none disabled:opacity-40"
                >
                  <span className="text-sm font-semibold">
                    {t(`sources.${source}.title`)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t(`sources.${source}.hint`)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
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
                onLocate={() => onLocate(row.nodeId)}
                focus={
                  focusRows
                    ? focusRows.has(row.nodeId)
                      ? 'on'
                      : 'off'
                    : undefined
                }
                materialsCell={
                  <ShotTableMaterialsCell
                    shotNo={row.shotNo}
                    materials={row.materials}
                    film={film}
                    picks={picks}
                    focusSourceId={focusSourceId}
                    onAdd={(entry) =>
                      applyOps(planMaterialAdd(planContext(row.nodeId), entry))
                    }
                    onRemoveFromFilm={(entry) =>
                      applyOps(planFilmMaterialRemove(state, entry.sourceId))
                    }
                    onRemove={(material) =>
                      applyOps(
                        planMaterialRemove(planContext(row.nodeId), material),
                      )
                    }
                    onSlot={(material, slot, holder) =>
                      applyOps(
                        planMaterialSlot(
                          planContext(row.nodeId),
                          material,
                          slot,
                          holder,
                        ),
                      )
                    }
                    onReplace={(material, entry) =>
                      applyOps(
                        planMaterialReplace(
                          planContext(row.nodeId),
                          material,
                          entry,
                        ),
                      )
                    }
                    onLocateSource={onLocate}
                  />
                }
                port={renderRowPort?.(row.nodeId)}
                inPort={renderRowInPort?.(row.nodeId)}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
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
  materialsCell,
  port,
  inPort,
  focus,
}: {
  readonly row: ShotTableRow
  readonly showDuration: boolean
  readonly showCast: boolean
  onSpec(spec: ShotSpecPatch): void
  onPrompt(prompt: string): void
  onDuration(seconds: number): void
  onLocate(): void
  readonly materialsCell: ReactNode
  readonly port?: ReactNode
  readonly inPort?: ReactNode
  /** 画布点着一张素材时：`on` = 这一镜用到它（浅蓝底），`off` = 没用到（变淡）。 */
  readonly focus?: 'on' | 'off' | undefined
}) {
  const t = useTranslations('StudioNode.shotTable')
  return (
    <tr
      data-testid="shot-table-row"
      data-node-id={row.nodeId}
      data-focus={focus}
      className={cn(
        'border-b border-border align-top transition-[background-color,opacity] duration-fast ease-standard last:border-b-0',
        focus === 'on' && 'bg-highlight-soft',
        focus === 'off' && 'opacity-30',
      )}
    >
      {/* 最左一格兼作入口的锚：素材卡的线落在这一行的左缘正中。 */}
      <td className="relative px-3 py-2.5 font-mono text-xs tabular-nums text-muted-foreground">
        {String(row.shotNo).padStart(2, '0')}
        {inPort}
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
      <td className="min-w-56 px-3 py-2.5">
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
      <td className="w-48 min-w-40 px-3 py-2.5">
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
                'nodrag inline-flex size-7 items-center justify-center rounded-md transition-colors duration-fast hover:bg-surface-fill',
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
      {showCast ? <td className="px-3 py-2.5">{materialsCell}</td> : null}
      {/* 最右一格兼作出口的锚：`relative` 让画布挂的 handle 落在这一行的右缘正中。 */}
      <td className="relative px-3 py-2.5">
        <button
          type="button"
          data-testid="shot-table-locate"
          aria-label={t('locate')}
          title={t('locate')}
          onClick={onLocate}
          className="nodrag inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-fast hover:bg-surface-fill hover:text-foreground"
        >
          <Locate className="size-4" aria-hidden />
        </button>
        {port}
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
            'nodrag inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-sm transition-colors duration-fast hover:bg-surface-fill',
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
      'nodrag w-full resize-none rounded-md border border-transparent bg-transparent px-1.5 py-1 text-base text-foreground outline-none transition-colors duration-fast placeholder:text-muted-foreground hover:border-border focus:border-input focus:bg-card lg:text-sm',
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

/** 表头那两颗胶囊（全片风格 / 总时长）：看是读数，点进去就地改。 */
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
    <label className="nodrag inline-flex h-8 min-w-0 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-xs text-muted-foreground">
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
