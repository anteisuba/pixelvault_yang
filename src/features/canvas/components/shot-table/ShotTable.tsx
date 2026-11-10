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
 * ── 拉片（H4a，owner 2026-11-07）──────────────────────────────────────
 * 空表「拉片」键 / 有行时表头「拉片」→ 「拉哪一段？」（`ShotPullSourcePicker`），切镜与落表
 * 在宿主挂的拉片纸里做（`ShotPullPaper`）。落下来的行是**草稿**：左缘一道黄、空的景别 / 运镜
 * 虚线框；改了哪一格就和那一格同批去掉草稿标（一步撤销）。
 * 草稿行的「画面」格没片没首帧时放参考帧（灰），点它在参考段的某一刻切开；悬停一行、它和
 * 上一行首尾相接时出「↑ 和上一镜合并」。
 *
 * ── 读镜（H4b，owner 2026-11-07）──────────────────────────────────────
 * 拉片纸上勾了「顺便读每一镜」，落表后工作台一批一批读（`useShotReading`）。表上露出来的：
 * 表头下一条（`ShotTableReadBar`：第几批 / 停下；没读出来 = 原因 + 下一步），在读那一批的
 * 行里，要读又空着的格子换成静止灰条。读回来只填空格、仍是草稿；改过的格子 ⛔ 不碰。
 *
 * ── 这一刀不做的 ────────────────────────────────────────────────────────
 * 映射纸（H4c）· 逐镜出片（H3，走点数）· 多选统一改与手机（H5）。
 * 空表三颗键里「让助手填」先摆着、不能点。
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import {
  ArrowUp,
  ChevronDown,
  Columns,
  Film,
  Locate,
  Lock,
  LockOpen,
  Plus,
} from '@/components/icons'
import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import {
  SHOT_READ_FIELD_IDS,
  type ShotReadField,
} from '@/constants/shot-reading'
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
import {
  formatPullClockPrecise,
  formatPullSpan,
  shotRefFrameUrl,
} from '@/lib/shot-pull-frames'
import {
  canMergeWithPrevious,
  planShotMerge,
  planShotSplit,
} from '@/lib/shot-pull-plan'
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
import { Skeleton } from '@/components/ui/skeleton'

import {
  ShotPullSourcePicker,
  type ShotPullSourceActions,
} from './ShotPullSourcePicker'
import { ShotSplitPopover } from './ShotSplitPopover'
import { ShotTableMaterialsCell } from './ShotTableMaterialsCell'
import { ShotTableReadBar } from './ShotTableReadBar'
import type { ShotTableReadingView } from './shot-table-board-context'

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
  /** 拉片（H4a）：宿主给了才亮「拉片」键（单测可以不给）。 */
  readonly pull?: ShotPullSourceActions
  /** 读镜（H4b）：表头下那一条 + 在读那一批的灰条（宿主给了才有）。 */
  readonly reading?: ShotTableReadingView
}

/** 一次撤销里改一行的几格（`set_shot_spec` 的补丁形状）。 */
type ShotSpecPatch = {
  size?: ShotSize | null
  move?: string | null
  look?: string | null
  durationLocked?: boolean | null
  draft?: null
}

/** 空表的三条来路（mock 11-03 晚）。「让助手填」还不能点。 */
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
  pull,
  reading,
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
  /** 拉片的草稿行：改它哪一格都顺手去掉草稿标（同一批 op）。 */
  const draftIds = useMemo(
    () => new Set(rows.filter((row) => row.draft).map((row) => row.nodeId)),
    [rows],
  )
  /** 在读那一批：哪几行、读哪几样（空格子换灰条；读完 / 没读出来就收掉）。 */
  const readingState = reading?.state
  const readingRows = useMemo(
    () =>
      readingState?.status === 'reading'
        ? {
            ids: new Set(readingState.batchIds),
            fields: new Set<ShotReadField>(readingState.fields),
          }
        : null,
    [readingState],
  )
  /** 下一行 id → 上一行 id：两行拉自同一张参考片、首尾相接，才能合并。 */
  const mergeUp = useMemo(() => {
    const byId = new Map(state.nodes.map((node) => [node.id, node]))
    const pairs = new Map<string, string>()
    rows.forEach((row, index) => {
      const previous = rows[index - 1]
      const node = byId.get(row.nodeId)
      if (!previous || !node) return
      if (canMergeWithPrevious(byId.get(previous.nodeId), node)) {
        pairs.set(row.nodeId, previous.nodeId)
      }
    })
    return pairs
  }, [rows, state.nodes])

  /* ── 写入：全部走 op ─────────────────────────────────────────────────── */
  const setSpec = useCallback(
    (nodeId: string, spec: ShotSpecPatch) => {
      dispatch({
        op: NODE_ASSISTANT_OP_V4_IDS.setShotSpec,
        target: nodeId,
        spec: draftIds.has(nodeId) ? { ...spec, draft: null } : spec,
      })
    },
    [dispatch, draftIds],
  )

  /** 草稿行：在那一格的 op 后面补一条「去掉草稿标」，同一步撤销。 */
  const withDraftCleared = useCallback(
    (nodeId: string, ops: readonly NodeAssistantOpV4[]) =>
      draftIds.has(nodeId) && ops.length > 0
        ? [
            ...ops,
            {
              op: NODE_ASSISTANT_OP_V4_IDS.setShotSpec,
              target: nodeId,
              spec: { draft: null },
            } satisfies NodeAssistantOpV4,
          ]
        : ops,
    [draftIds],
  )

  const setPrompt = useCallback(
    (nodeId: string, prompt: string) => {
      const ops = withDraftCleared(nodeId, [
        {
          op: NODE_ASSISTANT_OP_V4_IDS.setPrompt,
          target: nodeId,
          prompt,
          mode: 'replace',
        },
      ])
      if (ops.length === 1 && ops[0]) dispatch(ops[0])
      else dispatchBatch(ops)
    },
    [dispatch, dispatchBatch, withDraftCleared],
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
          spec: {
            durationLocked: true,
            ...(draftIds.has(nodeId) ? { draft: null } : {}),
          },
        },
      ])
    },
    [dispatchBatch, draftIds],
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
              className="nodrag inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-2sm text-muted-foreground transition-colors duration-fast hover:tint-hover hover:text-foreground"
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
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-2sm hover:tint-hover"
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
          className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground"
        >
          {t('summary', {
            shots: summary.shots,
            withVideo: summary.withVideo,
            seconds: Number(summary.durationSec.toFixed(1)),
          })}
        </span>
        {pull && rows.length > 0 ? (
          <ShotPullSourcePicker nodes={state.nodes} actions={pull} align="end">
            <button
              type="button"
              data-testid="shot-table-pull"
              className="nodrag inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2.5 text-2sm text-muted-foreground transition-colors duration-fast hover:tint-hover hover:text-foreground"
            >
              <Film className="size-4 shrink-0" aria-hidden />
              <span>{t('pullButton')}</span>
            </button>
          </ShotPullSourcePicker>
        ) : null}
        <button
          type="button"
          data-testid="shot-table-add-shot"
          onClick={onAddShot}
          className="nodrag inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-primary pl-2 pr-3 text-2sm font-semibold text-primary-foreground transition-colors duration-fast hover:tint-hover"
        >
          <Plus className="size-4 shrink-0" aria-hidden />
          <span>{t('addShot')}</span>
        </button>
      </div>
      {reading ? <ShotTableReadBar reading={reading} rows={rows} /> : null}

      {rows.length === 0 ? (
        <div data-testid="shot-table-empty" className="px-6 py-8">
          <p className="mb-4 text-2sm text-muted-foreground">
            {t('emptyLead')}
          </p>
          <div className="grid grid-cols-3 gap-3">
            {SHOT_TABLE_SOURCES.map((source) => {
              const live =
                source === 'write' || (source === 'breakdown' && pull)
              const key = (
                <button
                  key={source}
                  type="button"
                  data-testid={`shot-table-source-${source}`}
                  disabled={!live}
                  onClick={source === 'write' ? onAddShot : undefined}
                  className="nodrag flex flex-col items-start gap-1 rounded-xl border border-border px-4 py-3.5 text-left transition-colors duration-fast hover:tint-hover disabled:pointer-events-none disabled:opacity-40"
                >
                  <span className="text-md font-semibold">
                    {t(`sources.${source}.title`)}
                  </span>
                  <span className="text-2xs text-muted-foreground">
                    {t(`sources.${source}.hint`)}
                  </span>
                </button>
              )
              return source === 'breakdown' && pull ? (
                <ShotPullSourcePicker
                  key={source}
                  nodes={state.nodes}
                  actions={pull}
                >
                  {key}
                </ShotPullSourcePicker>
              ) : (
                key
              )
            })}
          </div>
        </div>
      ) : (
        <table className="w-full border-collapse text-2sm">
          <thead>
            <tr className="border-b border-border text-left text-2xs text-muted-foreground">
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
            {rows.map((row, index) => (
              <ShotTableRowView
                key={row.nodeId}
                row={row}
                readingFields={
                  readingRows?.ids.has(row.nodeId)
                    ? readingRows.fields
                    : undefined
                }
                landingIndex={landingIndex(rows, index)}
                onMergeUp={
                  mergeUp.has(row.nodeId)
                    ? () =>
                        applyOps(
                          planShotMerge(
                            state.nodes,
                            mergeUp.get(row.nodeId) ?? '',
                            row.nodeId,
                          ),
                        )
                    : undefined
                }
                onSplit={(at) =>
                  applyOps(planShotSplit(state.nodes, row.nodeId, at))
                }
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
                      applyOps(
                        withDraftCleared(
                          row.nodeId,
                          planMaterialAdd(planContext(row.nodeId), entry),
                        ),
                      )
                    }
                    onRemoveFromFilm={(entry) =>
                      applyOps(planFilmMaterialRemove(state, entry.sourceId))
                    }
                    onRemove={(material) =>
                      applyOps(
                        withDraftCleared(
                          row.nodeId,
                          planMaterialRemove(planContext(row.nodeId), material),
                        ),
                      )
                    }
                    onSlot={(material, slot, holder) =>
                      applyOps(
                        withDraftCleared(
                          row.nodeId,
                          planMaterialSlot(
                            planContext(row.nodeId),
                            material,
                            slot,
                            holder,
                          ),
                        ),
                      )
                    }
                    onReplace={(material, entry) =>
                      applyOps(
                        withDraftCleared(
                          row.nodeId,
                          planMaterialReplace(
                            planContext(row.nodeId),
                            material,
                            entry,
                          ),
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

/** 落表入场的错峰序号：一串连着的草稿行里排第几（不是草稿行 = 不动）。 */
function landingIndex(
  rows: readonly ShotTableRow[],
  index: number,
): number | undefined {
  if (!rows[index]?.draft) return undefined
  let start = index
  while (start > 0 && rows[start - 1]?.draft) start -= 1
  return index - start
}

function Th({ children }: { readonly children: ReactNode }) {
  return <th className="whitespace-nowrap px-3 py-2">{children}</th>
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
  landingIndex,
  onMergeUp,
  onSplit,
  readingFields,
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
  /** 草稿行落表入场的错峰序号（不是草稿行 = 不给）。 */
  readonly landingIndex?: number
  /** 和上一镜合并（两行首尾相接才给）。 */
  onMergeUp?(): void
  /** 在参考段的某一刻切开。 */
  onSplit(atSec: number): void
  /** 读镜正在读这一行：读哪几样（要读又空着的格子换成灰条）。 */
  readonly readingFields?: ReadonlySet<ShotReadField>
}) {
  const t = useTranslations('StudioNode.shotTable')
  const draftEmpty = row.draft
    ? 'border-dashed border-status-warning/70 hover:border-status-warning'
    : undefined
  const reads = (field: ShotReadField) => readingFields?.has(field) === true
  const readingSize = reads(SHOT_READ_FIELD_IDS.sizeMove) && !row.size
  const readingMove = reads(SHOT_READ_FIELD_IDS.sizeMove) && !row.move
  const readingNote =
    reads(SHOT_READ_FIELD_IDS.description) && !row.prompt.trim()
  const readingLook = reads(SHOT_READ_FIELD_IDS.look) && !row.look
  return (
    <tr
      data-testid="shot-table-row"
      data-node-id={row.nodeId}
      data-focus={focus}
      data-draft={row.draft || undefined}
      data-reading={readingFields ? true : undefined}
      style={
        landingIndex !== undefined
          ? { animationDelay: `${Math.min(landingIndex, 12) * 40}ms` }
          : undefined
      }
      className={cn(
        'group/row border-b border-border align-top transition-[background-color,opacity] duration-fast ease-standard last:border-b-0',
        landingIndex !== undefined && 'shot-table-row-landing',
        focus === 'on' && 'bg-highlight-soft',
        focus === 'off' && 'opacity-30',
      )}
    >
      {/* 最左一格兼作入口的锚：素材卡的线落在这一行的左缘正中。 */}
      <td className="relative px-3 py-2.5 font-mono text-2xs tabular-nums text-muted-foreground">
        {row.draft ? (
          <span
            data-testid="shot-table-draft-mark"
            aria-hidden
            className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-status-warning"
          />
        ) : null}
        {String(row.shotNo).padStart(2, '0')}
        {inPort}
      </td>
      <td className="px-3 py-2.5">
        {row.reference?.url ? (
          <ShotSplitPopover
            shotNo={row.shotNo}
            reference={{ ...row.reference, url: row.reference.url }}
            onSplit={onSplit}
          >
            <button
              type="button"
              data-testid="shot-table-split-open"
              aria-label={t('split.open')}
              title={t('split.open')}
              className="nodrag block rounded-md transition-opacity duration-fast hover:opacity-85"
            >
              <FrameThumb row={row} generatingLabel={t('generating')} />
            </button>
          </ShotSplitPopover>
        ) : (
          <FrameThumb row={row} generatingLabel={t('generating')} />
        )}
      </td>
      <td className="px-3 py-2.5">
        {readingSize ? (
          <ReadingShim className="w-16" />
        ) : (
          <SizePicker
            value={row.size}
            draftClassName={row.size ? undefined : draftEmpty}
            onChange={(size) => onSpec({ size })}
          />
        )}
      </td>
      <td className="w-40 px-3 py-2.5">
        {readingMove ? (
          <ReadingShim className="w-2/3" />
        ) : (
          <CellInput
            testId="shot-table-move"
            value={row.move ?? ''}
            placeholder={t('movePlaceholder')}
            maxLength={SHOT_SPEC_LIMITS.moveMaxLength}
            className={row.move ? undefined : draftEmpty}
            onCommit={(move) => onSpec({ move: move || null })}
          />
        )}
      </td>
      <td className="relative min-w-56 px-3 py-2.5">
        {onMergeUp ? (
          <button
            type="button"
            data-testid="shot-table-merge-up"
            onClick={onMergeUp}
            className="nodrag absolute -top-3 left-3 z-10 inline-flex h-6 items-center gap-1 rounded-full border border-border bg-card px-2 text-2sm text-foreground opacity-0 shadow-soft transition-opacity duration-fast hover:tint-hover focus-visible:opacity-100 group-hover/row:opacity-100"
          >
            <ArrowUp className="size-3" aria-hidden />
            {t('mergeUp')}
          </button>
        ) : null}
        {readingNote ? (
          <ReadingShim lines={2} />
        ) : (
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
        )}
      </td>
      <td className="w-48 min-w-40 px-3 py-2.5">
        {readingLook ? (
          <ReadingShim lines={2} />
        ) : (
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
        )}
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
                'nodrag inline-flex size-7 items-center justify-center rounded-md transition-colors duration-fast hover:tint-hover',
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
          {row.reference ? (
            <span
              data-testid="shot-table-ref-span"
              className="block px-1.5 text-2xs tabular-nums text-muted-foreground"
            >
              {t('refSpan', {
                seconds: formatPullSpan(
                  row.reference.startSec,
                  row.reference.endSec,
                ),
              })}
            </span>
          ) : null}
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
          className="nodrag inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-fast hover:tint-hover hover:text-foreground"
        >
          <Locate className="size-4" aria-hidden />
        </button>
        {port}
      </td>
    </tr>
  )
}

/**
 * 读镜在读这一格：静止灰条（owner 2026-10-08 加载中不闪），高度与那一格的输入框一样，
 * 读回来换上真内容时行高不跳。
 */
function ReadingShim({
  lines = 1,
  className,
}: {
  readonly lines?: 1 | 2
  readonly className?: string
}) {
  return (
    <div
      data-testid="shot-table-read-shim"
      className={cn(
        'flex flex-col justify-center gap-1.5 px-1.5',
        lines === 2 ? 'h-12' : 'h-7',
        className,
      )}
    >
      <Skeleton className="h-3 w-full" />
      {lines === 2 ? <Skeleton className="h-3 w-2/3" /> : null}
    </div>
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
      ) : row.reference ? (
        <ReferenceFrame reference={row.reference} label={row.label} />
      ) : (
        <div className="size-full rounded-md border border-dashed border-border" />
      )}
      {row.generating ? (
        <span className="absolute inset-x-0 bottom-0 bg-background/80 px-1.5 py-0.5 text-center text-2xs text-muted-foreground">
          {generatingLabel}
        </span>
      ) : null}
    </div>
  )
}

/**
 * 草稿行「画面」格没片没首帧：放参考片那一段的一帧（灰 = 借来看结构的，⛔ 不是这一镜的
 * 首帧）；截不了帧就只写时间段。
 */
function ReferenceFrame({
  reference,
  label,
}: {
  readonly reference: NonNullable<ShotTableRow['reference']>
  readonly label: string
}) {
  const t = useTranslations('StudioNode.shotTable')
  const src = shotRefFrameUrl(
    reference.url,
    reference.startSec,
    reference.endSec,
  )
  const range = `${formatPullClockPrecise(reference.startSec)}–${formatPullClockPrecise(reference.endSec)}`
  return (
    <div data-testid="shot-table-ref-frame" className="relative size-full">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- 边缘截帧直链，不走优化
        <img
          src={src}
          alt={label}
          className="size-full object-cover opacity-80 grayscale"
        />
      ) : (
        <div className="flex size-full items-center justify-center rounded-md border border-dashed border-border font-mono text-2xs tabular-nums text-muted-foreground">
          {range}
        </div>
      )}
      <span className="absolute left-1 top-1 rounded-sm bg-media-chip px-1 text-2xs text-on-media-chip">
        {t('refBadge')}
      </span>
      {src ? (
        <span className="absolute bottom-1 right-1 rounded-sm bg-media-chip px-1 font-mono text-2xs tabular-nums text-on-media-chip">
          {range}
        </span>
      ) : null}
    </div>
  )
}

function SizePicker({
  value,
  draftClassName,
  onChange,
}: {
  readonly value?: ShotSize
  /** 草稿行空着的样子（虚线黄框）。 */
  readonly draftClassName?: string
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
            'nodrag inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md border border-transparent px-1.5 text-2sm transition-colors duration-fast hover:tint-hover',
            !value && 'text-muted-foreground',
            draftClassName,
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
              'flex w-full rounded-md px-2 py-1.5 text-left text-2sm hover:tint-hover',
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
            className="flex w-full rounded-md px-2 py-1.5 text-left text-2sm text-muted-foreground hover:tint-hover"
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
/** 格子里那一框字的尺寸（输入框和下面那层两行截断共用，两层的折行才一样）。 */
const CELL_BOX =
  'w-full rounded-md border border-transparent px-1.5 py-1 text-base lg:text-sm'

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
      'nodrag resize-none bg-transparent text-foreground outline-none transition-colors duration-fast placeholder:text-muted-foreground hover:border-border focus:border-input focus:bg-card',
      CELL_BOX,
      className,
    ),
  }
  if (multiline) {
    // 长说明（owner 11-07）：不在改时看到的是下面那层 —— 两行截断 + 省略号（textarea 截不出
    // 省略号，第三行还会从下内边距里露出半截）；textarea 叠在上面、字透明，点哪改哪照旧。
    // 点进去 textarea 显出字、跟着内容长高，看全文；最矮不低于原来的两行，点进去不跳。
    // ⛔ `line-clamp-2` 不能挂在带 `py-1` 的那层：溢出裁在内边距外沿，第三行顶上那几像素
    //   会从下内边距里露出来（真机见过）。内边距在外层、截断在里层，裁口正好在第二行底。
    const editing = draft !== null
    const clamped = !editing && value !== ''
    return (
      <div className="grid">
        {clamped ? (
          <div
            aria-hidden
            data-testid={`${testId}-clamp`}
            className={cn(
              CELL_BOX,
              'pointer-events-none col-start-1 row-start-1 text-foreground',
            )}
          >
            <div className="line-clamp-2 whitespace-pre-wrap break-words">
              {value}
            </div>
          </div>
        ) : null}
        <textarea
          {...shared}
          rows={2}
          className={cn(
            shared.className,
            'col-start-1 row-start-1',
            editing && 'field-sizing-content min-h-14.5 lg:min-h-12.5',
            clamped && 'overflow-hidden text-transparent',
          )}
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
      </div>
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
    <label className="nodrag inline-flex h-8 min-w-0 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-2sm text-muted-foreground">
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
