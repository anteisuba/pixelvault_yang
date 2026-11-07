'use client'

/**
 * 镜头表在画布上的那张宽卡（H1，owner 2026-11-06）：卡外上方「镜头表 · 项目名」，卡面就是表。
 *
 * - 卡壳复用 `NodeCardShell`（⛔ 不另起一套卡皮）；名字只读 —— 表是项目级的一张，名字跟项目走。
 * - 每行右缘一颗出口（`row:<镜头卡 id>`），画布从那里拉一根线到这一镜的镜头卡（CanvasV4 合成）。
 *   出口只是线头：⛔ 不能拖线起手（`isConnectable={false}`）。
 * - 行变了（加镜 / 删镜 / 重排 / 关列）要让 RF 重新量一次出口位置，否则线还连在旧的那一行上。
 * - H2b：每行左缘一颗入口（`mat:<镜头卡 id>`）+ 表头左缘一颗（`mat-top`），素材卡的线落在这里；
 *   入口看不见、不能落线（线是画布合成的，⛔ 不是用户拉的）。画布点着素材 / 拖卡压在表上的
 *   样子读 `shot-table-canvas-context`。
 * - H4b 读镜：读着的时候卡边就是进度（与画布出图同一条线 `StudioGeneratingProgress`，
 *   黑线，owner 11-07 定）。读完的镜数是底，在读这一批的那一份里按等了多久慢慢爬
 *   （`shotReadEdgePercent`，⛔ 不越过这批的终点）；读完补满合拢再淡出，停下 / 没读出来
 *   直接收掉。
 */

import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import {
  Handle,
  Position,
  useStore,
  useUpdateNodeInternals,
  type NodeProps,
} from '@xyflow/react'
import { useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import { StudioGeneratingProgress } from '@/components/business/studio-shared/primitives/StudioGeneratingProgress'
import { PROGRESS_TICK_MS } from '@/constants/generation-progress'
import { SHOT_TABLE_BOARD } from '@/constants/shot-spec'
import { shotReadEdgePercent } from '@/lib/shot-read-plan'
import { listShotTableNodes } from '@/lib/shot-table-rows'

import type { ShotReadingState } from '@/features/canvas/hooks/use-shot-reading'

import { NodeCardShell } from '../nodes/v4/chrome/NodeCardShell'
import { ShotTable } from './ShotTable'
import { useShotTableBoard } from './shot-table-board-context'
import { useShotTableCanvas } from './shot-table-canvas-context'

export function ShotTableNode({ selected }: NodeProps) {
  const t = useTranslations('StudioNode.shotTable')
  const board = useShotTableBoard()
  const canvas = useShotTableCanvas()
  const zoom = useStore((state) => state.transform[2])
  const updateNodeInternals = useUpdateNodeInternals()

  const rowKey = board
    ? listShotTableNodes(board.state.nodes)
        .map((node) => node.id)
        .join(',')
    : ''
  const hiddenKey = board?.state.shotlist?.hiddenColumns?.join(',') ?? ''
  const readStatus = board?.reading?.state.status ?? 'idle'
  const edge = useShotReadEdge(board?.reading?.state)
  // 表头下那条读镜一出一收，下面每行都挪了位置：出口要跟着重新量。
  useLayoutEffect(() => {
    updateNodeInternals(SHOT_TABLE_BOARD.nodeId)
  }, [rowKey, hiddenKey, readStatus, updateNodeInternals])

  if (!board) return null
  const scale = zoom > 0 ? zoom : 1
  const portStyle = {
    width: 12 / scale,
    height: 12 / scale,
    borderWidth: 1.5 / scale,
  }
  // 入口只是线头：看不见、不接指针（线由画布合成）。
  const inPortStyle = { width: 1, height: 1, minWidth: 0, minHeight: 0 }

  return (
    <NodeCardShell
      name={
        board.projectName
          ? t('boardName', { project: board.projectName })
          : t('title')
      }
      renameAriaLabel={t('title')}
      selected={selected}
      width={SHOT_TABLE_BOARD.widthPx}
      edgeBusy={edge.busy}
      edgeOverlay={
        edge.shown ? (
          <ShotReadEdgeLine
            state={board.reading?.state}
            label={t('reading.progress')}
            completing={edge.completing}
            onRelease={edge.release}
            onDone={edge.finish}
          />
        ) : null
      }
      {...(canvas.dropSourceId
        ? { surfaceClassName: 'shot-table-drop-target' }
        : {})}
    >
      <ShotTable
        state={board.state}
        characterCards={board.characterCards}
        dispatch={board.dispatch}
        dispatchBatch={board.dispatchBatch}
        onAddShot={board.onAddShot}
        onLocate={board.onLocate}
        pull={board.pull}
        reading={board.reading}
        focusSourceId={canvas.focusId}
        renderRowInPort={(nodeId) => (
          <Handle
            id={`${SHOT_TABLE_BOARD.materialHandlePrefix}${nodeId}`}
            type="target"
            position={Position.Left}
            isConnectable={false}
            data-port="material"
            className="pointer-events-none border-0 bg-transparent opacity-0"
            style={inPortStyle}
          />
        )}
        renderTopInPort={() => (
          <Handle
            id={SHOT_TABLE_BOARD.materialTopHandle}
            type="target"
            position={Position.Left}
            isConnectable={false}
            data-port="material-top"
            className="pointer-events-none border-0 bg-transparent opacity-0"
            style={inPortStyle}
          />
        )}
        renderRowPort={(nodeId) => (
          <Handle
            id={`${SHOT_TABLE_BOARD.rowHandlePrefix}${nodeId}`}
            type="source"
            position={Position.Right}
            isConnectable={false}
            data-port="row"
            className="node-port"
            style={portStyle}
          />
        )}
      />
    </NodeCardShell>
  )
}

/**
 * 读镜的卡边：读着 = 线走到哪见 `ShotReadEdgeLine`；**读完**（`finished`）补满合拢 → 停一拍 → 淡出
 * （与出图那一拍同一套，`StudioGeneratingProgress` 的 `isCompleting`）；停下 / 没读出来
 * 直接收掉，⛔ 不假装走满一圈。翻转在渲染期对齐（跟自己的 props，⛔ 不放 effect）。
 */
function useShotReadEdge(state: ShotReadingState | undefined) {
  const reading = state?.status === 'reading'
  const [watch, setWatch] = useState(reading)
  const [completing, setCompleting] = useState(false)
  const [released, setReleased] = useState(false)
  if (watch !== reading) {
    setWatch(reading)
    setCompleting(
      !reading && state?.status === 'idle' && state.finished === true,
    )
    setReleased(false)
  }
  const release = useCallback(() => setReleased(true), [])
  const finish = useCallback(() => setCompleting(false), [])
  return {
    shown: reading || completing,
    busy: reading || (completing && !released),
    completing,
    release,
    finish,
  }
}

/**
 * 卡边那根线本身。半秒一跳的计时住在这里：⛔ 别提到 `ShotTableNode` —— 那会让整张表
 * 每半秒重渲一次。
 */
function ShotReadEdgeLine({
  state,
  label,
  completing,
  onRelease,
  onDone,
}: {
  readonly state: ShotReadingState | undefined
  readonly label: string
  readonly completing: boolean
  onRelease(): void
  onDone(): void
}) {
  const reading = state?.status === 'reading' ? state : null
  const reducedMotion = Boolean(useReducedMotion())
  const batchElapsedSeconds = useBatchElapsedSeconds(
    reading ? reading.batchIds.join(',') : null,
  )
  const percent = reading
    ? shotReadEdgePercent({
        doneShots: reading.doneShots,
        totalShots: reading.totalShots,
        batchShots: reading.batchIds.length,
        batchElapsedSeconds,
        reducedMotion,
      })
    : 100
  return (
    <StudioGeneratingProgress
      variant="edge"
      elapsedSeconds={0}
      realProgress={percent}
      stageLabel={label}
      isCompleting={completing}
      onEdgeRelease={onRelease}
      onCompleteAnimationDone={onDone}
      cornerRadiusVar="--radius-node"
      edgePlacement="outside"
    />
  )
}

/**
 * 在读这一批等了几秒（与出图那条线同一个半秒一跳）。换一批 / 没读出来后重读，`batchKey`
 * 就变了，从 0 数；`null` = 没在读，不计时。
 */
function useBatchElapsedSeconds(batchKey: string | null): number {
  const [seenKey, setSeenKey] = useState(batchKey)
  const [elapsed, setElapsed] = useState(0)
  if (seenKey !== batchKey) {
    setSeenKey(batchKey)
    setElapsed(0)
  }
  useEffect(() => {
    if (batchKey === null) return
    const startedAt = performance.now()
    const id = setInterval(
      () => setElapsed((performance.now() - startedAt) / 1000),
      PROGRESS_TICK_MS,
    )
    return () => clearInterval(id)
  }, [batchKey])
  return elapsed
}
