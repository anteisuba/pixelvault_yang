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
 */

import { useLayoutEffect } from 'react'
import {
  Handle,
  Position,
  useStore,
  useUpdateNodeInternals,
  type NodeProps,
} from '@xyflow/react'
import { useTranslations } from 'next-intl'

import { SHOT_TABLE_BOARD } from '@/constants/shot-spec'
import { listShotTableNodes } from '@/lib/shot-table-rows'

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
  useLayoutEffect(() => {
    updateNodeInternals(SHOT_TABLE_BOARD.nodeId)
  }, [rowKey, hiddenKey, updateNodeInternals])

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
