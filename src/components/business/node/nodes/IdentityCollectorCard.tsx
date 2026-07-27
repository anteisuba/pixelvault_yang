'use client'

import Image from 'next/image'
import { useMemo } from 'react'
import { useEdges, useNodes } from '@xyflow/react'
import { Grid2x2, Mic2, UserRound } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  NODE_TYPE_IDS,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import {
  getNodePrimaryMediaUrl,
  getUpstreamNodes,
  isVoiceProfileNode,
} from '@/lib/node-workflow-graph'
import { cn } from '@/lib/utils'
import type { NodeWorkflowEdge, NodeWorkflowNode } from '@/types/node-workflow'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { NodeShell } from './NodeShell'

interface IdentityCollectorCardProps {
  id: string
  /** Presentation type — `characterImage` or `backgroundImage` (legacy type
   *  the unified node's role maps to, same as NodeMediaPreview's `type`). */
  legacyType: NodeWorkflowNodeType
  data: NodeWorkflowNode['data']
  selected?: boolean
}

function getName(
  legacyType: NodeWorkflowNodeType,
  data: NodeWorkflowNode['data'],
) {
  if (legacyType === NODE_TYPE_IDS.characterImage) {
    return data.characterName?.trim() || data.character?.name?.trim()
  }
  if (legacyType === NODE_TYPE_IDS.backgroundImage) {
    return data.backgroundName?.trim()
  }
  return undefined
}

/** S4 write side for the on-card rename (canvas-image-card.md §1), mirroring
 *  `getName` above field-for-field. `nextValue` arrives trimmed and
 *  non-empty — `EditableNodeLabel` already guards an empty submit. */
function commitName(
  legacyType: NodeWorkflowNodeType,
  nodeId: string,
  nextValue: string,
  updateNodeData: (
    id: string,
    patch: Partial<NodeWorkflowNode['data']>,
  ) => void,
): void {
  if (legacyType === NODE_TYPE_IDS.characterImage) {
    updateNodeData(nodeId, { characterName: nextValue })
    return
  }
  if (legacyType === NODE_TYPE_IDS.backgroundImage) {
    updateNodeData(nodeId, { backgroundName: nextValue })
  }
}

/**
 * S4（2026-07-27，canvas-identity-card.md）整卡重写。§0 域定义拍板「身份卡 =
 * 角色的分类锚点」——它不再是图集浏览器：图集网格（缩略图 + 主图星标）整体
 * 删除，换成「▦ N」纯计数 chip；「归属」逻辑本身（referenceAssets 数组、
 * fusedIntoNodeId）完全不动，只是这张卡不再把它画成一排缩略图。
 *
 * §6 明确本轮不做的事，都没做：数据模型改造（打标签/多归属）、上方近场
 * 工具条、展开态管理模态——那些是切片 v2，owner 还没确认。
 *
 * 成分栏（NodeShell.Ingredients，画上游连线摘要）也一并去掉：新域定义下
 * 「找得到」不等于「用连线表达」（§5 已拍板不画边），卡上只留§1 定的四件
 * 信息，成分栏摘要的是图连线关系，跟这四件事是两回事。
 */
export function IdentityCollectorCard({
  id,
  legacyType,
  data,
  selected,
}: IdentityCollectorCardProps) {
  const t = useTranslations('StudioNode.dossier')
  const nodes = useNodes<NodeWorkflowNode>()
  const edges = useEdges<NodeWorkflowEdge>()
  const { updateNodeData } = useNodeWorkflowActions()
  const name = getName(legacyType, data)
  const referenceAssets = useMemo(
    () => data.referenceAssets ?? [],
    [data.referenceAssets],
  )

  const hasVoice = useMemo(() => {
    if (legacyType !== NODE_TYPE_IDS.characterImage) return false
    return getUpstreamNodes(id, edges, nodes).some(isVoiceProfileNode)
  }, [edges, id, legacyType, nodes])

  // 图集（referenceAssets）是收集器卡图片的唯一事实源；mediaUrl 只是它的封面，
  // 通常就是图集里某张图的另一个 url 串。以图集为准去重，mediaUrl 仅在图集
  // 为空时兜底（迁移前老卡只在 mediaUrl 存单图）。
  const galleryUrls = useMemo(() => {
    const fromAssets = [
      ...new Set(
        referenceAssets
          .map((reference) => reference.url.trim())
          .filter(Boolean),
      ),
    ]
    if (fromAssets.length > 0) return fromAssets
    const media = typeof data.mediaUrl === 'string' ? data.mediaUrl.trim() : ''
    return media ? [media] : []
  }, [data.mediaUrl, referenceAssets])

  const nodeCount = galleryUrls.length
  const representativeUrl = getNodePrimaryMediaUrl(data) || galleryUrls[0]
  const isEmpty = !representativeUrl

  return (
    <NodeShell
      nodeId={id}
      type={legacyType}
      selected={selected}
      status={data.status}
      toolbarData={data}
      isCollector
      className={cn(
        'overflow-hidden canvas-card--w-fixed canvas-identity-card',
        isEmpty && 'canvas-card--dashed',
      )}
    >
      <NodeShell.Header
        type={legacyType}
        status={data.status}
        title={name}
        onRenameCommit={(next) =>
          commitName(legacyType, id, next, updateNodeData)
        }
        // 身份卡自己不生成东西，没有生成中/失败态（§2），卡外的头不用盖章。
        hideStatusBadge
        // 族图标要读成圆环（身份族），不是 characterImage/backgroundImage 各自
        // 挂的图片族方形——同一个 isCollector 信号，NodeCardPorts 的端口已经
        // 这样判；标签这颗字形之前漏传，见 NodeShell.tsx 里的说明。
        isCollector
      />

      <div className="canvas-identity-media">
        {representativeUrl ? (
          <Image
            src={representativeUrl}
            alt=""
            fill
            sizes="240px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="canvas-identity-empty">
            <UserRound className="size-8" aria-hidden />
            <p>{t('identityEmptyHint')}</p>
          </div>
        )}

        {!isEmpty ? (
          <div className="canvas-identity-bar">
            <span
              className="canvas-identity-chip"
              aria-label={t('nodeCountAria', { count: nodeCount })}
              title={t('nodeCountAria', { count: nodeCount })}
            >
              <Grid2x2 className="size-3" aria-hidden />
              {nodeCount}
            </span>
            {hasVoice ? (
              <span className="canvas-identity-chip canvas-identity-chip--voice">
                <Mic2 className="size-3" aria-hidden />
                {t('voiceSection')}
              </span>
            ) : (
              <span className="canvas-identity-chip canvas-identity-chip--muted">
                {t('noVoice')}
              </span>
            )}
          </div>
        ) : null}
      </div>
    </NodeShell>
  )
}
