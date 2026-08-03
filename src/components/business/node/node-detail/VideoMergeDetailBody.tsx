'use client'

import { useCallback } from 'react'
import { Layers } from 'lucide-react'
import { useTranslations } from 'next-intl'

import {
  NODE_GENERATION_STATUS_IDS,
  NODE_STATUS_IDS,
  NODE_TYPE_IDS,
} from '@/constants/node-types'
import { useDownstreamUses } from '@/hooks/node/use-downstream-uses'
import { useVideoMergeAction } from '@/hooks/node/use-video-merge-action'
import type { NodeWorkflowNode } from '@/types/node-workflow'

import { useNodeWorkflowActions } from '../NodeWorkflowActionsContext'
import { NodeProgressState } from '../nodes/NodeProgressState'
import { DraftNumberField } from './DraftNumberField'
import { EvidenceDrawer, EvidenceRow } from './EvidenceDrawer'
import { RelationsStrip } from './RelationsStrip'
import { SpecSummaryButton } from './SpecSummaryButton'
import type { NodeDetailBodyProps } from './registry'
import type { NodeDetailSlots } from './slots'

/** 逐段裁剪的秒数上下界（沿用迁移前那两个输入框的 min/max）。 */
const TRIM_MIN_SEC = 0
const TRIM_MAX_SEC = 600

/**
 * 视频合并（`videoMerge`）—— 契约 §6：`合成预览` / `上游片段列表` /
 * `逐段裁剪`（账本 ②）/ 下游反查 / `约束 + 成本` / `开始合并`。
 *
 * ⚠ **逐段裁剪归编排台不归素材架**（账本 ② 已拍板）：`mergeSettings` 是本节点
 * 可写的状态，而且它决定后端走哪条路（有任何一段裁剪 → 走裁剪合成端点，
 * 否则走直接合并）。素材架回答「材料从哪来」——那是上游片段列表；
 * 编排台回答「这次怎么做」——那是裁多少。
 *
 * ⚠ 裁剪收进**一颗按钮**（`SpecSummaryButton` 首落）。原来它是右轨里一整块
 * 带边框的面板，每段两个输入框纵向堆着 —— 三段上游就是 6 个输入框 + 3 个 URL 行，
 * 主动作被推到滚动线以下。现在标签就是摘要（「3/8 段 · 已裁 2 段」），点开才是那些格子。
 */
export function VideoMergeDetailBody({
  nodeId,
  data,
  children,
}: NodeDetailBodyProps & {
  children: (slots: NodeDetailSlots) => React.ReactNode
}) {
  const t = useTranslations('StudioNode.videoMerge')
  const tDetail = useTranslations('StudioNode.nodeDetail')
  const tTypes = useTranslations('StudioNode.nodeTypes')
  const { updateNodeData } = useNodeWorkflowActions()
  const uses = useDownstreamUses(nodeId)

  // ⚠ hook 要一个 `NodeWorkflowNode`，而槽表提供者只拿到 nodeId + data。
  // 合一个出来是安全的：`useVideoMergeAction` 只读 `id` 与 `data`，
  // 画布上的真节点仍由 React Flow 持有。
  const node: NodeWorkflowNode = {
    id: nodeId,
    type: NODE_TYPE_IDS.videoMerge,
    position: { x: 0, y: 0 },
    data,
  }
  const {
    upstreamVideoUrls,
    clipCount,
    maxClips,
    clipOverrides,
    hasAnyTrim,
    canMerge,
    isMerging,
    disabledReason: mergeDisabledReason,
    handleMerge,
  } = useVideoMergeAction(node)

  const mediaUrl = typeof data.mediaUrl === 'string' ? data.mediaUrl : null
  const generationStatus =
    data.generationStatus ??
    (mediaUrl
      ? NODE_GENERATION_STATUS_IDS.success
      : NODE_GENERATION_STATUS_IDS.idle)

  // hook 给的是 UI 无关的形状；工具条那颗紧凑「合成」按钮把同一个形状翻成一句
  // 短 tooltip，这里翻成整句。
  const disabledReason = mergeDisabledReason
    ? mergeDisabledReason.kind === 'tooFewClips'
      ? t('errors.tooFewClips', { min: mergeDisabledReason.min })
      : mergeDisabledReason.kind === 'tooManyClips'
        ? t('errors.tooManyClips', { max: mergeDisabledReason.max })
        : t('trim.rangeWarning')
    : null

  const handleTrimChange = useCallback(
    (url: string, field: 'startSec' | 'endSec', next: number | undefined) => {
      const existingClips = data.mergeSettings?.clips ?? []
      const filtered = existingClips.filter((clip) => clip.url !== url)
      const previousOverride = existingClips.find((clip) => clip.url === url)
      const updated = {
        url,
        startSec: field === 'startSec' ? next : previousOverride?.startSec,
        endSec: field === 'endSec' ? next : previousOverride?.endSec,
      }
      // 两端都清空时整条抹掉 —— 保持 node.data 干净，也让 `hasAnyTrim`
      // 能短路回「直接合并」那条路由。
      const isEmpty =
        updated.startSec === undefined && updated.endSec === undefined
      const nextClips = isEmpty ? filtered : [...filtered, updated]

      updateNodeData(nodeId, {
        mergeSettings: nextClips.length > 0 ? { clips: nextClips } : undefined,
      })
    },
    [data.mergeSettings, nodeId, updateNodeData],
  )

  const handleClear = useCallback(() => {
    updateNodeData(nodeId, {
      mediaUrl: undefined,
      mediaLabel: undefined,
      generationStatus: NODE_GENERATION_STATUS_IDS.idle,
      status: NODE_STATUS_IDS.idle,
      generationError: undefined,
    })
  }, [nodeId, updateNodeData])

  const trimmedCount = (data.mergeSettings?.clips ?? []).length
  // R8：只放值，不写字段名。
  const summaryParts = [
    t('clipCount', { count: clipCount, max: maxClips }),
    trimmedCount > 0 ? t('trim.trimmedCount', { count: trimmedCount }) : '',
  ].filter(Boolean)

  return (
    <>
      {children({
        stage: (
          <div className="canvas-detail-stage">
            <div className="canvas-detail-well">
              {mediaUrl ? (
                <video
                  src={mediaUrl}
                  className="h-full w-full object-cover"
                  controls
                  muted
                />
              ) : (
                <Layers
                  aria-hidden
                  className="canvas-detail-well-glyph size-12"
                  strokeWidth={1.25}
                />
              )}
              {isMerging ? (
                <NodeProgressState
                  indicator="breath"
                  veiled
                  label={t('merging')}
                />
              ) : null}
              {mediaUrl && !isMerging ? (
                <button
                  type="button"
                  onClick={handleClear}
                  className="canvas-detail-well-corner absolute left-auto right-2 top-2"
                >
                  {t('clear')}
                </button>
              ) : null}
            </div>
          </div>
        ),

        // 素材架 = 上游片段列表：本族的「材料」就是连进来的那几段视频，
        // 而且它们**不可在这里增删**（增删靠画布连线），所以只读列出。
        // R6：只读派生值不穿控件壳。
        rack:
          clipCount === 0 ? (
            <p className="canvas-detail-line">{t('upstreamEmpty')}</p>
          ) : (
            <ol className="canvas-detail-stack">
              {upstreamVideoUrls.map((url, index) => (
                <li key={url} className="flex items-center gap-2 text-xs">
                  <span className="w-4 shrink-0 text-right font-semibold text-node-muted">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-node-muted">
                    {url}
                  </span>
                </li>
              ))}
            </ol>
          ),

        desk: (
          <div className="flex flex-wrap items-center gap-2">
            <SpecSummaryButton
              parts={summaryParts}
              emptyLabel={t('trim.editLabel')}
              label={t('trim.editLabel')}
              disabled={clipCount === 0 || isMerging}
            >
              {/* 二级面：这里才允许 11px 弱化灰字标题（R1）。 */}
              <div className="space-y-3">
                <p className="text-2xs font-semibold text-node-muted">
                  {t('trim.editLabel')}
                </p>
                {upstreamVideoUrls.map((url, index) => {
                  const override = clipOverrides.get(url)
                  const rangeInvalid =
                    typeof override?.startSec === 'number' &&
                    typeof override?.endSec === 'number' &&
                    override.endSec <= override.startSec
                  return (
                    <div key={url} className="space-y-1.5">
                      <p className="truncate text-2xs text-node-muted">
                        {index + 1} · {url}
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <DraftNumberField
                          value={override?.startSec}
                          onCommit={(next) =>
                            handleTrimChange(url, 'startSec', next)
                          }
                          min={TRIM_MIN_SEC}
                          max={TRIM_MAX_SEC}
                          label={t('trim.startLabelA11y', { n: index + 1 })}
                          placeholder={t('trim.startPlaceholder')}
                          invalid={rangeInvalid}
                        />
                        <DraftNumberField
                          value={override?.endSec}
                          onCommit={(next) =>
                            handleTrimChange(url, 'endSec', next)
                          }
                          min={TRIM_MIN_SEC}
                          max={TRIM_MAX_SEC}
                          label={t('trim.endLabelA11y', { n: index + 1 })}
                          placeholder={t('trim.endPlaceholder')}
                          invalid={rangeInvalid}
                        />
                      </div>
                      {rangeInvalid ? (
                        <p className="text-2xs leading-4 text-node-status-failed">
                          {t('trim.rangeWarning')}
                        </p>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </SpecSummaryButton>
          </div>
        ),

        relations: (
          <RelationsStrip
            uses={uses}
            emptyLabel={tDetail('relationsEmptyMerge')}
            labelOf={(use) => use.name ?? tTypes(use.type)}
            ariaOf={(name) => tDetail('focusOnCanvas', { name })}
          />
        ),

        evidence: (
          <EvidenceDrawer
            label={tDetail('sendPreview')}
            count={data.generationError ? 4 : 3}
          >
            {data.generationError &&
            generationStatus === NODE_GENERATION_STATUS_IDS.error ? (
              <EvidenceRow
                label={tDetail('fieldLastFailure')}
                value={data.generationError}
                tone="error"
              />
            ) : null}
            <EvidenceRow
              label={tDetail('fieldClips')}
              value={t('clipCount', { count: clipCount, max: maxClips })}
              dim={clipCount === 0}
            />
            <EvidenceRow
              label={tDetail('fieldTrim')}
              value={
                trimmedCount > 0
                  ? t('trim.trimmedCount', { count: trimmedCount })
                  : tDetail('valueUnset')
              }
              dim={trimmedCount === 0}
            />
            {/* ⚠ 这一行是本族唯一的「约束」证据：有裁剪就换一条后端路由。
                原来它是个只在 `hasAnyTrim` 时才冒出来的提示块 —— 会不会换路由
                这件事应当**恒可查**，不是只在触发时才说一次。 */}
            <EvidenceRow
              label={tDetail('fieldRoute')}
              value={hasAnyTrim ? t('trim.composeHint') : t('hint')}
            />
          </EvidenceDrawer>
        ),

        dock: (
          <div className="canvas-detail-dock-bar">
            <p
              className="canvas-detail-dock-reason"
              data-tone={disabledReason ? 'error' : undefined}
            >
              {isMerging ? t('merging') : (disabledReason ?? '')}
            </p>
            <button
              type="button"
              className="canvas-detail-primary"
              disabled={!canMerge}
              onClick={() => void handleMerge()}
            >
              {mediaUrl ? t('merge.regenerate') : t('merge.run')}
            </button>
          </div>
        ),
      })}
    </>
  )
}
