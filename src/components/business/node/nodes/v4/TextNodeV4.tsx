'use client'

/**
 * 文本节点（`node-canvas-v3-spec.md` §2，画板 `Main.dc.html` / `Expanded.dc.html` /
 * `TextBarModel.dc.html`）。
 *
 * 三态都摆在这里，卡内件在 `./text/`：
 * ① **收起** = 卡就是正文（15px / 1.6、六行截断、不可编辑），名字在卡外上方；
 * ② **选中** = 工具条居中悬卡上 + 助手栏居中在卡下（⛔ 多选时两条都不出）；
 * ③ **展开** = 画中框 640（顶栏角色分段 / Markdown 正文可 @ / 读数 + 快捷键 / 助手栏）。
 *
 * ⛔ 卡面上没有卡头、没有分段控件、没有派生按钮行 —— 那是 v3 的 `NodeV4Shell`，
 * 本片起文本节点不再用它（S11 删）。
 */

import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useTranslations } from 'next-intl'
import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { NODE_ASSISTANT_OP_V4_IDS } from '@/constants/node-assistant-ops'
import { getNodeV4Ports, type NodeSlotTextRole } from '@/constants/node-slots'
import { NODE_V4_CARD } from '@/constants/node-studio'
import { NODE_MEDIA_KIND_IDS } from '@/constants/node-types'
import { renameStableNodeName } from '@/lib/node-display-name'
import { listLiveConnectableSlots } from '@/lib/node-slot-binding'
import { cn } from '@/lib/utils'
import type { MentionChipMedia } from './chrome'
import type { NodeV4, NodeV4TextData } from '@/types/node-workflow'

import { NodeCardShell } from './chrome'
import { useNodeV4Canvas } from './NodeV4Context'
import { buildMentionCandidates, buildMentionTokens } from './NodeV4Mentions'
import { TextAssistantBar } from './text/TextAssistantBar'
import { TextNodeFrame } from './text/TextNodeFrame'
import { TextNodeToolbar } from './text/TextNodeToolbar'
import { TextSplitMenuItem } from './text/TextSplitMenuItem'
import { summarizeTextBody } from './text/text-summary'

/**
 * 端口点四族色（与 `NodeV4Shell` 的 `PORT_CLASS` 同一份实测对比度，见那边的头注）。
 * ⚠ S0 的 `NodeCardShell` 只留了 `ports` 插槽、没给渲染件，所以文本卡自己摆
 * ——四类节点搬完之后应当上收进 chrome（见本片报告）。
 */
const TEXT_PORT_CLASS =
  '!size-2.5 !border !border-background !bg-sky-600 dark:!bg-sky-400'

export { summarizeTextBody }

export function TextNodeV4({ id, data, selected }: NodeProps) {
  const t = useTranslations('StudioNode.v4')
  const tText = useTranslations('StudioNode.v4.text')
  const canvas = useNodeV4Canvas()
  const textData = data as unknown as NodeV4TextData
  const node = canvas.nodes.find((item) => item.id === id) as NodeV4 | undefined
  const cardRef = useRef<HTMLDivElement>(null)
  const [autoMention, setAutoMention] = useState(false)

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
  const ports = getNodeV4Ports(node.data.kind, node.data.subtype)
  const source = canvas.draggingFrom
    ? canvas.nodes.find((item) => item.id === canvas.draggingFrom)
    : undefined
  const litSlots = source
    ? listLiveConnectableSlots(source, node, canvas.edges, {
        nodes: canvas.nodes,
      })
    : []
  const dragging = Boolean(source) && source?.id !== id

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
    <div ref={cardRef} className="relative">
      <TextNodeToolbar
        visible={soloSelected && !expanded}
        onMention={() => {
          setAutoMention(true)
          if (!expanded) canvas.onToggleExpanded(id)
        }}
        onDeriveShotImage={() => canvas.onDeriveFromText(id, 'shotImage')}
        onDeriveVideo={() => canvas.onDeriveFromText(id, 'video')}
        onRename={() =>
          cardRef.current
            ?.querySelector<HTMLElement>('[data-node-rename-trigger]')
            ?.click()
        }
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
        selected={Boolean(selected)}
        expanded={expanded}
        width={NODE_V4_CARD.textCollapsedWidth}
        ports={
          <>
            {ports?.inputs.map((spec) => {
              const lit = litSlots.includes(spec.slot)
              return (
                <Handle
                  key={spec.slot}
                  id={spec.slot}
                  type="target"
                  position={Position.Left}
                  isConnectable={!dragging || lit}
                  data-slot={spec.slot}
                  data-lit={dragging ? (lit ? 'true' : 'false') : 'idle'}
                  aria-label={t(`slots.${spec.slot}`)}
                  className={cn(
                    TEXT_PORT_CLASS,
                    'transition-opacity',
                    dragging && !lit && 'opacity-30',
                    dragging && lit && 'scale-125 opacity-100',
                  )}
                />
              )
            })}
            {ports?.outputs.map((output) => (
              <Handle
                key={output}
                id={output}
                type="source"
                position={Position.Right}
                data-output={output}
                aria-label={t(`outputs.${output}`)}
                className={TEXT_PORT_CLASS}
              />
            ))}
          </>
        }
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

      {/* 画中框是**画布级浮层**：`NodeFrame` 用 `absolute inset-0` 铺满，而节点自己
          是 ReactFlow 的定位元素——不 portal 出去，压暗层与 640 的框就被关进卡里
          （真机 2026-09-10 实拍）。⛔ 不改 `chrome/NodeFrame`，定位归调用方。 */}
      {expanded &&
        typeof document !== 'undefined' &&
        createPortal(
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
              const picked = canvas.nodes.find(
                (item) => item.id === candidate.id,
              )
              // 文本节点粘原文，素材插一枚 `@名字` 胶囊——两条路径分家。
              if (picked?.data.kind === NODE_MEDIA_KIND_IDS.text) {
                handle.insertText(picked.data.body)
              } else {
                handle.insertToken(candidate.name)
              }
            }}
            mediaOf={mediaOf}
            autoMention={autoMention}
          />,
          document.body,
        )}
    </div>
  )
}
