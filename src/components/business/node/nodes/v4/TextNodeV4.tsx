'use client'

/**
 * 文本节点（`node-canvas-v2.md` §2，画板 `Main.dc.html` / `Expanded.dc.html` /
 * `TextBarModel.dc.html`）。
 *
 * 三态都摆在这里，卡内件在 `./text/`：
 * ① **收起** = 卡就是正文（15px / 1.6、六行截断、不可编辑），名字在卡外上方；
 * ② **选中** = 工具条居中悬卡上 + 助手栏居中在卡下（⛔ 多选时两条都不出）；
 * ③ **展开** = 画中框 640（顶栏角色分段 / Markdown 正文可 @ / 读数 + 快捷键 / 助手栏）。
 *
 * ⛔ 卡面上没有卡头、没有分段控件、没有派生按钮行 —— 那是 v3 旧骨架的形状，
 * 它已在 S11 删除，⛔ 不要复活。
 */

import type { NodeProps } from '@xyflow/react'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import type { NodeSlotTextRole } from '@/constants/node-slots'
import { NODE_V4_CARD } from '@/constants/node-studio'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { renameStableNodeName } from '@/lib/node-display-name'
import type { MentionChipMedia } from './chrome'
import type { NodeV4, NodeV4TextData } from '@/types/node-workflow'

import {
  ConnectToShotPopover,
  NodeCardShell,
  portSpecOf,
  flashNodeCard,
  useNodeCardFlash,
} from './chrome'
import {
  buildConnectToShotOps,
  buildConnectToShotTargets,
} from './connect-to-shot-targets'
import { useNodeV4Canvas } from './NodeV4Context'
import { buildMentionCandidates, buildMentionTokens } from './NodeV4Mentions'
import { TextAssistantBar } from './text/TextAssistantBar'
import { TextNodeFrame } from './text/TextNodeFrame'
import { TextNodeToolbar } from './text/TextNodeToolbar'
import { TextSplitMenuItem } from './text/TextSplitMenuItem'
import { summarizeTextBody } from './text/text-summary'

export { summarizeTextBody }

export function TextNodeV4({ id, data, selected }: NodeProps) {
  const t = useTranslations('StudioNode.v4')
  const tText = useTranslations('StudioNode.v4.text')
  const canvas = useNodeV4Canvas()
  const textData = data as unknown as NodeV4TextData
  /** 别人「连到镜头」连到这张卡时那一下高亮（spec §1.13）。 */
  const flashed = useNodeCardFlash(id)
  /** 「连到镜头」列表 = 画布上的视频卡，按镜头带顺序。 */
  const shotTargets = buildConnectToShotTargets({
    nodes: canvas.nodes,
    edges: canvas.edges,
    formatDuration: (seconds) => `${Math.round(seconds)}s`,
  })
  const node = canvas.nodes.find((item) => item.id === id) as NodeV4 | undefined
  const [autoMention, setAutoMention] = useState(false)
  // ⋯ 菜单的「改名」走 `NodeCardShell` 的受控入口（每 +1 进一次编辑态）。
  const [renameRequest, setRenameRequest] = useState(0)

  const tokens = useMemo(
    () => buildMentionTokens(canvas.nodes, id),
    [canvas.nodes, id],
  )
  const candidates = useMemo(
    () =>
      buildMentionCandidates(canvas.nodes, id, (item) =>
        t(`mentionGroups.${item.data.kind}`),
      ),
    [canvas.nodes, id, t],
  )
  const mediaOf = useMemo(() => {
    const byName = new Map<string, MentionChipMedia>()
    for (const item of canvas.nodes) {
      const itemData = item.data
      if (itemData.kind === NODE_MEDIA_KIND_IDS.text) continue
      if (itemData.kind === NODE_MEDIA_KIND_IDS.audio) {
        byName.set(itemData.name, { kind: 'audio' })
        continue
      }
      byName.set(itemData.name, {
        kind: itemData.kind === NODE_MEDIA_KIND_IDS.video ? 'video' : 'image',
        ...(itemData.url ? { thumbnailUrl: itemData.url } : {}),
      })
    }
    return (name: string) => byName.get(name)
  }, [canvas.nodes])

  if (!node) return null

  const expanded = canvas.expandedNodeId === id
  // 多选时两条浮层都收起来 —— 每张卡各弹一条是 v3 被抓到的老毛病
  // （判据与 `NodeV4SelectionToolbar` 同源）。
  const soloSelected = Boolean(selected) && canvas.selectedNodeIds.length <= 1

  const renameNode = (next: string): boolean => {
    const taken = new Set(
      canvas.nodes
        .filter((item) => item.id !== id)
        .map((item) => item.data.name),
    )
    const result = renameStableNodeName(textData.name, next, taken)
    if (!result.ok) return false
    void canvas.onApplyOp({
      op: NODE_ASSISTANT_OP_V4_IDS.setField,
      target: id,
      field: 'name',
      value: result.name,
    })
    return true
  }

  return (
    <div className="relative">
      <TextNodeToolbar
        visible={soloSelected && !expanded}
        onMention={() => {
          setAutoMention(true)
          if (!expanded) canvas.onToggleExpanded(id)
        }}
        onDeriveShotImage={() => canvas.onDeriveFromText(id, 'shotImage')}
        connectPanel={
          <ConnectToShotPopover
            sourceNodeId={id}
            sourceKind={NODE_MEDIA_KIND_IDS.text}
            targets={shotTargets}
            // 顶行「新建镜头」= 原来那条派生（建镜头 + 连成镜头说明）。
            onNew={() => canvas.onDeriveFromText(id, 'video')}
            onConnect={(targetId, slot) => {
              void Promise.resolve(
                canvas.onApplyBatch(
                  buildConnectToShotOps({
                    sourceId: id,
                    targetId,
                    slot,
                    edges: canvas.edges,
                  }),
                ),
              ).then(() => {
                canvas.onFocusNode(targetId)
                flashNodeCard(targetId)
              })
            }}
          />
        }
        onRename={() => setRenameRequest((count) => count + 1)}
        onClone={() =>
          void canvas.onApplyOp({
            op: NODE_ASSISTANT_OP_V4_IDS.addNode,
            kind: node.data.kind,
            subtype: node.data.subtype,
            ...(node.data.shotNo === undefined
              ? {}
              : { shotNo: node.data.shotNo }),
          })
        }
        splitItem={<TextSplitMenuItem node={node} />}
        onDelete={() =>
          void canvas.onApplyOp({
            op: NODE_ASSISTANT_OP_V4_IDS.delete,
            target: id,
          })
        }
      />

      <NodeCardShell
        name={textData.name}
        renameAriaLabel={t('renameNode')}
        onRename={renameNode}
        renameRequest={renameRequest}
        selected={Boolean(selected)}
        expanded={expanded}
        changed={canvas.changedNodeIds.includes(id) || flashed}
        width={NODE_V4_CARD.textCollapsedWidth}
        portSpec={portSpecOf(node)}
      >
        {/* 收起卡 = 正文本身：15px / 1.6、六行截断 + 省略号，⛔ 不可编辑。 */}
        <div
          data-text-collapsed
          onDoubleClick={() => canvas.onToggleExpanded(id)}
          className="px-5 py-4.5"
        >
          <p className="line-clamp-6 text-md leading-relaxed tracking-node-body">
            {textData.body.trim() || tText('empty')}
          </p>
        </div>
      </NodeCardShell>

      {soloSelected && !expanded && (
        <div
          data-text-assistant-bar
          className="absolute top-full left-1/2 z-10 mt-2.5 w-90 -translate-x-1/2"
        >
          <TextAssistantBar nodeId={id} />
        </div>
      )}

      {/* 画中框自己 portal 到 body（`chrome/NodeFrame`），这里只管开合。 */}
      {expanded && (
        <TextNodeFrame
          open={expanded}
          onClose={() => {
            setAutoMention(false)
            canvas.onToggleExpanded(id)
          }}
          nodeId={id}
          title={textData.name}
          body={textData.body}
          role={textData.defaultRole as NodeSlotTextRole | undefined}
          onRoleChange={(role) =>
            void canvas.onApplyOp({
              op: NODE_ASSISTANT_OP_V4_IDS.setField,
              target: id,
              field: 'defaultRole',
              value: role,
            })
          }
          onSave={(body) => canvas.onEditText(id, body)}
          onGenerateImage={() => canvas.onDeriveFromText(id, 'shotImage')}
          tokens={tokens}
          candidates={candidates}
          onMentionSelect={(candidate, handle) => {
            const picked = canvas.nodes.find((item) => item.id === candidate.id)
            // 文本节点粘原文，素材插一枚 `@名字` 胶囊——两条路径分家。
            if (picked?.data.kind === NODE_MEDIA_KIND_IDS.text) {
              handle.insertText(picked.data.body)
            } else {
              handle.insertToken(candidate.name)
            }
          }}
          mediaOf={mediaOf}
          autoMention={autoMention}
        />
      )}
    </div>
  )
}
