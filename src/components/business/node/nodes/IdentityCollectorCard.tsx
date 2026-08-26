'use client'

import { useMemo } from 'react'
import { useEdges, useNodes } from '@xyflow/react'
import { Grid2x2, Mic2, Mountain, UserRound } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useTranslations } from 'next-intl'

import {
  NODE_REVIEW_STATE_IDS,
  NODE_TYPE_IDS,
  type NodeWorkflowNodeType,
} from '@/constants/node-types'
import {
  countPulseInitial,
  countPulseTransition,
  useCountPulse,
} from '@/hooks/node/use-count-pulse'
import {
  getNodePrimaryMediaUrl,
  getUpstreamNodes,
  isVoiceProfileNode,
} from '@/lib/node-workflow-graph'
import {
  buildDisplayNamePatch,
  resolveNodeDisplayName,
} from '@/lib/node-display-name'
import { resolveMediaReviewState } from '@/lib/node-media-review'
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

/**
 * 画布修法 08-A：原实现按 legacyType 分支手抄了一份优先链，绕开了读侧的
 * 机器值守卫——「选已有图」写入口把上传备注常量当名字写进 characterName/
 * backgroundName 时，这张身份卡的头会照单展示。两个 legacyType 各自只有一个
 * 专属身份字段，与共享解析器的优先链结果一致，改走它。
 */
function getName(
  legacyType: NodeWorkflowNodeType,
  data: NodeWorkflowNode['data'],
) {
  if (
    legacyType !== NODE_TYPE_IDS.characterImage &&
    legacyType !== NODE_TYPE_IDS.backgroundImage
  ) {
    return undefined
  }
  return resolveNodeDisplayName(data)
}

/** S4 write side for the on-card rename (canvas-image-card.md §1), mirroring
 *  `getName` above field-for-field. `nextValue` arrives trimmed and
 *  non-empty — `EditableNodeLabel` already guards an empty submit. */
function commitName(
  legacyType: NodeWorkflowNodeType,
  nodeId: string,
  nextValue: string,
  data: NodeWorkflowNode['data'],
  updateNodeData: (
    id: string,
    patch: Partial<NodeWorkflowNode['data']>,
  ) => void,
): void {
  // 包 4.5：写侧收口到共享的 `buildDisplayNamePatch`，与读侧同一个事实源。
  updateNodeData(
    nodeId,
    buildDisplayNamePatch({ role: data.role, type: legacyType }, nextValue),
  )
}

/**
 * 画布修法 05 节（2026-08-26）「名片脸」整卡重写，取代 S4
 * （2026-07-27，canvas-image-card.md）那版「代表图铺满 + 压图玻璃条」。
 * 诊断原文：「长得像照片，谁都会认错」——用户把它当成又一张散图，混进
 * 「照片就是照片」那条规矩管辖的族群。改法是把它彻底摆成**名片**：左侧
 * 84×84 定妆照缩略（不再铺满整卡），右侧库存行（▦N + 音色状态横排，不再
 * 压在图上）——固定 240×84，与声音卡同一个几何（canvas.css「声音卡 / 身份
 * 卡共用：固定宽 240」那条注释，本轮起两族连高度也共用）。
 *
 * 空态与有内容态**同构**：两栏结构不变，左栏换成族图标（角色=人形、
 * 场景=山形，不再共用一个人形），右栏换成提示文案——「占几何不占内容」，
 * 不再是另一套居中铺满的版式（VoiceNode 的空态即是这个模式的先例）。
 *
 * 卡片尺寸从「按图比例算 240–480」改成固定值之后，不再需要
 * `useUpdateNodeInternals`：那是 `LooseImageCard` 的模式，因为它的尺寸在
 * 挂载后会随图片 onLoad 实测异步改变；这里两态共享同一个 CSS 固定尺寸，
 * 从首次渲染起就不会再变，和同一家族的 `VoiceNode`（同样固定 240×84）
 * 一样零消费这个 hook。
 *
 * S4 时代整卡重写的注释一并归档：图集网格早已删除换成「▦ N」纯计数 chip；
 * 旧 `fusedIntoNodeId` 隐藏通路已退役；`referenceAssets` 仍是兼容数据，
 * 等待多归属模型单独落地；成分栏（`NodeShell.Ingredients`）已在刀 2 整体
 * 删除，与本轮无关。
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
  const reducedMotion = useReducedMotion()
  const name = getName(legacyType, data)
  const referenceAssets = useMemo(
    () => data.referenceAssets ?? [],
    [data.referenceAssets],
  )

  // ⛔ 不可变契约 2（packet-3-identity.md）：这条取数逻辑不动——🎙 由上游音色
  // 边推出，不是身份卡自己的字段。
  const hasVoice = useMemo(() => {
    if (legacyType !== NODE_TYPE_IDS.characterImage) return false
    return getUpstreamNodes(id, edges, nodes).some(isVoiceProfileNode)
  }, [edges, id, legacyType, nodes])

  // 图集（referenceAssets）是收集器卡图片的唯一事实源；mediaUrl 只是它的封面，
  // 通常就是图集里某张图的另一个 url 串。以图集为准去重，mediaUrl 仅在图集
  // 为空时兜底（迁移前老卡只在 mediaUrl 存单图）。
  // ⛔ 不可变契约 2：▦ N 读 referenceAssets——这条取数逻辑不动。
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
  // C · 计数回执（packet-3-identity.md）：▦N 在数值增加时播放一次轻脉冲。
  const pulseKey = useCountPulse(nodeCount)

  /**
   * 画布修法 08-B 核验发现的缺口：`LooseImageCard`（散图/镜头图/特写）包 4
   * 就已经把审核态接进卡边色，这张身份卡（角色/场景）当时漏接——封面图待审
   * / 被打回时卡面完全没有标记，用户只能等生成那一刻的 toast。
   *
   * 补法与 `LooseImageCard` 同一套：查代表图（卡面实际显示的那张）的审核
   * 状态，映射成 `NodeShell` 既有的 `data-status` 通用规则吃的两个字面量
   * ——不新造视觉，canvas.css 里 `.canvas-card[data-status='awaiting-review'/
   * 'rejected']` 的描边规则已经在，只是这张卡此前没喂给它。
   */
  const reviewState = resolveMediaReviewState(data, representativeUrl)
  const cardStatus =
    reviewState === NODE_REVIEW_STATE_IDS.awaitingReview
      ? 'awaiting-review'
      : reviewState === NODE_REVIEW_STATE_IDS.rejected
        ? 'rejected'
        : data.status

  // B · 空态分家：角色空态人形、场景空态山形——不再共用一个 UserRound。
  const EmptyIcon =
    legacyType === NODE_TYPE_IDS.backgroundImage ? Mountain : UserRound

  return (
    <NodeShell
      nodeId={id}
      type={legacyType}
      selected={selected}
      status={cardStatus}
      toolbarData={data}
      isCollector
      /**
       * **卡只出不进**（owner 2026-08-10「连线这个可以作废了」）。入卡的边已经
       * 不画（见 `StudioNodeWorkbench` 的 `renderedEdges`），入端口就必须一起撤 ——
       * 留着它，用户从别的节点拉一条线过来会**什么都看不到**，落进
       * `node-connection-rules` 头注点名的那个坑：「静默失败，且和端口坏掉长得
       * 一模一样」。
       *
       * 素材现在靠**拖进卡**（阶段 8-b）与「从画布选择」入卡，两条都有回执。
       * ⛔ 出端口不动 —— `卡 → 视频/镜头` 是 owner 明确要留的那条。
       */
      showTargetHandle={false}
      className={cn(
        'canvas-card--w-fixed canvas-identity-card',
        isEmpty && 'canvas-card--dashed',
      )}
    >
      <NodeShell.Header
        type={legacyType}
        status={data.status}
        title={name}
        onRenameCommit={(next) =>
          commitName(legacyType, id, next, data, updateNodeData)
        }
        // 身份卡自己不生成东西，没有生成中/失败态（§2），卡外的头不用盖章。
        hideStatusBadge
        // 族图标要读成圆环（身份族），不是 characterImage/backgroundImage 各自
        // 挂的图片族方形——同一个 isCollector 信号，NodeCardPorts 的端口已经
        // 这样判；标签这颗字形之前漏传，见 NodeShell.tsx 里的说明。
        isCollector
      />

      {/* 名片脸：左侧定妆照缩略 + 右侧库存行，与 VoiceNode 同一个「封面 + 正文」
          结构（canvas.css 里的「声音卡 / 身份卡共用：固定宽 240」延伸到这里连
          高度也共用）。 */}
      <div className="flex overflow-hidden rounded-[inherit]">
        <div className="canvas-identity-cover">
          {representativeUrl ? (
            // 定妆照来自 R2/生成结果，不吃 next/image 的静态 host 契约——同
            // VoiceNode / CastCard 的 raw-img 惯例（原 next/image 早已带
            // unoptimized，本来就没有真做优化）。
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={representativeUrl}
              alt=""
              className="size-full object-cover"
              draggable={false}
            />
          ) : (
            <div
              className="flex size-full items-center justify-center"
              style={{
                background: 'var(--canvas-fill-control)',
                color: 'var(--canvas-ink-muted)',
              }}
            >
              <EmptyIcon className="size-6" aria-hidden />
            </div>
          )}
        </div>

        <div className="canvas-identity-body">
          {isEmpty ? (
            <p className="canvas-identity-empty-hint">
              {t('identityEmptyHint')}
            </p>
          ) : (
            <>
              <motion.span
                key={pulseKey}
                initial={countPulseInitial(pulseKey)}
                animate={{ scale: 1 }}
                transition={countPulseTransition(reducedMotion)}
                className="canvas-identity-chip"
                aria-label={t('nodeCountAria', { count: nodeCount })}
                title={t('nodeCountAria', { count: nodeCount })}
              >
                <Grid2x2 className="size-3" aria-hidden />
                {nodeCount}
              </motion.span>
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
            </>
          )}
        </div>
      </div>
    </NodeShell>
  )
}
