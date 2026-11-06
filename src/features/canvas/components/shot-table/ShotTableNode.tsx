'use client'

/**
 * 镜头表在画布上的那张宽卡（H1，owner 2026-11-06）：卡外上方「镜头表 · 项目名」，卡面就是表。
 *
 * - 卡壳复用 `NodeCardShell`（⛔ 不另起一套卡皮）；名字只读 —— 表是项目级的一张，名字跟项目走。
 * - 每行右缘一颗出口（`row:<镜头卡 id>`），画布从那里拉一根线到这一镜的镜头卡（CanvasV4 合成）。
 *   出口只是线头：⛔ 不能拖线起手（`isConnectable={false}`）。
 * - 行变了（加镜 / 删镜 / 重排 / 关列）要让 RF 重新量一次出口位置，否则线还连在旧的那一行上。
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

export function ShotTableNode({ selected }: NodeProps) {
  const t = useTranslations('StudioNode.shotTable')
  const board = useShotTableBoard()
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
    >
      <ShotTable
        state={board.state}
        characterCards={board.characterCards}
        dispatch={board.dispatch}
        dispatchBatch={board.dispatchBatch}
        onAddShot={board.onAddShot}
        onLocate={board.onLocate}
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
